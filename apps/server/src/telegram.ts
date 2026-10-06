/**
 * Telegram bot: notification center and chat with the agent. Security-sensitive.
 * - Long polling (getUpdates): no public URL, nothing to expose.
 * - Only paired chats are served (data/secrets/telegram.json); pairing needs a one-time code
 *   created from the web app. Everyone else gets no answer at all.
 * - Telegram is not end-to-end encrypted for bots: every outgoing text goes through redact().
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { join } from "node:path"

import { asksToConfirm, type Chat, type Occurrence, redact, stripActions } from "@autocratico/core"
import { Bot, type Context, InlineKeyboard } from "grammy"

import { type Claude, friendlyError } from "./claude.ts"
import type { Config } from "./config.ts"
import type { GmailLinks } from "./gmail-links.ts"
import { locks, readJson, writeSecret } from "./files.ts"
import type { Inbox, Upload } from "./inbox.ts"
import type { Button, Jobs, Notifier } from "./jobs.ts"
import type { Changes } from "./changes.ts"
import { finishAnswer } from "./chat-actions.ts"
import type { Reminders } from "./reminders.ts"
import type { Store } from "./store.ts"
import type { Transcriber } from "./transcribe.ts"

const MAX_MESSAGE = 4000
const EDIT_EVERY_MS = 1500
const PAIRING_TTL_MS = 10 * 60_000

type Paired = { id: number; name: string; paired: string }
type TelegramFile = { chats: Paired[]; pairing: { hash: string; expires: number } | null }

const TEXT = {
  it: {
    help: [
      "Comandi:",
      "/oggi: scadenze di oggi, della settimana e arretrate",
      "/scadenze [giorni]: prossime scadenze (default 30)",
      "/casi: pratiche aperte",
      "/inbox: ultimi documenti arrivati",
      "/fatto <id>: segna fatta la prossima scadenza con quell'id",
      "/salva <testo>: aggiunge il testo all'inbox",
      "/promemoria: promemoria in attesa (per crearne uno, chiedilo: «ricordami tra 2 ore di…»)",
      "/nuova: nuova conversazione",
      "/stato: stato del server",
      "",
      "Scrivi o manda un vocale per parlare con l'agente (trascritto sul server, mai fuori). Inoltra messaggi o vocali, o manda file/foto, per aggiungerli all'inbox.",
    ].join("\n"),
    paired: "Collegato. Riceverai qui notifiche e promemoria.\n\n",
    received: (n: number) => `Ricevuto (${n} file). Lo elaboro tra poco e ti avviso.`,
    saved: "Aggiunto all'inbox.",
    nothing: "Niente in vista.",
    overdue: "Arretrate",
    week: "Prossimi 7 giorni",
    upcoming: (n: number) => `Prossimi ${n} giorni`,
    cases: "Pratiche aperte",
    inbox: "Inbox",
    doneOk: (t: string) => `✓ Segnata come fatta: ${t}`,
    doneMissing: "Nessuna scadenza aperta con quell'id.",
    newChat: "Nuova conversazione.",
    thinking: "…",
    yes: "✅ Sì",
    no: "✖️ No",
    confirmYes: "Sì, confermo",
    confirmNo: "No, lascia com'è",
    noClaude: "L'agente non è disponibile su questo server.",
    tooBig: "File troppo grande per Telegram (max 20 MB): caricalo dalla web app.",
    heard: (t: string) => `🎙️ ${t}`,
    transcript: "Trascrizione del vocale:",
    reminders: "Promemoria in attesa",
    noReminders: "Nessun promemoria in attesa.",
    cancel: "Annulla",
    cancelled: "Promemoria annullato.",
    ok: "Fatto ✓",
    snoozed: (when: string) => `Ti riscrivo ${when}.`,
    noSpeech: "Trascrizione vocale non configurata sul server.",
    empty: "Non ho capito niente nel vocale.",
    asrFailed: (e: string) => `Trascrizione non riuscita: ${e}`,
    status: (s: string) => `Stato\n${s}`,
    inDays: (n: number) => (n === 0 ? "oggi" : n === 1 ? "domani" : `tra ${n} g`),
    ago: (n: number) => `${n} g fa`,
  },
  en: {
    help: [
      "Commands:",
      "/oggi: today's, this week's and overdue deadlines",
      "/scadenze [days]: upcoming deadlines (default 30)",
      "/casi: open cases",
      "/inbox: latest items",
      "/fatto <id>: mark the next deadline with that id as done",
      "/salva <text>: add the text to the inbox",
      "/promemoria: pending reminders (to set one, just ask: \"remind me in 2 hours to…\")",
      "/nuova: new conversation",
      "/stato: server status",
      "",
      "Write or send a voice message to talk to the agent (transcribed on the server, never elsewhere). Forward messages or voice notes, or send files/photos, to add them to the inbox.",
    ].join("\n"),
    paired: "Paired. Notifications and reminders will arrive here.\n\n",
    received: (n: number) => `Received (${n} files). I'll process it shortly and let you know.`,
    saved: "Added to the inbox.",
    nothing: "Nothing coming up.",
    overdue: "Overdue",
    week: "Next 7 days",
    upcoming: (n: number) => `Next ${n} days`,
    cases: "Open cases",
    inbox: "Inbox",
    doneOk: (t: string) => `✓ Marked as done: ${t}`,
    doneMissing: "No open deadline with that id.",
    newChat: "New conversation.",
    thinking: "…",
    yes: "✅ Yes",
    no: "✖️ No",
    confirmYes: "Yes, confirm",
    confirmNo: "No, leave it as it is",
    noClaude: "The agent is not available on this server.",
    tooBig: "File too large for Telegram (20 MB max): upload it from the web app.",
    heard: (t: string) => `🎙️ ${t}`,
    transcript: "Voice message transcript:",
    reminders: "Pending reminders",
    noReminders: "No pending reminders.",
    cancel: "Cancel",
    cancelled: "Reminder cancelled.",
    ok: "Done ✓",
    snoozed: (when: string) => `I'll write again ${when}.`,
    noSpeech: "Speech to text is not configured on the server.",
    empty: "I could not make out anything in the voice message.",
    asrFailed: (e: string) => `Transcription failed: ${e}`,
    status: (s: string) => `Status\n${s}`,
    inDays: (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} d`),
    ago: (n: number) => `${n} d ago`,
  },
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex")
}

/** Telegram gets plain text: drop Markdown emphasis, keep lists and line breaks. */
export function plain(md: string): string {
  return md
    .replace(/```[a-z]*\n?/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
}

export function outgoing(text: string): string[] {
  const clean = redact(plain(text)).trim() || "…"
  const parts: string[] = []
  let rest = clean
  while (rest.length > MAX_MESSAGE) {
    const cut = rest.lastIndexOf("\n", MAX_MESSAGE) > MAX_MESSAGE / 2 ? rest.lastIndexOf("\n", MAX_MESSAGE) : MAX_MESSAGE
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  parts.push(rest)
  return parts
}

type Deps = {
  config: Config
  store: Store
  inbox: Inbox
  claude: Claude
  reminders: Reminders
  transcriber: Transcriber
  changes: Changes
  gmailLinks: GmailLinks
  jobs: () => Jobs | null
}

export class Telegram implements Notifier {
  readonly bot: Bot
  readonly #file: string
  readonly #d: Deps
  #busy = new Set<number>()

  constructor(token: string, deps: Deps) {
    this.bot = new Bot(token)
    this.#d = deps
    this.#file = join(deps.config.data, "secrets", "telegram.json")
    this.#routes()
  }

  get #t() {
    return TEXT[this.#d.config.locale]
  }

  #read(): TelegramFile {
    return readJson<TelegramFile>(this.#file, { chats: [], pairing: null })
  }

  chats(): Paired[] {
    return this.#read().chats
  }

  /** One-time code for `/start <code>` (8 digits, 10 minutes). */
  startPairing(): Promise<string> {
    return locks.run(this.#file, () => {
      const code = String(randomInt(0, 100_000_000)).padStart(8, "0")
      const f = this.#read()
      f.pairing = { hash: sha256(code), expires: Date.now() + PAIRING_TTL_MS }
      writeSecret(this.#file, f)
      return code
    })
  }

  unpair(id: number): Promise<void> {
    return locks.run(this.#file, () => {
      const f = this.#read()
      f.chats = f.chats.filter((c) => c.id !== id)
      writeSecret(this.#file, f)
    })
  }

  #pair(code: string, id: number, name: string): Promise<boolean> {
    return locks.run(this.#file, () => {
      const f = this.#read()
      const p = f.pairing
      if (!p || Date.now() > p.expires) return false
      const a = Buffer.from(p.hash)
      const b = Buffer.from(sha256(code.trim()))
      // Any attempt uses the code up: guessing gets one try per code shown in the web app.
      f.pairing = null
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        writeSecret(this.#file, f)
        return false
      }
      f.chats = [...f.chats.filter((c) => c.id !== id), { id, name, paired: new Date().toISOString() }]
      writeSecret(this.#file, f)
      return true
    })
  }

  #allowed(ctx: Context): boolean {
    const id = ctx.chat?.id
    return id !== undefined && ctx.chat?.type === "private" && this.chats().some((c) => c.id === id)
  }

  async #reply(ctx: Context, text: string, buttons?: Button[][]) {
    const parts = outgoing(text)
    for (const [i, p] of parts.entries()) {
      const markup = buttons && i === parts.length - 1 ? keyboard(buttons) : undefined
      await ctx.reply(p, { reply_markup: markup, link_preview_options: { is_disabled: true } })
    }
  }

  async notify(text: string, buttons?: Button[][]): Promise<void> {
    for (const chat of this.chats()) {
      const parts = outgoing(text)
      for (const [i, p] of parts.entries()) {
        const markup = buttons && i === parts.length - 1 ? keyboard(buttons) : undefined
        try {
          await this.bot.api.sendMessage(chat.id, p, { reply_markup: markup, link_preview_options: { is_disabled: true } })
        } catch (e) {
          console.error(`telegram: send to a paired chat failed: ${(e as Error).message}`)
        }
      }
    }
  }

  start() {
    this.bot.catch((e) => console.error(`telegram: ${e.message}`))
    void this.bot.start({
      drop_pending_updates: false,
      allowed_updates: ["message", "callback_query"],
      onStart: (me) => console.log(`telegram: polling as @${me.username}`),
    })
  }

  async stop() {
    await this.bot.stop()
  }

  // ---------- handlers ----------

  #routes() {
    const bot = this.bot
    const t = () => this.#t

    bot.command("start", async (ctx) => {
      if (ctx.chat.type !== "private") return
      const code = ctx.match.trim()
      if (this.#allowed(ctx)) return this.#reply(ctx, t().help)
      if (!code) return
      const name = [ctx.from?.first_name, ctx.from?.username && `@${ctx.from.username}`].filter(Boolean).join(" ")
      if (await this.#pair(code, ctx.chat.id, name)) await this.#reply(ctx, t().paired + t().help)
    })

    // Everything below is for paired chats only; others are ignored without an answer.
    bot.use(async (ctx, next) => {
      if (this.#allowed(ctx)) await next()
    })

    bot.command(["aiuto", "help"], (ctx) => this.#reply(ctx, t().help))
    bot.command("oggi", (ctx) => this.#reply(ctx, this.#agenda(7, true)))
    bot.command("scadenze", (ctx) => {
      const n = Math.min(365, Math.max(1, Number.parseInt(ctx.match, 10) || 30))
      return this.#reply(ctx, this.#agenda(n, false))
    })
    bot.command("casi", (ctx) => {
      const open = this.#d.store.data().cases.filter((c) => c.done < c.total || !/chius|closed|done/i.test(c.status))
      const lines = open.map((c) => `• ${c.title}${c.status ? ` — ${c.status}` : ""} (${c.done}/${c.total})`)
      return this.#reply(ctx, lines.length ? `${t().cases}\n${lines.join("\n")}` : t().nothing)
    })
    bot.command("inbox", (ctx) => {
      const items = this.#d.inbox.list().slice(0, 8)
      const lines = items.map((i) => `• [${i.status}] ${i.title}${i.outcome ? ` — ${i.outcome}` : ""}`)
      return this.#reply(ctx, lines.length ? `${t().inbox}\n${lines.join("\n")}` : t().nothing)
    })
    bot.command("fatto", async (ctx) => {
      const id = ctx.match.trim()
      const o = this.#d.store
        .data()
        .agenda.filter((x) => !x.done_on && (x.key === id || x.id === id))
        .sort((a, b) => Math.abs(a.days) - Math.abs(b.days))[0]
      if (!o) return this.#reply(ctx, t().doneMissing)
      await this.#d.store.setDone(o.key, true)
      return this.#reply(ctx, t().doneOk(o.title))
    })
    bot.command("salva", async (ctx) => {
      if (!ctx.match.trim()) return this.#reply(ctx, t().help)
      await this.#ingest(ctx, { text: ctx.match })
      return this.#reply(ctx, t().saved)
    })
    bot.command("promemoria", (ctx) => {
      const list = this.#d.reminders.pending()
      if (!list.length) return this.#reply(ctx, t().noReminders)
      const lines = list.map((r) => `• ${this.#d.reminders.format(r.at, this.#d.config.locale)} — ${r.text}`)
      const buttons = list.slice(0, 8).map((r) => [{ text: `✕ ${t().cancel}: ${r.text.slice(0, 30)}`, data: `rcancel:${r.id}` }])
      return this.#reply(ctx, `${t().reminders}\n${lines.join("\n")}`, buttons)
    })

    bot.command("nuova", async (ctx) => {
      const chat = this.#chat(ctx.chat.id)
      await this.#d.store.saveChat({ ...chat, session: null, messages: [] })
      return this.#reply(ctx, t().newChat)
    })
    bot.command("stato", (ctx) => {
      const jobs = this.#d.jobs()
      const lines = (["gmail", "triage", "reminders", "digest", "backup"] as const).map((name) => {
        const last = jobs?.last(name)
        return `• ${name}: ${last ? `${last.ok ? "ok" : "ERR"} ${last.started.slice(0, 16).replace("T", " ")} — ${last.summary}` : "-"}`
      })
      const inbox = this.#d.inbox.list()
      lines.push(`• inbox: ${inbox.filter((i) => i.status === "new").length} new, ${inbox.filter((i) => i.status === "failed").length} failed`)
      return this.#reply(ctx, t().status(lines.join("\n")))
    })

    bot.callbackQuery(/^done:(.+@\d{4}-\d{2}-\d{2})$/, async (ctx) => {
      const key = ctx.match[1]
      const o = this.#d.store.data().agenda.find((x) => x.key === key)
      if (o) await this.#d.store.setDone(key, true)
      await ctx.answerCallbackQuery({ text: o ? t().doneOk(redact(o.title)).slice(0, 190) : t().doneMissing })
    })

    // Yes/no under an answer that asks to confirm a change: the choice goes to the agent as a message.
    bot.callbackQuery(/^confirm:(yes|no)$/, async (ctx) => {
      const text = ctx.match[1] === "yes" ? t().confirmYes : t().confirmNo
      await ctx.editMessageReplyMarkup().catch(() => undefined)
      await ctx.answerCallbackQuery({ text })
      return this.#converse(ctx, text)
    })

    bot.callbackQuery(/^rdone:(\w+)$/, async (ctx) => {
      await ctx.editMessageReplyMarkup().catch(() => undefined)
      await ctx.answerCallbackQuery({ text: t().ok })
    })
    bot.callbackQuery(/^rcancel:(\w+)$/, async (ctx) => {
      const r = await this.#d.reminders.cancel(ctx.match[1])
      await ctx.answerCallbackQuery({ text: r ? t().cancelled : t().noReminders })
    })
    bot.callbackQuery(/^snooze:(\w+):(60|tomorrow)$/, async (ctx) => {
      const old = this.#d.reminders.get(ctx.match[1])
      if (!old) return ctx.answerCallbackQuery({ text: t().noReminders })
      const at = ctx.match[2] === "60" ? new Date(Date.now() + 3_600_000).toISOString() : tomorrowAt9(this.#d.config.timeZone)
      const r = await this.#d.reminders.add(at, old.text, "telegram")
      await ctx.editMessageReplyMarkup().catch(() => undefined)
      await ctx.answerCallbackQuery({ text: r ? t().snoozed(this.#d.reminders.format(r.at, this.#d.config.locale)) : t().noReminders })
    })

    bot.on(["message:document", "message:photo"], async (ctx) => {
      const doc = ctx.message.document
      const photo = ctx.message.photo?.at(-1)
      const size = doc?.file_size ?? photo?.file_size ?? 0
      if (size > 20 * 1024 * 1024) return this.#reply(ctx, t().tooBig)
      const name = doc?.file_name ?? `photo-${ctx.message.date}.jpg`
      await this.#ingest(ctx, { text: ctx.message.caption, files: [{ name, data: await this.#download((doc ?? photo)!.file_id) }] })
      return this.#reply(ctx, t().received(1))
    })

    // Voice: transcribed locally, then a question for the agent; a forwarded voice note goes to the inbox.
    bot.on(["message:voice", "message:audio"], async (ctx) => {
      const media = ctx.message.voice ?? ctx.message.audio!
      if ((media.file_size ?? 0) > 20 * 1024 * 1024) return this.#reply(ctx, t().tooBig)
      if (!this.#d.transcriber.available) return this.#reply(ctx, t().noSpeech)
      await ctx.replyWithChatAction("typing").catch(() => undefined)
      const name = ctx.message.audio?.file_name ?? `voice-${ctx.message.date}.ogg`
      const data = await this.#download(media.file_id)
      let text: string
      try {
        text = await this.#d.transcriber.transcribe(data, name)
      } catch (e) {
        return this.#reply(ctx, t().asrFailed((e as Error).message))
      }
      if (!text) return this.#reply(ctx, t().empty)
      if (ctx.message.forward_origin || ctx.message.caption) {
        const caption = ctx.message.caption ? `${ctx.message.caption}\n\n` : ""
        await this.#ingest(ctx, { text: `${caption}${t().transcript}\n${text}`, files: [{ name, data }] })
        return this.#reply(ctx, `${t().heard(text)}\n\n${t().saved}`)
      }
      await this.#reply(ctx, t().heard(text))
      return this.#converse(ctx, text)
    })

    bot.on("message:text", async (ctx) => {
      // Forwarded messages are documents to file, not questions.
      if (ctx.message.forward_origin) {
        const o = ctx.message.forward_origin
        const from =
          o.type === "user" ? o.sender_user.first_name : o.type === "hidden_user" ? o.sender_user_name : o.type === "chat" ? (o.sender_chat.title ?? "") : (o.chat.title ?? "")
        await this.#ingest(ctx, { text: ctx.message.text, from })
        return this.#reply(ctx, t().saved)
      }
      return this.#converse(ctx, ctx.message.text)
    })
  }

  async #download(fileId: string): Promise<Uint8Array> {
    const file = await this.bot.api.getFile(fileId)
    const r = await fetch(`https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`)
    if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`)
    return new Uint8Array(await r.arrayBuffer())
  }

  #agenda(days: number, withOverdue: boolean): string {
    const t = this.#t
    const open = this.#d.store.data().agenda.filter((o) => !o.done_on)
    const line = (o: Occurrence) => `• ${o.title} — ${o.days < 0 ? t.ago(-o.days) : t.inDays(o.days)} (${o.date})`
    const overdue = withOverdue ? open.filter((o) => o.days < 0) : []
    const next = open.filter((o) => o.days >= 0 && o.days <= days)
    const out: string[] = []
    if (overdue.length) out.push(t.overdue, ...overdue.map(line), "")
    if (next.length) out.push(withOverdue ? t.week : t.upcoming(days), ...next.map(line))
    return out.length ? out.join("\n") : t.nothing
  }

  async #ingest(ctx: Context, n: { text?: string; files?: Upload[]; from?: string }) {
    const sender = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ")
    await this.#d.inbox.add({ source: "telegram", text: n.text, files: n.files, from: n.from || sender, account: "telegram" })
    this.#d.jobs()?.queueTriage()
  }

  #chat(chatId: number): Chat {
    const id = `tg-${Math.abs(chatId)}`
    return this.#d.store.chat(id) ?? this.#d.store.newChat("telegram", id)
  }

  async #converse(ctx: Context, text: string) {
    const chatId = ctx.chat!.id
    if (!this.#d.claude.available) return this.#reply(ctx, this.#t.noClaude)
    if (this.#busy.has(chatId)) return // one answer at a time per chat
    this.#busy.add(chatId)
    try {
      const chat = this.#chat(chatId)
      const sent = await ctx.reply(this.#t.thinking)
      let answer = ""
      let shown = ""
      let lastEdit = Date.now()
      const tools: { name: string; detail: string }[] = []
      let error: string | undefined
      const edit = async () => {
        const preview = outgoing(stripActions(answer) || "…")[0]
        if (preview && preview !== shown) {
          shown = preview
          await ctx.api.editMessageText(chatId, sent.message_id, preview).catch(() => undefined)
        }
      }
      // Gmail links: the conversations are saved in the archive first, and the agent told where.
      const prompt = await this.#d.gmailLinks.prompt(text, (step) => tools.push(step))
      for await (const e of this.#d.claude.run({ prompt, profile: "read", session: chat.session, locale: this.#d.config.locale, actions: true, source: "telegram" })) {
        if (e.type === "session") chat.session = e.id
        else if (e.type === "text") answer += e.text
        else if (e.type === "block" && answer) answer += "\n\n"
        else if (e.type === "tool") tools.push({ name: e.name, detail: e.detail })
        else if (e.type === "error") error = e.message
        if (e.type === "text" && Date.now() - lastEdit > EDIT_EVERY_MS) {
          lastEdit = Date.now()
          await edit()
        }
      }
      if (error) {
        // A failed run leaves nothing worth resuming: the next message starts a fresh session.
        chat.session = null
        if (!answer) answer = `⚠️ ${friendlyError(error, this.#d.config.locale)}`
      }
      const sender = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ")
      answer = await finishAnswer(answer, "telegram", sender, {
        reminders: this.#d.reminders,
        inbox: this.#d.inbox,
        jobs: this.#d.jobs(),
        telegram: true,
        locale: this.#d.config.locale,
        changes: this.#d.changes,
      })
      const parts = outgoing(stripActions(answer))
      const confirm = asksToConfirm(answer)
        ? keyboard([[{ text: this.#t.yes, data: "confirm:yes" }, { text: this.#t.no, data: "confirm:no" }]])
        : undefined
      const markup = (i: number) => (i === parts.length - 1 ? confirm : undefined)
      if (parts[0] !== shown || markup(0)) {
        await ctx.api.editMessageText(chatId, sent.message_id, parts[0], { reply_markup: markup(0) }).catch(() => undefined)
      }
      for (const [i, p] of parts.slice(1).entries()) await ctx.reply(p, { reply_markup: markup(i + 1) })
      chat.messages.push({ role: "user", text, tools: [] }, { role: "assistant", text: answer, tools, error })
      await this.#d.store.saveChat(chat)
    } finally {
      this.#busy.delete(chatId)
    }
  }
}

function keyboard(rows: Button[][]): InlineKeyboard {
  const k = new InlineKeyboard()
  for (const row of rows) {
    for (const b of row) k.text(redact(b.text).slice(0, 60), b.data.slice(0, 64))
    k.row()
  }
  return k
}

/** Tomorrow at 09:00 in the deadlines' time zone, as local "YYYY-MM-DDT09:00". */
function tomorrowAt9(timeZone: string): string {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 86_400_000))
  return `${d}T09:00`
}
