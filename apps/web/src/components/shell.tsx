import * as React from "react"
import {
  ArchiveIcon,
  ArrowUpIcon,
  BellIcon,
  BookOpenIcon,
  CalendarClockIcon,
  CalendarIcon,
  ChartLineIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  FolderOpenIcon,
  HistoryIcon,
  InboxIcon,
  EllipsisIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react"
import { cn } from "cn"

import { Kbd, MOD } from "@/components/kbd"
import { Logo } from "@/components/logo"
import { UsageMeter } from "@/components/usage"
import { ShinyText } from "@/components/motion"
import { Sensitive, usePrivacy } from "@/components/privacy"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LOCALES, type Locale, useI18n } from "@/i18n"
import type { LiveJobs } from "@/lib/api"
import { type Connection, useConnection } from "@/lib/events"
import { capitalize, duration, parseDate, useNow } from "@/lib/format"
import { STYLE } from "@/lib/status"

export type View = "overview" | "deadlines" | "cases" | "inbox" | "finance" | "profile" | "archive" | "catalog" | "activity" | "settings"

export const VIEWS: { id: View; icon: LucideIcon; group: "agenda" | "archive" | "system" }[] = [
  { id: "overview", icon: LayoutDashboardIcon, group: "agenda" },
  { id: "deadlines", icon: CalendarClockIcon, group: "agenda" },
  { id: "cases", icon: FolderOpenIcon, group: "agenda" },
  { id: "inbox", icon: InboxIcon, group: "agenda" },
  { id: "finance", icon: ChartLineIcon, group: "agenda" },
  { id: "profile", icon: UserRoundIcon, group: "archive" },
  { id: "archive", icon: ArchiveIcon, group: "archive" },
  { id: "catalog", icon: BookOpenIcon, group: "archive" },
  { id: "activity", icon: HistoryIcon, group: "system" },
  { id: "settings", icon: SettingsIcon, group: "system" },
]

/** `busy`: a job (the agent, usually) is running on the server. */
export type Counts = Partial<Record<View, number>> & { urgent: number; busy: boolean }

/** The id of the search box, for the `/` shortcut. */
export const SEARCH_ID = "deadline-search"

/**
 * A highlight that slides to the active item of a list (the sidebar, the tab bar) instead of jumping:
 * returns the container's ref and the highlight's style, measured from the item marked `data-active`.
 */
function useSlidingHighlight<T extends HTMLElement>(deps: unknown[]) {
  const ref = React.useRef<T>(null)
  const [box, setBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [moved, setMoved] = React.useState(false)
  React.useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => {
      const el = root.querySelector<HTMLElement>("[data-active]")
      if (!el || !el.offsetParent) return setBox(null)
      setBox((before) => {
        const next = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
        if (before && before.x === next.x && before.y === next.y && before.w === next.w && before.h === next.h) return before
        if (before) setMoved(true)
        return next
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measured when the active item or the layout changes
  }, deps)
  const style: React.CSSProperties | undefined = box
    ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }
    : { opacity: 0 }
  // The first placement does not slide in from the corner.
  return [ref, style, moved] as const
}

function NavItem({
  id,
  active,
  compact,
  name,
  icon: Icon,
  count,
  alert,
  busy,
  onClick,
}: {
  id: View
  active: boolean
  compact: boolean
  name: string
  icon: LucideIcon
  count?: number
  alert?: boolean
  busy?: boolean
  onClick: () => void
}) {
  const button = (
    <Button
      variant="ghost"
      size="lg"
      className={cn(
        "group/nav relative z-10 h-9 shrink-0 gap-3 rounded-lg px-3 transition-colors duration-200",
        active ? "text-primary-foreground hover:bg-transparent hover:text-primary-foreground dark:hover:bg-transparent" : "text-foreground/80",
        compact ? "lg:h-10 lg:w-10 lg:justify-center lg:px-0" : "justify-start"
      )}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? name : undefined}
      data-active={active || undefined}
      onClick={onClick}
      data-tour={id}
    />
  )
  const content = (
    <>
      <Icon data-icon="inline-start" className="transition-transform duration-200 group-hover/nav:scale-110 group-active/nav:scale-95" />
      <span className={cn(compact && "lg:sr-only")}>{name}</span>
      {busy && <Spinner className={cn("ml-auto size-3.5 opacity-70", compact && "lg:absolute lg:top-1 lg:right-1 lg:size-3")} />}
      {count != null && count > 0 && (
        <span
          key={count}
          className={cn(
            "pop ml-auto rounded-sm px-1.5 py-0.5 font-mono text-[0.7rem] leading-none",
            alert ? STYLE.urgent.solid : active ? "bg-primary-foreground/15" : "bg-muted text-muted-foreground",
            compact && "lg:hidden"
          )}
        >
          {count}
        </span>
      )}
      {compact && alert && (
        <span className={cn("absolute top-1.5 right-1.5 hidden size-2 rounded-full ring-2 ring-card lg:block", STYLE.urgent.dot)} />
      )}
    </>
  )
  if (!compact) return React.cloneElement(button, undefined, content)
  return (
    <Tooltip>
      <TooltipTrigger render={button}>{content}</TooltipTrigger>
      <TooltipContent side="right">
        {name}
        {count ? ` · ${count}` : ""}
      </TooltipContent>
    </Tooltip>
  )
}

export function LanguageSwitch({ compact, touch = false }: { compact: boolean; touch?: boolean }) {
  const { locale, setLocale, t } = useI18n()
  if (compact) {
    const next = LOCALES.find((l) => l.id !== locale)!
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="font-mono text-xs" onClick={() => setLocale(next.id)} aria-label={t.sidebar.language} />
          }
        >
          {LOCALES.find((l) => l.id === locale)!.label}
        </TooltipTrigger>
        <TooltipContent side="right">{t.sidebar.language}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <ToggleGroup
      value={[locale]}
      onValueChange={(v) => v[0] && setLocale(v[0] as Locale)}
      className="rounded-md bg-muted p-0.5"
      aria-label={t.sidebar.language}
    >
      {LOCALES.map((l) => (
        <ToggleGroupItem
          key={l.id}
          value={l.id}
          size="sm"
          className={cn("h-6 rounded-sm px-2 font-mono text-xs aria-pressed:bg-card", touch && "h-9 px-3")}
        >
          {l.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** What the agent is doing right now, in one line: the job, how long, its latest step. */
function useAgentLine(live: LiveJobs | null) {
  const { t } = useI18n()
  const current = live?.current ?? null
  const now = useNow(Boolean(current))
  if (!current) return live && (live.waiting.length || live.triage) ? { title: t.sidebar.agentQueued, job: null, time: null, step: null } : null
  const last = current.steps?.at(-1)
  const step = last ? (last.tool ? `${t.chat.tools[last.tool] ?? last.tool} ${last.text}` : last.text.split("\n").at(-1)?.trim()) : null
  return {
    title: t.sidebar.agentWorking,
    job: t.activity.jobs[current.job] ?? current.job,
    time: duration(now - new Date(current.started).getTime()),
    step: step || null,
  }
}

/** The sidebar's Claude panel: ask from here, see the agent at work. */
function ClaudePanel({
  chatOpen,
  onChat,
  onAsk,
  live,
  onBusy,
  onUsage,
}: {
  chatOpen: boolean
  onChat: () => void
  onAsk: (q: string) => void
  live: LiveJobs | null
  onBusy: () => void
  onUsage: () => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = React.useState("")
  const agent = useAgentLine(live)

  return (
    <div className="relative flex shrink-0 flex-col gap-3 overflow-hidden rounded-lg bg-primary p-3.5 text-primary-foreground">
      <span className="chrome-orb absolute -top-5 -right-5 size-16 opacity-80" aria-hidden />
      {agent ? (
        <button
          type="button"
          onClick={onBusy}
          className="group/agent relative -m-1 flex flex-col gap-1 rounded-md p-1 text-left outline-none transition-colors hover:bg-primary-foreground/8 focus-visible:ring-2 focus-visible:ring-primary-foreground/50"
        >
          <span className="flex items-center gap-2 text-xs font-medium">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-status-soon opacity-70 motion-reduce:hidden" />
              <span className="relative size-2 rounded-full bg-status-soon" />
            </span>
            <ShinyText>{agent.title}</ShinyText>
            <ChevronRightIcon className="ml-auto size-3.5 opacity-50 transition-transform group-hover/agent:translate-x-0.5" />
          </span>
          {agent.job && (
            <span className="text-[0.7rem] text-primary-foreground/60">
              {agent.job} · {t.sidebar.agentFor(agent.time!)}
            </span>
          )}
          {agent.step && (
            <span key={agent.step} className="truncate font-mono text-[0.68rem] text-primary-foreground/50 duration-300 animate-in fade-in-0 slide-in-from-bottom-1">
              {agent.step}
            </span>
          )}
        </button>
      ) : (
        <span className="relative flex items-center gap-2 pr-8 text-sm font-medium" title={t.sidebar.askClaudeHint}>
          <SparklesIcon className="size-4" />
          {t.sidebar.askClaude}
        </span>
      )}
      <form
        className="relative flex items-center gap-1 rounded-md bg-primary-foreground/10 p-1 pl-2.5 ring-1 ring-primary-foreground/10 transition-shadow focus-within:ring-primary-foreground/40"
        onSubmit={(e) => {
          e.preventDefault()
          const q = draft.trim()
          if (!q) return onChat()
          onAsk(q)
          setDraft("")
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.sidebar.askPlaceholder}
          aria-label={t.sidebar.askClaude}
          className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-primary-foreground/45"
        />
        <Button
          type="submit"
          size="icon-xs"
          variant="secondary"
          aria-label={t.sidebar.askSend}
          className={cn("shrink-0 transition-[opacity,scale]", !draft.trim() && "scale-90 opacity-60")}
        >
          <ArrowUpIcon />
        </Button>
      </form>
      <button
        type="button"
        onClick={onChat}
        aria-pressed={chatOpen}
        className="relative flex items-center gap-2 self-start rounded-sm text-xs text-primary-foreground/70 outline-none transition-colors hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary-foreground/50"
      >
        {chatOpen ? t.sidebar.closeChat : t.sidebar.openChat}
        <Kbd className="h-4 min-w-4 bg-primary-foreground/10 text-[0.6rem] text-primary-foreground/70 ring-primary-foreground/15">C</Kbd>
      </button>
      <UsageMeter onOpen={onUsage} />
    </div>
  )
}

export function Sidebar({
  view,
  onView,
  name,
  counts,
  compact,
  onCompact,
  chatOpen,
  onChat,
  onAsk,
  live,
}: {
  view: View
  onView: (v: View) => void
  name: string | null
  counts: Counts
  compact: boolean
  onCompact: (v: boolean) => void
  chatOpen: boolean
  onChat: () => void
  onAsk: (q: string) => void
  live: LiveJobs | null
}) {
  const { enabled, setEnabled } = usePrivacy()
  const { t } = useI18n()
  const initials = name
    ? name
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?"
  const groups = ["agenda", "archive", "system"] as const
  const [navRef, highlightStyle, highlightSlides] = useSlidingHighlight<HTMLElement>([view, compact])

  return (
    <aside
      className={cn(
        "hidden min-w-0 flex-col gap-5 rounded-xl bg-card p-4 transition-[width] duration-300 ease-out-expo lg:sticky lg:top-6 lg:flex lg:h-[calc(100svh-6rem)]",
        compact ? "lg:w-18 lg:items-center lg:px-3 lg:py-5" : "lg:w-60 lg:p-5"
      )}
    >
      <div className={cn("flex shrink-0 items-center gap-3 px-1", compact && "lg:flex-col lg:px-0")}>
        <Logo className="size-8" />
        <span className={cn("mr-auto text-sm font-semibold tracking-tight", compact && "lg:hidden")}>{t.app.name}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden text-muted-foreground lg:inline-flex"
                onClick={() => onCompact(!compact)}
                aria-label={compact ? t.sidebar.expandLabel : t.sidebar.collapseLabel}
              />
            }
          >
            {compact ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
          </TooltipTrigger>
          <TooltipContent side="right">{compact ? t.sidebar.expand : t.sidebar.collapse} (B)</TooltipContent>
        </Tooltip>
      </div>

      {/* Scrolls on its own when the window is short, so the panel and the profile below always fit. */}
      <nav
        ref={navRef}
        className="no-scrollbar relative -mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-0.5"
        aria-label={t.sidebar.sections}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 rounded-lg bg-primary shadow-sm",
            highlightSlides && "transition-[transform,width,height,opacity] duration-300 ease-out-expo motion-reduce:transition-none"
          )}
          style={highlightStyle}
        />
        {groups.map((g) => (
          <div key={g} className={cn("flex flex-col gap-0.5", compact && "lg:items-center")}>
            <span className={cn("px-3 pb-1 text-xs text-muted-foreground", compact && "lg:sr-only")}>{t.sidebar.groups[g]}</span>
            {VIEWS.filter((v) => v.group === g).map((v) => (
              <NavItem
                key={v.id}
                id={v.id}
                active={view === v.id}
                compact={compact}
                name={t.views[v.id]}
                icon={v.icon}
                count={counts[v.id]}
                alert={v.id === "deadlines" && counts.urgent > 0}
                busy={v.id === "activity" && counts.busy}
                onClick={() => onView(v.id)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn("flex shrink-0 flex-col gap-4", compact && "lg:items-center")}>
        {compact ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-lg"
                  variant={chatOpen ? "default" : "secondary"}
                  className="relative size-10 rounded-lg"
                  onClick={onChat}
                  aria-pressed={chatOpen}
                  aria-label={t.sidebar.askClaude}
                />
              }
            >
              <SparklesIcon />
              {counts.busy && (
                <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-status-soon opacity-70 motion-reduce:hidden" />
                  <span className="relative size-2.5 rounded-full bg-status-soon ring-2 ring-card" />
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent side="right">{t.sidebar.askClaude} (C)</TooltipContent>
          </Tooltip>
        ) : (
          <ClaudePanel chatOpen={chatOpen} onChat={onChat} onAsk={onAsk} live={live} onBusy={() => onView("activity")} onUsage={() => onView("settings")} />
        )}

        <div className={cn("flex items-center gap-3 border-t pt-4", compact && "flex-col border-t-0 pt-0")}>
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <Sensitive>{initials}</Sensitive>
            </AvatarFallback>
          </Avatar>
          {!compact && (
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-sm font-medium">
                <Sensitive when={Boolean(name)}>{name ?? t.sidebar.profileMissing}</Sensitive>
              </span>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch size="sm" checked={enabled} onCheckedChange={setEnabled} aria-label={t.sidebar.privacy} />
                {t.sidebar.privacy}
              </label>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

const CONNECTION_DOT: Record<Connection, string> = {
  live: "bg-status-done",
  connecting: "bg-status-soon",
  offline: "bg-muted-foreground",
}

/** Whether updates arrive by themselves: a dot on the date, explained on hover. */
function LiveDot() {
  const { t } = useI18n()
  const c = useConnection()
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} aria-label={t.topbar.live[c]} className="relative flex size-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>
        {c === "live" && <span className="absolute inset-0 animate-ping rounded-full bg-status-done opacity-60 [animation-duration:2.4s] motion-reduce:hidden" />}
        <span className={cn("relative size-2 rounded-full transition-colors duration-500", CONNECTION_DOT[c])} />
      </TooltipTrigger>
      <TooltipContent>{t.topbar.live[c]}</TooltipContent>
    </Tooltip>
  )
}

/**
 * True once the page has scrolled the sentinel (placed just above a sticky bar) under the bar's sticky offset:
 * the bar then gets its glass. Without `bar`, the offset is the top of the window.
 */
export function useStuck<T extends HTMLElement>(bar?: React.RefObject<HTMLElement | null>) {
  const sentinel = React.useRef<T>(null)
  const [stuck, setStuck] = React.useState(false)
  React.useEffect(() => {
    const el = sentinel.current
    if (!el) return
    let io: IntersectionObserver | null = null
    const observe = () => {
      io?.disconnect()
      const top = bar?.current ? parseFloat(getComputedStyle(bar.current).top) || 0 : 0
      io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < window.innerHeight / 2), {
        threshold: 0,
        rootMargin: `${-Math.round(top)}px 0px 0px 0px`,
      })
      io.observe(el)
    }
    observe()
    // The offset changes with the breakpoint.
    const m = window.matchMedia("(min-width: 64rem)")
    m.addEventListener("change", observe)
    return () => {
      io?.disconnect()
      m.removeEventListener("change", observe)
    }
  }, [bar])
  return { sentinel, stuck }
}

/**
 * A bar that sticks under the top bar (filters, tabs of a view) and turns to glass once it does.
 * Phones: under the compact bar. Desktop: under the sticky top bar.
 */
export function StickyBar({ children, className }: { children: React.ReactNode; className?: string }) {
  const bar = React.useRef<HTMLDivElement>(null)
  const { sentinel, stuck } = useStuck<HTMLDivElement>(bar)
  return (
    <>
      <div ref={sentinel} aria-hidden className="-mb-4 h-0 sm:-mb-6" />
      <div
        ref={bar}
        data-stuck={stuck || undefined}
        className={cn(
          "topbar sticky top-[calc(env(safe-area-inset-top)+3.75rem)] z-10 -mx-2 rounded-xl px-2 py-1.5 transition-[background-color,box-shadow] duration-300 lg:top-[5.75rem] lg:-mx-3 lg:px-3",
          className
        )}
      >
        {children}
      </div>
    </>
  )
}

export function TopBar({
  title,
  today,
  search,
  onSearch,
  upcoming,
  onBell,
  chatOpen,
  onChat,
  busy,
  onBusy,
  onCommand,
}: {
  title: string
  today: string | null
  search: string
  onSearch: (s: string) => void
  upcoming: number
  onBell: () => void
  chatOpen: boolean
  onChat: () => void
  /** Shows "agent at work", linking to the activity: null when nothing runs or the activity is on screen. */
  busy: string | null
  onBusy: () => void
  onCommand: () => void
}) {
  const { enabled, setEnabled } = usePrivacy()
  const { t, fmt } = useI18n()
  const d = today ? parseDate(today) : null
  const { sentinel, stuck } = useStuck<HTMLDivElement>()

  return (
    <>
      <div ref={sentinel} aria-hidden className="-mb-5 h-0 lg:-mb-8" />
      {/* Phones: the large title scrolls away and a compact bar slides in with the same essentials. */}
      <div
        data-stuck={stuck || undefined}
        aria-hidden={!stuck}
        inert={!stuck}
        className="topbar fixed inset-x-0 top-0 z-30 flex items-center gap-2 px-gutter pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 transition-[translate,opacity] duration-300 ease-out-expo not-data-stuck:pointer-events-none not-data-stuck:-translate-y-full not-data-stuck:opacity-0 lg:hidden"
      >
        <Logo className="size-7" />
        <span className="mr-auto truncate text-base font-semibold tracking-tight">{title}</span>
        {busy && (
          <Button variant="ghost" size="icon-lg" className="size-10 rounded-lg" onClick={onBusy} aria-label={busy}>
            <Spinner />
          </Button>
        )}
        <Button variant="ghost" size="icon-lg" className="size-10 rounded-lg" onClick={onCommand} aria-label={t.topbar.command}>
          <SearchIcon />
        </Button>
        <Button
          variant={chatOpen ? "default" : "ghost"}
          size="icon-lg"
          className="size-10 rounded-lg"
          onClick={onChat}
          aria-pressed={chatOpen}
          aria-label={t.sidebar.askClaude}
        >
          <SparklesIcon />
        </Button>
      </div>

      <header
        data-stuck={stuck || undefined}
        className="topbar group/top z-20 flex flex-wrap items-center gap-3 rounded-xl transition-[background-color,box-shadow] duration-300 lg:sticky lg:top-3 lg:-mx-3 lg:px-3 lg:py-2"
      >
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          {d && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground sm:hidden">
              {capitalize(fmt.weekdayLong.format(d))}, {fmt.long.format(d)}
              <LiveDot />
            </span>
          )}
          <h1
            key={title}
            className="truncate text-3xl font-medium tracking-tight duration-300 animate-in fade-in-0 slide-in-from-bottom-1 sm:text-4xl"
          >
            {title}
          </h1>
        </div>

        {busy && (
          <Button
            variant="outline"
            className="h-11 gap-2 rounded-lg border-transparent bg-card px-3 duration-300 animate-in fade-in-0 zoom-in-95"
            onClick={onBusy}
            aria-label={busy}
          >
            <Spinner className="text-muted-foreground" />
            <ShinyText className="hidden max-w-48 truncate text-sm sm:inline">{busy}</ShinyText>
          </Button>
        )}

        {d && (
          <div className="hidden h-11 items-center gap-3 rounded-lg bg-card py-1 pr-4 pl-1 sm:flex">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <CalendarIcon className="size-4" />
            </span>
            <span className="flex flex-col text-xs leading-tight">
              <span className="font-medium">{fmt.long.format(d)}</span>
              <span className="text-muted-foreground capitalize">{fmt.weekdayLong.format(d)}</span>
            </span>
            <LiveDot />
          </div>
        )}

        <InputGroup className="order-last h-11 w-full rounded-lg border-transparent bg-card pl-1 transition-[width,box-shadow] duration-300 ease-out-expo sm:order-none sm:w-72 xl:focus-within:w-80">
          <InputGroupAddon>
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <SearchIcon className="size-4" />
            </span>
          </InputGroupAddon>
          <InputGroupInput
            id={SEARCH_ID}
            placeholder={t.topbar.search}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label={t.topbar.search}
          />
          <InputGroupAddon align="inline-end" className="hidden pointer-fine:flex">
            <button
              type="button"
              onClick={onCommand}
              aria-label={t.topbar.command}
              title={t.topbar.command}
              className="flex items-center gap-0.5 rounded-md p-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Kbd>{MOD}</Kbd>
              <Kbd>K</Kbd>
            </button>
          </InputGroupAddon>
        </InputGroup>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="icon-lg" className="relative hidden size-11 rounded-lg lg:inline-flex" onClick={onBell} aria-label={t.topbar.within30Label} />
            }
          >
            <BellIcon className={cn(upcoming > 0 && "origin-top group-hover/button:animate-[bell_600ms_ease-in-out]")} />
            {upcoming > 0 && (
              <span
                key={upcoming}
                className="pop absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1 font-mono text-[0.7rem] text-secondary-foreground ring-2 ring-background"
              >
                {upcoming}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent>{t.topbar.within30(upcoming)}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-lg"
                variant={enabled ? "default" : "outline"}
                className={cn("size-11 rounded-lg", !enabled && "border-transparent bg-card")}
                onClick={() => setEnabled(!enabled)}
                aria-pressed={enabled}
                aria-label={t.topbar.privacy}
                data-tour="privacy"
              />
            }
          >
            <span key={String(enabled)} className="pop flex">
              {enabled ? <EyeOffIcon /> : <EyeIcon />}
            </span>
          </TooltipTrigger>
          <TooltipContent>{enabled ? t.topbar.showData : t.topbar.hideData} (P)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-lg"
                variant={chatOpen ? "default" : "outline"}
                className={cn("size-11 rounded-lg", !chatOpen && "border-transparent bg-card")}
                onClick={onChat}
                aria-pressed={chatOpen}
                aria-label={t.sidebar.askClaude}
                data-tour="chat"
              />
            }
          >
            <SparklesIcon className="transition-transform duration-300 group-hover/button:scale-110 group-hover/button:rotate-12" />
          </TooltipTrigger>
          <TooltipContent>{t.sidebar.askClaude} (C)</TooltipContent>
        </Tooltip>
      </header>
    </>
  )
}

const TABS: View[] = ["overview", "deadlines", "cases", "inbox"]
const MORE = VIEWS.filter((v) => !TABS.includes(v.id))

/** Phones and tablets: a floating tab bar above the home indicator, the rest of the sections in a sheet. */
export function TabBar({ view, onView, name, counts }: { view: View; onView: (v: View) => void; name: string | null; counts: Counts }) {
  const { t } = useI18n()
  const { enabled, setEnabled } = usePrivacy()
  const [more, setMore] = React.useState(false)
  const inMore = MORE.some((v) => v.id === view)
  const [barRef, highlightStyle, highlightSlides] = useSlidingHighlight<HTMLDivElement>([view, more])

  const tab = (id: View | "more", Icon: LucideIcon, label: string, active: boolean, onClick: () => void, badge?: number, busy?: boolean) => (
    <button
      key={id}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      data-active={active || undefined}
      data-tour={id}
      className={cn(
        "relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[0.68rem] font-medium transition-[color,scale] duration-200 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95",
        active ? "text-primary-foreground" : "text-muted-foreground"
      )}
    >
      <Icon className={cn("size-5 transition-transform duration-300 ease-spring", active && "-translate-y-px scale-110")} />
      <span className="max-w-full truncate px-1">{label}</span>
      {badge != null && badge > 0 && (
        <span
          key={badge}
          className={cn(
            "pop absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full px-1 font-mono text-[0.6rem] leading-4 ring-2",
            STYLE.urgent.solid,
            active ? "ring-primary" : "ring-card"
          )}
        >
          {badge}
        </span>
      )}
      {busy && <Spinner className="absolute top-1.5 left-1/2 ml-2 size-3.5" />}
    </button>
  )

  return (
    <>
      {/* The fade under the bar hides the page scrolling beneath it, down to the home indicator. */}
      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-linear-to-t from-background from-70% to-transparent px-gutter pt-4 pb-safe lg:hidden"
        aria-label={t.sidebar.sections}
      >
        <div
          ref={barRef}
          className="pointer-events-auto relative mx-auto mb-2 flex h-16 max-w-lg gap-1 rounded-2xl bg-card/85 p-1.5 shadow-lg ring-1 ring-glass-border backdrop-blur-xl"
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 left-0 rounded-xl bg-primary",
              highlightSlides && "transition-[transform,width,opacity] duration-300 ease-out-expo motion-reduce:transition-none"
            )}
            style={highlightStyle}
          />
          {TABS.map((id) => {
            const v = VIEWS.find((x) => x.id === id)!
            return tab(id, v.icon, t.views[id], view === id && !more, () => onView(id), id === "deadlines" ? counts.deadlines : undefined)
          })}
          {tab("more", EllipsisIcon, t.sidebar.more, inMore || more, () => setMore(true), undefined, counts.busy)}
        </div>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-0 rounded-t-2xl pb-safe lg:hidden">
          <SheetHeader className="flex-row items-center px-5 pt-3 pb-1">
            <span aria-hidden className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30" />
            <SheetTitle className="mr-auto pt-3 text-lg font-medium tracking-tight">{t.sidebar.more}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-3 py-2">
            {MORE.map((v, i) => (
              <Button
                key={v.id}
                variant={view === v.id ? "default" : "ghost"}
                className="rise-in h-12 justify-start gap-3 rounded-xl px-3 text-base"
                style={{ "--i": i } as React.CSSProperties}
                aria-current={view === v.id ? "page" : undefined}
                onClick={() => {
                  setMore(false)
                  onView(v.id)
                }}
              >
                <v.icon data-icon="inline-start" className="size-5" />
                {t.views[v.id]}
                {v.id === "activity" && counts.busy && <Spinner className="ml-auto size-4 opacity-70" />}
                {counts[v.id] != null && counts[v.id]! > 0 && (
                  <span className="ml-auto font-mono text-xs opacity-60">{counts[v.id]}</span>
                )}
              </Button>
            ))}
          </div>
          <div className="mx-5 mt-2 mb-4 flex items-center gap-3 border-t pt-4">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              <Sensitive when={Boolean(name)}>{name ?? t.sidebar.profileMissing}</Sensitive>
            </span>
            <label className="flex h-11 items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t.sidebar.privacy} />
              {t.sidebar.privacy}
            </label>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
