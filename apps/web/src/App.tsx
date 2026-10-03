import * as React from "react"
import { cn } from "cn"

import { Chat } from "@/components/chat"
import { usePrivacy } from "@/components/privacy"
import { Sidebar, TopBar, type View, VIEWS } from "@/components/shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import { type Data, loadData, markDone, NotPaired, type Occurrence, type Session, session as loadSession } from "@/lib/api"
import { level } from "@/lib/status"
import { Activity } from "@/views/activity"
import { Cases } from "@/views/cases"
import { Catalog } from "@/views/catalog"
import { Deadlines } from "@/views/deadlines"
import { Inbox } from "@/views/inbox"
import { Overview } from "@/views/overview"
import { Pair } from "@/views/pair"
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
  return React.useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query)
      m.addEventListener("change", notify)
      return () => m.removeEventListener("change", notify)
    },
    () => window.matchMedia(query).matches
  )
}

function viewFromHash(): View {
  const h = window.location.hash.slice(1)
  return VIEWS.some((v) => v.id === h) ? (h as View) : "overview"
}

export function App() {
  const [session, setSession] = React.useState<Session | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const check = React.useCallback(() => {
    loadSession().then(setSession, (e: Error) => setFailed(e.message))
  }, [])
  React.useEffect(check, [check])

  if (failed) return <p className="p-6 text-sm text-status-overdue">{failed}</p>
  if (!session) return null
  if (!session.paired) return <Pair onPaired={check} />
  return <Main session={session} onUnpaired={() => setSession({ ...session, paired: false })} />
}

function Main({ session, onUnpaired }: { session: Session; onUnpaired: () => void }) {
  const { t } = useI18n()
  const { setEnabled: setPrivacy } = usePrivacy()
  const [data, setData] = React.useState<Data | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<View>(viewFromHash)
  const [search, setSearch] = React.useState("")
  const [openCase, setOpenCase] = React.useState<string | null>(null)
  const [compact, setCompact] = usePreference("autocratico.sidebar-compact", false)
  const [chatOpen, setChatOpen] = usePreference("autocratico.chat-open", false)
  const wide = useMedia("(min-width: 72rem)")
  const wider = useMedia("(min-width: 96rem)")
  const chatDocked = chatOpen && wide

  React.useEffect(() => {
    loadData().then(setData, (e: Error) => (e instanceof NotPaired ? onUnpaired() : setError(e.message)))
    const onHash = () => setView(viewFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [onUnpaired])

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

  const go = (v: View) => {
    window.location.hash = v
    setView(v)
    window.scrollTo({ top: 0 })
  }

  const onSearch = (s: string) => {
    setSearch(s)
    if (s && view !== "deadlines") go("deadlines")
  }

  const onDone = async (o: Occurrence, done: boolean) => {
    try {
      const done_on = await markDone(o.key, done)
      setData((d) => d && { ...d, agenda: d.agenda.map((x) => (x.key === o.key ? { ...x, done_on } : x)) })
    } catch (e) {
      setError(t.app.saveFailed((e as Error).message))
    }
  }

  const onOpenCase = (slug: string) => {
    setOpenCase(slug)
    go("cases")
  }

  const person = data?.profile.person
  const name = person && !Array.isArray(person) && person.name && person.name !== "TODO" ? String(person.name) : null
  const upcoming = data?.agenda.filter((o) => !o.done_on && o.days >= 0 && o.days <= 30).length ?? 0
  const title = t.views[view]
  const counts = {
    deadlines: upcoming,
    cases: data?.cases.filter((c) => c.done < c.total).length,
    catalog: data?.catalog.length,
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
      onClose={() => setChatOpen(false)}
      className={cn(chatDocked ? "sticky top-6 h-[calc(100svh-6rem)]" : "h-full shadow-2xl")}
    />
  )

  return (
    <div className={cn("mx-auto min-h-svh p-3 sm:p-6", chatDocked ? "max-w-[1840px]" : "max-w-[1480px]")}>
      <div
        className={cn(
          "grid items-start gap-6 rounded-2xl bg-glass p-3 ring-1 ring-glass-border backdrop-blur-2xl sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-8",
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

          {data && view === "overview" && (
            <Overview data={data} onDone={onDone} onOpenCase={onOpenCase} onOpenDeadlines={() => go("deadlines")} />
          )}
          {data && view === "deadlines" && (
            <Deadlines data={data} search={search} onDone={onDone} onOpenCase={onOpenCase} />
          )}
          {data && view === "cases" && <Cases cases={data.cases} open={openCase} />}
          {data && view === "profile" && <Profile profile={data.profile} />}
          {data && view === "catalog" && <Catalog entries={data.catalog} />}
          {view === "inbox" && <Inbox />}
          {view === "activity" && <Activity />}
          {view === "settings" && <Settings session={session} />}
        </main>

        {chatDocked && chat}
      </div>

      {chatOpen && !wide && (
        <div className="fixed inset-0 z-40 flex justify-end bg-foreground/20 p-3 backdrop-blur-xs" onClick={() => setChatOpen(false)}>
          <div className="h-full w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {chat}
          </div>
        </div>
      )}
      <p className="px-6 py-5 text-xs text-muted-foreground">{t.app.footer}</p>
    </div>
  )
}

export default App
