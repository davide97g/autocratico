import * as React from "react"
import { caseOpen } from "@autocratico/core"
import { cn } from "cn"

import { toast } from "sonner"

import { Chat, chatAbout, chatAsk, chatNew } from "@/components/chat"
import { type CommandActions, CommandPalette, GO_KEYS, ShortcutsDialog } from "@/components/command"
import { DropToInbox } from "@/components/drop-to-inbox"
import { type ExpenseAsk, ExpenseDialog } from "@/components/finance"
import { dismissSplash } from "@/components/logo"
import { usePrivacy } from "@/components/privacy"
import { SEARCH_ID, Sidebar, TabBar, TopBar, type View, VIEWS } from "@/components/shell"
import { ViewSkeleton } from "@/components/skeletons"
import { useTheme } from "@/components/theme-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Toaster } from "@/components/ui/sonner"
import { useI18n } from "@/i18n"
import { Tour } from "@/components/tour"
import {
  activity as loadActivity,
  type Data,
  type FinanceData,
  financeData,
  loadData,
  markDone,
  type Occurrence,
  runJob,
  type Session,
  session as loadSession,
  Unauthenticated,
} from "@/lib/api"
import { useLiveRefresh, useServerEvents } from "@/lib/events"
import { changedKeys, FreshContext } from "@/lib/fresh"
import { useLiveJobs } from "@/lib/live"
import { usePrefs } from "@/lib/prefs"
import { otherTheme, switchPalette, switchTheme } from "@/lib/theme-switch"
import { unlessChanged } from "@/lib/utils"
import { level } from "@/lib/status"
import { Activity } from "@/views/activity"
import { Archive } from "@/views/archive"
import { Cases } from "@/views/cases"
import { Catalog } from "@/views/catalog"
import { DeadlinePage } from "@/views/deadline"
import { Deadlines } from "@/views/deadlines"
import { Finance } from "@/views/finance"
import { Inbox } from "@/views/inbox"
import { Overview } from "@/views/overview"
import { Login } from "@/views/login"
import { Onboarding } from "@/views/onboarding"
import { Profile } from "@/views/profile"
import { Settings } from "@/views/settings"

function usePreference(key: string, initial: boolean) {
  const [value, setValue] = React.useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v == null ? initial : v === "1"
    } catch {
      return initial
    }
  })
  const set = React.useCallback(
    (v: boolean | ((before: boolean) => boolean)) =>
      setValue((before) => {
        const next = typeof v === "function" ? v(before) : v
        try {
          localStorage.setItem(key, next ? "1" : "0")
        } catch {
          // storage unavailable: keep it in memory only
        }
        return next
      }),
    [key]
  )
  return [value, set] as const
}

function useMedia(query: string) {
  // Stable subscribe: a new one on every render would resubscribe on every render.
  const subscribe = React.useCallback(
    (notify: () => void) => {
      const m = window.matchMedia(query)
      m.addEventListener("change", notify)
      return () => m.removeEventListener("change", notify)
    },
    [query]
  )
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/** Cards light up under the pointer (index.css): one listener for the whole page, at most once a frame. */
function useSpotlight() {
  React.useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    let frame = 0
    let last: PointerEvent | null = null
    const onMove = (e: PointerEvent) => {
      last = e
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const card = (last?.target as Element | null)?.closest?.<HTMLElement>('[data-slot="card"]')
        if (!card || !last) return
        const r = card.getBoundingClientRect()
        card.style.setProperty("--mx", `${last.clientX - r.left}px`)
        card.style.setProperty("--my", `${last.clientY - r.top}px`)
      })
    }
    document.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      document.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(frame)
    }
  }, [])
}

/** How long a changed occurrence keeps its glow. */
const FRESH_MS = 3_000

/**
 * While `active`, mirrors the visual viewport (the part above the iOS keyboard) into CSS variables
 * for the h-visual, top-visual and pb-safe-visual utilities, and stops the page behind from scrolling.
 */
function useVisualViewport(active: boolean) {
  React.useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const root = document.documentElement
    const update = () => {
      root.style.setProperty("--visual-height", `${vv.height}px`)
      root.style.setProperty("--visual-top", `${vv.offsetTop}px`)
      if (window.innerHeight - vv.height > 120) root.style.setProperty("--visual-safe-bottom", "0px")
      else root.style.removeProperty("--visual-safe-bottom")
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    root.style.overflow = "hidden"
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      for (const p of ["--visual-height", "--visual-top", "--visual-safe-bottom", "overflow"]) root.style.removeProperty(p)
    }
  }, [active])
}

const DEADLINE_HASH = "deadline/"
const ACTIVITY_HASH = "activity/"

/**
 * `#<view>`, `#deadline/<key>` for one occurrence on its own page (under Deadlines),
 * or `#activity/<hash>` for one change in Activity (the chat links its changes there).
 */
function routeFromHash(): { view: View; deadline: string | null; commit: string | null } {
  const h = window.location.hash.slice(1)
  if (h.startsWith(DEADLINE_HASH)) {
    try {
      return { view: "deadlines", deadline: decodeURIComponent(h.slice(DEADLINE_HASH.length)) || null, commit: null }
    } catch {
      return { view: "deadlines", deadline: null, commit: null }
    }
  }
  if (h.startsWith(ACTIVITY_HASH)) {
    const commit = h.slice(ACTIVITY_HASH.length)
    return { view: "activity", deadline: null, commit: /^[0-9a-f]{4,40}$/.test(commit) ? commit : null }
  }
  return { view: VIEWS.some((v) => v.id === h) ? (h as View) : "overview", deadline: null, commit: null }
}

export function App({ tour: startTour = false }: { tour?: boolean }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [tour, setTour] = React.useState(startTour)
  const check = React.useCallback(() => {
    loadSession().then(setSession, (e: Error) => setFailed(e.message))
  }, [])
  React.useEffect(check, [check])
  const signedOut = React.useCallback(() => setSession((s) => s && { ...s, authenticated: false, user: null }), [])

  // The launch screen leaves once there is something to show (Main waits for the register).
  const showsMain = Boolean(session?.owner && session.authenticated && !(session.user && !session.user.onboarded))
  React.useEffect(() => {
    if (failed || (session && !showsMain)) dismissSplash()
  }, [failed, session, showsMain])
  React.useEffect(() => {
    // Whatever happens, never stuck behind the logo.
    const id = window.setTimeout(dismissSplash, 8000)
    return () => window.clearTimeout(id)
  }, [])

  if (failed) return <p className="p-6 text-sm text-status-overdue">{failed}</p>
  if (!session) return null
  // First run (no owner), or an owner who never finished the onboarding.
  if (!session.owner || (session.user && !session.user.onboarded)) {
    return (
      <Onboarding
        session={session}
        onDone={(withTour) => {
          setTour(withTour)
          check()
        }}
      />
    )
  }
  if (!session.authenticated) return <Login onLoggedIn={check} />
  return <Main session={session} onSignedOut={signedOut} onRenamed={check} tour={tour} onTour={setTour} />
}

function Main({
  session,
  onSignedOut,
  onRenamed,
  tour,
  onTour,
}: {
  session: Session
  onSignedOut: () => void
  onRenamed: () => void
  tour: boolean
  onTour: (open: boolean) => void
}) {
  const { t, locale, setLocale } = useI18n()
  const { setEnabled: setPrivacy } = usePrivacy()
  const { setTheme } = useTheme()
  const { prefs, set: setPref } = usePrefs()
  const [data, setData] = React.useState<Data | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<View>(() => routeFromHash().view)
  const [deadline, setDeadline] = React.useState<string | null>(() => routeFromHash().deadline)
  const [commit, setCommit] = React.useState<string | null>(() => routeFromHash().commit)
  const [search, setSearch] = React.useState("")
  const [openCase, setOpenCase] = React.useState<string | null>(null)
  const compact = prefs.compact
  const setCompact = React.useCallback((v: boolean | ((before: boolean) => boolean)) => setPref("compact", v), [setPref])
  const [chatOpen, setChatOpen] = usePreference("autocratico.chat-open", false)
  const [command, setCommand] = React.useState(false)
  const [shortcuts, setShortcuts] = React.useState(false)
  const [fresh, setFresh] = React.useState<ReadonlySet<string>>(() => new Set())
  useSpotlight()
  const wide = useMedia("(min-width: 72rem)")
  const wider = useMedia("(min-width: 96rem)")
  const touch = useMedia("(pointer: coarse)")
  const chatDocked = chatOpen && wide
  const chatSheet = chatOpen && !wide
  useVisualViewport(chatSheet)
  // On phones the chat covers the app: it does not reopen by itself at launch.
  React.useEffect(() => {
    if (!window.matchMedia("(min-width: 72rem)").matches) setChatOpen(false)
  }, [setChatOpen])

  // Notices read the latest preferences and texts without making the loaders change identity.
  const latest = React.useRef({
    t,
    liveNotices: prefs.liveNotices,
    go: (() => undefined) as (v: View) => void,
    openDeadline: (() => undefined) as (key: string) => void,
  })
  const current = React.useRef<Data | null>(null)
  const freshTimer = React.useRef<number | undefined>(undefined)
  const reload = React.useCallback(() => {
    loadData().then(
      (d) => {
        const before = current.current
        const next = unlessChanged(d)(before)
        current.current = next
        setData(next)
        // Changed elsewhere (the agent, the chat, another device): they glow once, with a notice.
        const keys = before && before !== next ? changedKeys(before, next) : []
        if (!keys.length) return
        setFresh(new Set(keys))
        window.clearTimeout(freshTimer.current)
        freshTimer.current = window.setTimeout(() => setFresh(new Set()), FRESH_MS)
        const { t, liveNotices, openDeadline } = latest.current
        // Counted per deadline: a monthly payment changes all of its occurrences at once.
        const changed = new Set(next.agenda.filter((o) => keys.includes(o.key)).map((o) => o.id)).size
        if (liveNotices)
          toast(t.live.changed(changed), {
            id: "register-changed",
            description: t.live.changedBody,
            action: changed === 1 ? { label: t.live.open, onClick: () => openDeadline(keys[0]) } : undefined,
          })
      },
      (e: Error) => (e instanceof Unauthenticated ? onSignedOut() : setError(e.message))
    )
  }, [onSignedOut])
  React.useEffect(() => {
    if (data || error) dismissSplash()
  }, [data, error])
  React.useEffect(reload, [reload])
  // Deadlines, cases, profile: read again as soon as the server says they changed.
  useLiveRefresh("data", reload, 60_000)
  // When the agent finishes: the data may have changed, and a notice says how it went.
  const onAgentDone = React.useCallback(() => {
    reload()
    if (!latest.current.liveNotices) return
    loadActivity().then(
      ({ runs }) => {
        const run = runs[0]
        if (!run || !run.finished || Date.now() - new Date(run.finished).getTime() > 60_000) return
        const { t, go } = latest.current
        const show = run.ok ? toast.success : toast.error
        show(run.ok ? t.live.agentDone : t.live.agentFailed, {
          id: `run-${run.id}`,
          description: `${t.activity.jobs[run.job] ?? run.job}: ${run.summary}`,
          action: { label: t.live.view, onClick: () => go("activity") },
        })
      },
      () => undefined
    )
  }, [reload])
  const live = useLiveJobs(onAgentDone)

  // The finance source's data: loaded once the Finance view opens, then kept fresh by the server's events.
  const [finance, setFinance] = React.useState<FinanceData | null>(null)
  const financeWanted = React.useRef(false)
  const reloadFinance = React.useCallback(() => {
    financeData().then((f) => setFinance(unlessChanged(f)), (e: Error) => (e instanceof Unauthenticated ? onSignedOut() : setError(e.message)))
  }, [onSignedOut])
  useServerEvents("finance", () => {
    if (financeWanted.current) reloadFinance()
  })
  React.useEffect(() => {
    if (view !== "finance") return
    financeWanted.current = true
    reloadFinance()
  }, [view, reloadFinance])
  const [expense, setExpense] = React.useState<ExpenseAsk | null>(null)

  React.useEffect(() => {
    const onHash = () => {
      const r = routeFromHash()
      setView(r.view)
      setDeadline(r.deadline)
      setCommit(r.commit)
      // A link followed from the chat sheet: show where it leads.
      if (!window.matchMedia("(min-width: 72rem)").matches) setChatOpen(false)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [setChatOpen])

  // Stable callbacks: the views are memoized, so a live poll re-renders the shell but not them.
  const go = React.useCallback((v: View) => {
    window.location.hash = v
    setView(v)
    setDeadline(null)
    setCommit(null)
    window.scrollTo({ top: 0 })
  }, [])
  const openDeadlines = React.useCallback(() => go("deadlines"), [go])
  const openInbox = React.useCallback(() => go("inbox"), [go])
  const openDeadline = React.useCallback((key: string) => {
    window.location.hash = DEADLINE_HASH + encodeURIComponent(key)
    setView("deadlines")
    setDeadline(key)
    window.scrollTo({ top: 0 })
  }, [])
  React.useEffect(() => {
    latest.current = { t, liveNotices: prefs.liveNotices, go, openDeadline }
  })
  const closeChat = React.useCallback(() => setChatOpen(false), [setChatOpen])
  /** Asks Claude from anywhere (the palette, the sidebar): the chat opens on the answer. */
  const ask = React.useCallback(
    (q: string) => {
      chatAsk(q)
      setChatOpen(true)
    },
    [setChatOpen]
  )
  const askAbout = React.useCallback(
    (o: Occurrence) => {
      chatAbout({ key: o.key, title: o.title })
      setChatOpen(true)
    },
    [setChatOpen]
  )

  const commandActions = React.useMemo<CommandActions>(
    () => ({
      onView: go,
      onOpenDeadline: openDeadline,
      onOpenCase: (slug) => {
        setOpenCase(slug)
        go("cases")
      },
      onAsk: ask,
      onChat: () => setChatOpen(true),
      onNewChat: () => {
        chatNew()
        setChatOpen(true)
      },
      onPrivacy: () => setPrivacy((v) => !v),
      onSidebar: () => setCompact((v) => !v),
      onTheme: () => switchTheme(setTheme, otherTheme()),
      onPalette: (p) => switchPalette((next) => setPref("palette", next), p),
      onLanguage: () => setLocale(locale === "it" ? "en" : "it"),
      onRunJob: (job) => {
        toast(t.command.started(t.activity.jobs[job] ?? job), { id: `job-${job}`, action: { label: t.live.view, onClick: () => go("activity") } })
        runJob(job).catch((e: Error) => toast.error(e.message))
      },
      onShortcuts: () => setShortcuts(true),
    }),
    [go, openDeadline, ask, setChatOpen, setPrivacy, setCompact, setTheme, setPref, setLocale, locale, t]
  )

  // Keyboard: ⌘K anywhere; single keys and "g then …" only when not typing.
  React.useEffect(() => {
    let goPending = 0
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setCommand((v) => !v)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        if (e.key === "Escape") target.blur()
        return
      }
      // A dialog (the palette, a confirmation) has the keyboard.
      if (document.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open]')) return
      const k = e.key.toLowerCase()
      if (goPending && Date.now() - goPending < 1200) {
        goPending = 0
        const v = (Object.keys(GO_KEYS) as View[]).find((id) => GO_KEYS[id] === k)
        if (v) {
          e.preventDefault()
          go(v)
        }
        return
      }
      goPending = 0
      if (k === "g") goPending = Date.now()
      else if (k === "c") setChatOpen((v) => !v)
      else if (k === "b") setCompact((v) => !v)
      else if (k === "p") setPrivacy((v) => !v)
      else if (e.key === "?") setShortcuts(true)
      else if (e.key === "/") document.getElementById(SEARCH_ID)?.focus()
      else if (e.key === "Escape") setChatOpen(false)
      else return
      e.preventDefault() // the key must not end up in the input that just got focus
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, setChatOpen, setCompact, setPrivacy])

  const onSearch = (s: string) => {
    setSearch(s)
    if (s && (view !== "deadlines" || deadline)) go("deadlines")
  }

  // The notice's Undo calls the latest onDone, without a notice of its own.
  const onDoneRef = React.useRef<(o: Occurrence, done: boolean, undoable?: boolean) => Promise<void>>(async () => undefined)
  const onDone = React.useCallback(
    async (o: Occurrence, done: boolean, undoable = true) => {
      try {
        const done_on = await markDone(o.key, done)
        setData((d) => {
          const next = d && { ...d, agenda: d.agenda.map((x) => (x.key === o.key ? { ...x, done_on } : x)) }
          current.current = next
          return next
        })
        if (undoable)
          toast.success(done ? t.live.markedDone : t.live.markedUndone, {
            id: `done-${o.key}`,
            description: o.title,
            action: { label: t.live.undo, onClick: () => void onDoneRef.current(o, !done, false) },
            duration: 7000,
          })
        // A payment: offer to record it in the finance source, or to delete what was recorded for it
        // (not when the payment is already there: a transaction confirmed as this occurrence's).
        if (o.amount_basis !== null) {
          const f = await financeData().catch(() => null)
          if (f?.mirror && f.write && done !== Boolean(f.links[o.key]) && !(done && f.matched[o.key])) setExpense({ o, mode: done ? "record" : "remove", finance: f, doneOn: done_on })
        }
      } catch (e) {
        setError(t.app.saveFailed((e as Error).message))
      }
    },
    [t]
  )

  React.useEffect(() => {
    onDoneRef.current = onDone
  })

  const onOpenCase = React.useCallback(
    (slug: string) => {
      setOpenCase(slug)
      go("cases")
    },
    [go]
  )

  const name = session.user?.name || null
  const upcoming = data?.agenda.filter((o) => !o.done_on && o.days >= 0 && o.days <= 30).length ?? 0
  const title = t.views[view]
  const counts = {
    deadlines: upcoming,
    cases: data?.cases.filter(caseOpen).length,
    catalog: data?.catalog.length,
    busy: Boolean(live?.current),
    urgent:
      data?.agenda.filter((o) => {
        const l = level(o)
        return l === "overdue" || l === "urgent"
      }).length ?? 0,
  }
  // With the chat docked on medium screens the sidebar shrinks to icons to make room.
  const sidebarCompact = compact || (chatDocked && !wider)
  const chat = (
    <Chat
      view={title}
      onClose={closeChat}
      className={cn(chatDocked ? "sticky top-6 h-[calc(100svh-6rem)]" : "h-full shadow-2xl")}
      autoFocus={chatDocked || !touch}
    />
  )

  return (
    <div className="min-h-svh pt-safe pb-tabbar lg:p-6">
      {/* Behind the translucent iOS status bar (zero height elsewhere). */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-safe-top bg-status-bar" />
      <div
        className={cn(
          "grid items-start gap-6 px-gutter pt-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-8 lg:rounded-2xl lg:bg-glass lg:p-6 lg:ring-1 lg:ring-glass-border lg:backdrop-blur-2xl",
          chatDocked && "lg:grid-cols-[auto_minmax(0,1fr)_22rem] 2xl:grid-cols-[auto_minmax(0,1fr)_26rem]"
        )}
      >
        <Sidebar
          view={view}
          onView={go}
          name={name}
          counts={counts}
          compact={sidebarCompact}
          onCompact={setCompact}
          chatOpen={chatOpen}
          onChat={() => setChatOpen((v) => !v)}
          onAsk={ask}
          live={live}
        />

        <main className="@container flex min-w-0 flex-col gap-5 lg:gap-8">
          <TopBar
            title={title}
            today={data?.today ?? null}
            search={search}
            onSearch={onSearch}
            upcoming={upcoming}
            onBell={() => go("deadlines")}
            chatOpen={chatOpen}
            onChat={() => setChatOpen((v) => !v)}
            busy={live?.current && view !== "activity" ? t.activity.busy : null}
            onBusy={() => go("activity")}
            onCommand={() => setCommand(true)}
          />

          {error && (
            <Alert variant="destructive" className="rounded-lg">
              <AlertTitle>{t.app.errorTitle}</AlertTitle>
              <AlertDescription>{t.app.errorBody(error)}</AlertDescription>
            </Alert>
          )}

          {!data && !error && <ViewSkeleton view={view} />}

          <FreshContext.Provider value={fresh}>
          <div key={deadline ? `deadline:${deadline}` : view} className="view-in flex min-w-0 flex-col gap-5 lg:gap-8">
          {data && view === "overview" && (
            <Overview data={data} onOpenCase={onOpenCase} onOpenDeadlines={openDeadlines} onOpenDeadline={openDeadline} onAsk={ask} />
          )}
          {data && view === "deadlines" && !deadline && (
            <Deadlines data={data} search={search} onDone={onDone} onOpenCase={onOpenCase} onOpen={openDeadline} onAsk={askAbout} />
          )}
          {data && view === "deadlines" && deadline && (
            <DeadlinePage
              data={data}
              occurrence={deadline}
              onBack={openDeadlines}
              onOpen={openDeadline}
              onDone={onDone}
              onOpenCase={onOpenCase}
              onAsk={askAbout}
            />
          )}
          {data && view === "cases" && <Cases cases={data.cases} open={openCase} />}
          {data && view === "profile" && <Profile profile={data.profile} />}
          {data && view === "catalog" && <Catalog entries={data.catalog} />}
          {data && view === "finance" && (
            <Finance data={data} finance={finance} onReload={reloadFinance} onOpenDeadline={openDeadline} onOpenSettings={() => go("settings")} />
          )}
          {view === "inbox" && <Inbox />}
          {view === "archive" && <Archive />}
          {view === "activity" && <Activity live={live} focus={commit} />}
          {view === "settings" && (
            <Settings
              session={session}
              onRenamed={onRenamed}
              onSignedOut={onSignedOut}
              onTour={() => {
                go("overview")
                onTour(true)
              }}
              onShortcuts={() => setShortcuts(true)}
            />
          )}
          </div>
          </FreshContext.Provider>
        </main>

        {chatDocked && chat}
      </div>

      <TabBar view={view} onView={go} name={name} counts={counts} />

      {chatSheet && (
        <div
          className="fixed inset-x-0 top-visual z-40 flex h-visual justify-end bg-foreground/20 pt-safe pb-safe-visual backdrop-blur-xs duration-200 animate-in fade-in-0 motion-reduce:animate-none"
          onClick={() => setChatOpen(false)}
        >
          <div
            className="h-full w-full p-2 duration-300 ease-out animate-in slide-in-from-bottom-8 motion-reduce:animate-none sm:max-w-md sm:p-3 sm:slide-in-from-right-8 sm:slide-in-from-bottom-0"
            onClick={(e) => e.stopPropagation()}
          >
            {chat}
          </div>
        </div>
      )}
      <p className="px-gutter py-5 text-xs text-muted-foreground lg:px-6">{t.app.footer}</p>
      {tour && data && <Tour onClose={() => onTour(false)} />}
      <DropToInbox onOpenInbox={openInbox} />
      <CommandPalette open={command} onOpenChange={setCommand} data={data} actions={commandActions} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <Toaster />
      <ExpenseDialog
        ask={expense}
        onClose={() => {
          setExpense(null)
          if (financeWanted.current) reloadFinance()
        }}
      />
    </div>
  )
}

export default App
