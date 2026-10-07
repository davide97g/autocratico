import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  CalendarClockIcon,
  CornerDownLeftIcon,
  EyeOffIcon,
  FolderOpenIcon,
  KeyboardIcon,
  LanguagesIcon,
  type LucideIcon,
  MailIcon,
  MessageSquarePlusIcon,
  MoonIcon,
  PaletteIcon,
  PanelLeftIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react"
import { caseOpen } from "@autocratico/core"
import { cn } from "cn"

import { Kbd, MOD } from "@/components/kbd"
import { type View, VIEWS } from "@/components/shell"
import { StatusBadge } from "@/components/status"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useI18n } from "@/i18n"
import type { Data } from "@/lib/api"
import { PALETTES, type Palette } from "@/lib/palettes"
import { parseDate } from "@/lib/format"
import { level } from "@/lib/status"


/** Keys of the "g then …" shortcuts, one per section. */
export const GO_KEYS: Record<View, string> = {
  overview: "o",
  deadlines: "d",
  cases: "c",
  inbox: "i",
  finance: "f",
  profile: "p",
  archive: "a",
  catalog: "r",
  activity: "h",
  settings: "s",
}

export type CommandActions = {
  onView: (v: View) => void
  onOpenDeadline: (key: string) => void
  onOpenCase: (slug: string) => void
  onAsk: (question: string) => void
  onChat: () => void
  onNewChat: () => void
  onPrivacy: () => void
  onSidebar: () => void
  onTheme: () => void
  onPalette: (palette: Palette) => void
  onLanguage: () => void
  onRunJob: (job: "gmail" | "triage") => void
  onShortcuts: () => void
}

type Item = {
  id: string
  group: "ask" | "go" | "deadlines" | "cases" | "actions"
  icon: LucideIcon
  label: React.ReactNode
  /** What the filter matches against. */
  text: string
  hint?: React.ReactNode
  keys?: string[]
  run: () => void
}

const GROUP_ORDER: Item["group"][] = ["ask", "deadlines", "cases", "go", "actions"]

function matches(text: string, q: string) {
  const t = text.toLowerCase()
  return q.split(/\s+/).every((w) => t.includes(w))
}

/** ⌘K: jump to a section, a deadline or a case, run an action, or ask Claude what was typed. */
export function CommandPalette({
  open,
  onOpenChange,
  data,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: Data | null
  actions: CommandActions
}) {
  const { t, fmt } = useI18n()
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)
  const list = React.useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()

  // Fresh each time it opens, and back on the first item whenever the query changes (set while rendering).
  const [opened, setOpened] = React.useState(open)
  if (open !== opened) {
    setOpened(open)
    if (open) {
      setQuery("")
      setActive(0)
    }
  }
  const [lastQuery, setLastQuery] = React.useState(q)
  if (q !== lastQuery) {
    setLastQuery(q)
    setActive(0)
  }

  const items = React.useMemo(() => {
    const close = (fn: () => void) => () => {
      onOpenChange(false)
      fn()
    }
    const all: Item[] = []
    all.push({
      id: "ask",
      group: "ask",
      icon: SparklesIcon,
      label: q ? t.command.ask(query.trim()) : t.command.askEmpty,
      text: "",
      keys: ["C"],
      run: close(() => (q ? actions.onAsk(query.trim()) : actions.onChat())),
    })
    for (const v of VIEWS) {
      all.push({
        id: `go:${v.id}`,
        group: "go",
        icon: v.icon,
        label: t.views[v.id],
        text: `${t.views[v.id]} ${v.id}`,
        keys: ["G", GO_KEYS[v.id].toUpperCase()],
        run: close(() => actions.onView(v.id)),
      })
    }
    if (data) {
      // Without a query: what comes next. With one: every match, soonest first.
      const open = data.agenda.filter((o) => !o.done_on)
      const deadlines = q ? open.filter((o) => matches(`${o.title} ${o.notes} ${o.area}`, q)) : open.filter((o) => o.days >= -30)
      const seen = new Set<string>()
      for (const o of deadlines) {
        if (seen.has(o.id) || seen.size >= (q ? 8 : 4)) continue
        seen.add(o.id)
        all.push({
          id: `deadline:${o.key}`,
          group: "deadlines",
          icon: CalendarClockIcon,
          label: o.title,
          text: o.title,
          hint: (
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{fmt.dayMonth.format(parseDate(o.date))}</span>
              <StatusBadge level={level(o)} days={o.days} />
            </span>
          ),
          run: close(() => actions.onOpenDeadline(o.key)),
        })
      }
      if (q) {
        for (const c of data.cases.filter((c) => matches(`${c.title} ${c.status}`, q)).slice(0, 4)) {
          all.push({
            id: `case:${c.slug}`,
            group: "cases",
            icon: FolderOpenIcon,
            label: c.title,
            text: c.title,
            hint: <span className="text-xs text-muted-foreground">{caseOpen(c) ? `${c.done}/${c.total}` : "✓"}</span>,
            run: close(() => actions.onOpenCase(c.slug)),
          })
        }
      }
    }
    const action = (id: string, icon: LucideIcon, label: string, run: () => void, keys?: string[]) =>
      all.push({ id: `action:${id}`, group: "actions", icon, label, text: label, keys, run: close(run) })
    action("chat", SparklesIcon, t.command.actions.chat, actions.onChat, ["C"])
    action("new-chat", MessageSquarePlusIcon, t.command.actions.newChat, actions.onNewChat)
    action("upload", UploadIcon, t.command.actions.upload, () => actions.onView("inbox"))
    action("gmail", MailIcon, t.command.actions.gmail, () => actions.onRunJob("gmail"))
    action("triage", WandSparklesIcon, t.command.actions.triage, () => actions.onRunJob("triage"))
    action("privacy", EyeOffIcon, t.command.actions.privacy, actions.onPrivacy, ["P"])
    action("theme", MoonIcon, t.command.actions.theme, actions.onTheme, ["D"])
    for (const p of PALETTES) action(`palette-${p}`, PaletteIcon, t.command.actions.palette(t.palettes[p].name), () => actions.onPalette(p))
    action("sidebar", PanelLeftIcon, t.command.actions.sidebar, actions.onSidebar, ["B"])
    action("language", LanguagesIcon, t.command.actions.language, actions.onLanguage)
    action("settings", SlidersHorizontalIcon, t.command.actions.settings, () => actions.onView("settings"))
    action("shortcuts", KeyboardIcon, t.command.actions.shortcuts, actions.onShortcuts, ["?"])

    const shown = all.filter((i) => i.group === "ask" || i.group === "deadlines" || i.group === "cases" || !q || matches(i.text, q))
    return GROUP_ORDER.flatMap((g) => shown.filter((i) => i.group === g))
  }, [q, query, data, actions, t, fmt, onOpenChange])

  const current = Math.min(active, items.length - 1)
  React.useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" })
  }, [current])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault()
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault()
      setActive((a) => (a - 1 + items.length) % items.length)
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault()
      items[current]?.run()
    }
  }

  let index = -1
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/15 backdrop-blur-[2px] duration-150 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Popup
          aria-label={t.command.label}
          className="fixed top-[max(1rem,12vh)] left-1/2 z-50 flex max-h-[min(36rem,76dvh)] w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 duration-200 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.98] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.97] data-open:slide-in-from-top-2"
        >
          <div className="flex items-center gap-3 border-b px-4">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t.command.placeholder}
              aria-label={t.command.placeholder}
              role="combobox"
              aria-expanded
              aria-controls="command-list"
              aria-activedescendant={items[current] ? `command-${items[current].id}` : undefined}
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <Kbd className="hidden sm:inline-flex">esc</Kbd>
          </div>

          <div ref={list} id="command-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {GROUP_ORDER.map((g) => {
              const group = items.filter((i) => i.group === g)
              if (!group.length) return null
              return (
                <div key={g} role="group" aria-label={t.command.groups[g]} className="pb-1">
                  <div className="px-2.5 pt-2 pb-1.5 text-xs font-medium text-muted-foreground">{t.command.groups[g]}</div>
                  {group.map((item) => {
                    index++
                    const i = index
                    const selected = i === current
                    return (
                      <div
                        key={item.id}
                        id={`command-${item.id}`}
                        role="option"
                        aria-selected={selected}
                        data-index={i}
                        onMouseMove={() => !selected && setActive(i)}
                        onClick={item.run}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-100 select-none",
                          selected && "bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors duration-100",
                            item.group === "ask" || selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          )}
                        >
                          <item.icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint}
                        {item.keys && (
                          <span className="hidden shrink-0 items-center gap-1 sm:flex">
                            {item.keys.map((k, n) => (
                              <React.Fragment key={k}>
                                {n > 0 && <span className="text-[0.65rem] text-muted-foreground">{t.shortcuts.then}</span>}
                                <Kbd>{k}</Kbd>
                              </React.Fragment>
                            ))}
                          </span>
                        )}
                        {selected && <CornerDownLeftIcon className="size-3.5 shrink-0 text-muted-foreground pointer-coarse:hidden" />}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="hidden items-center gap-4 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground sm:flex">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t.command.navigate}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              {t.command.select}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>esc</Kbd>
              {t.command.close}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Kbd>{MOD}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** `?`: every keyboard shortcut. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const row = (label: string, keys: string[], separator?: string) => (
    <li key={label} className="flex items-center justify-between gap-4 py-2">
      <span>{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <React.Fragment key={i}>
            {i > 0 && separator && <span className="text-[0.65rem] text-muted-foreground">{separator}</span>}
            <Kbd>{k}</Kbd>
          </React.Fragment>
        ))}
      </span>
    </li>
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg tracking-tight">{t.shortcuts.title}</DialogTitle>
          <DialogDescription>{t.shortcuts.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <section className="flex flex-col">
            <h3 className="pb-1 text-xs font-medium text-muted-foreground">{t.shortcuts.groups.general}</h3>
            <ul className="divide-y text-sm">
              {row(t.shortcuts.palette, [MOD, "K"])}
              {row(t.shortcuts.search, ["/"])}
              {row(t.shortcuts.chat, ["C"])}
              {row(t.shortcuts.sidebar, ["B"])}
              {row(t.shortcuts.privacy, ["P"])}
              {row(t.shortcuts.theme, ["D"])}
              {row(t.shortcuts.escape, ["esc"])}
              {row(t.shortcuts.help, ["?"])}
            </ul>
            <h3 className="pt-4 pb-1 text-xs font-medium text-muted-foreground">{t.shortcuts.groups.chat}</h3>
            <ul className="divide-y text-sm">
              {row(t.shortcuts.send, ["↵"])}
              {row(t.shortcuts.newline, ["⇧", "↵"])}
            </ul>
          </section>
          <section className="flex flex-col">
            <h3 className="pb-1 text-xs font-medium text-muted-foreground">{t.shortcuts.groups.go}</h3>
            <ul className="divide-y text-sm">{VIEWS.map((v) => row(t.views[v.id], ["G", GO_KEYS[v.id].toUpperCase()], t.shortcuts.then))}</ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
