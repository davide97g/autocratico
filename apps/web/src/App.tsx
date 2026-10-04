import * as React from "react"
import { caseOpen } from "@autocratico/core"
import { cn } from "cn"

import { Chat, chatAbout } from "@/components/chat"
import { DropToInbox } from "@/components/drop-to-inbox"
import { type ExpenseAsk, ExpenseDialog } from "@/components/finance"
import { usePrivacy } from "@/components/privacy"
import { Sidebar, TabBar, TopBar, type View, VIEWS } from "@/components/shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import { Tour } from "@/components/tour"
import { type Data, type FinanceData, financeData, loadData, markDone, type Occurrence, type Session, session as loadSession, Unauthenticated } from "@/lib/api"
import { useServerEvents } from "@/lib/events"
import { useLiveJobs } from "@/lib/live"
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

/** `#<view>`, or `#deadline/<key>` for one occurrence on its own page (under Deadlines). */
function routeFromHash(): { view: View; deadline: string | null } {
  const h = window.location.hash.slice(1)
  if (h.startsWith(DEADLINE_HASH)) {
    try {
      return { view: "deadlines", deadline: decodeURIComponent(h.slice(DEADLINE_HASH.length)) || null }
    } catch {
      return { view: "deadlines", deadline: null }
    }
  }
  return { view: VIEWS.some((v) => v.id === h) ? (h as View) : "overview", deadline: null }
}

export function App() {
  const [session, setSession] = React.useState<Session | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [tour, setTour] = React.useState(false)
  const check = React.useCallback(() => {
    loadSession().then(setSession, (e: Error) => setFailed(e.message))
  }, [])
  React.useEffect(check, [check])
  const signedOut = React.useCallback(() => setSession((s) => s && { ...s, authenticated: false, user: null }), [])

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
  const { t } = useI18n()
  const { setEnabled: setPrivacy } = usePrivacy()
  const [data, setData] = React.useState<Data | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<View>(() => routeFromHash().view)
  const [deadline, setDeadline] = React.useState<string | null>(() => routeFromHash().deadline)
  const [search, setSearch] = React.useState("")
  const [openCase, setOpenCase] = React.useState<string | null>(null)
  const [compact, setCompact] = usePreference("autocratico.sidebar-compact", false)
  const [chatOpen, setChatOpen] = usePreference("autocratico.chat-open", false)
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

  const reload = React.useCallback(() => {
    loadData().then((d) => setData(unlessChanged(d)), (e: Error) => (e instanceof Unauthenticated ? onSignedOut() : setError(e.message)))
  }, [onSignedOut])
  // When the agent finishes, deadlines and cases may have changed.
  const live = useLiveJobs(reload)

  // The finance app's data: loaded once the Finance view opens, then kept fresh by the server's events.
  const [finance, setFinance] = React.useState<FinanceData | null>(null)
  const financeWanted = React.useRef(false)
  const reloadFinance = React.useCallback(() => {
    financeData().then((f) => setFinance(unlessChanged(f)), (e: Error) => (e instanceof Unauthenticated ? onSignedOut() : setError(e.message)))
  }, [onSignedOut])
  useServerEvents(
    React.useCallback(() => {
      if (financeWanted.current) reloadFinance()
    }, [reloadFinance])
  )
  React.useEffect(() => {
    if (view !== "finance") return
    financeWanted.current = true
    reloadFinance()
  }, [view, reloadFinance])
  const [expense, setExpense] = React.useState<ExpenseAsk | null>(null)

  React.useEffect(() => {
    reload()
    const onHash = () => {
      const r = routeFromHash()
      setView(r.view)
      setDeadline(r.deadline)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [reload])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        if (e.key === "Escape") target.blur()
        return
      }
      const k = e.key.toLowerCase()
      if (k === "c") setChatOpen((v) => !v)
      else if (k === "b") setCompact((v) => !v)
      else if (k === "p") setPrivacy((v) => !v)
      else if (e.key === "Escape") setChatOpen(false)
      else return
      e.preventDefault() // the key must not end up in the chat input that just opened
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setChatOpen, setCompact, setPrivacy])

  // Stable callbacks: the views are memoized, so a live poll re-renders the shell but not them.
  const go = React.useCallback((v: View) => {
    window.location.hash = v
    setView(v)
    setDeadline(null)
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
  const closeChat = React.useCallback(() => setChatOpen(false), [setChatOpen])
  const askAbout = React.useCallback(
    (o: Occurrence) => {
      chatAbout({ key: o.key, title: o.title })
      setChatOpen(true)
    },
    [setChatOpen]
  )

  const onSearch = (s: string) => {
    setSearch(s)
    if (s && (view !== "deadlines" || deadline)) go("deadlines")
  }

  const onDone = React.useCallback(
    async (o: Occurrence, done: boolean) => {
      try {
        const done_on = await markDone(o.key, done)
        setData((d) => d && { ...d, agenda: d.agenda.map((x) => (x.key === o.key ? { ...x, done_on } : x)) })
        // A payment: offer to record it in the finance app, or to delete what was recorded for it.
        if (o.amount_basis !== null) {
          const f = await financeData().catch(() => null)
          if (f?.mirror && done !== Boolean(f.links[o.key])) setExpense({ o, mode: done ? "record" : "remove", finance: f, doneOn: done_on })
        }
      } catch (e) {
        setError(t.app.saveFailed((e as Error).message))
      }
    },
    [t]
  )

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
        />

        <main className="@container flex min-w-0 flex-col gap-8">
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
          />

          {error && (
            <Alert variant="destructive" className="rounded-lg">
              <AlertTitle>{t.app.errorTitle}</AlertTitle>
              <AlertDescription>{t.app.errorBody(error)}</AlertDescription>
            </Alert>
          )}

          {!data && !error && (
            <div className="grid gap-6 @4xl:grid-cols-3">
              <Skeleton className="h-72 rounded-xl @4xl:col-span-2" />
              <Skeleton className="h-72 rounded-xl" />
            </div>
          )}

          <div key={deadline ? `deadline:${deadline}` : view} className="view-in flex min-w-0 flex-col gap-8">
          {data && view === "overview" && (
            <Overview data={data} onOpenCase={onOpenCase} onOpenDeadlines={openDeadlines} onOpenDeadline={openDeadline} />
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
          {view === "activity" && <Activity live={live} />}
          {view === "settings" && (
            <Settings
              session={session}
              onRenamed={onRenamed}
              onSignedOut={onSignedOut}
              onTour={() => {
                go("overview")
                onTour(true)
              }}
            />
          )}
          </div>
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
