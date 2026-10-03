import * as React from "react"
import {
  BellIcon,
  BookOpenIcon,
  CalendarClockIcon,
  CalendarIcon,
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

import { Sensitive, usePrivacy } from "@/components/privacy"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LOCALES, type Locale, useI18n } from "@/i18n"
import { capitalize, parseDate } from "@/lib/format"
import { STYLE } from "@/lib/status"

export type View = "overview" | "deadlines" | "cases" | "inbox" | "profile" | "catalog" | "activity" | "settings"

export const VIEWS: { id: View; icon: LucideIcon; group: "agenda" | "archive" | "system" }[] = [
  { id: "overview", icon: LayoutDashboardIcon, group: "agenda" },
  { id: "deadlines", icon: CalendarClockIcon, group: "agenda" },
  { id: "cases", icon: FolderOpenIcon, group: "agenda" },
  { id: "inbox", icon: InboxIcon, group: "agenda" },
  { id: "profile", icon: UserRoundIcon, group: "archive" },
  { id: "catalog", icon: BookOpenIcon, group: "archive" },
  { id: "activity", icon: HistoryIcon, group: "system" },
  { id: "settings", icon: SettingsIcon, group: "system" },
]

/** `busy`: a job (the agent, usually) is running on the server. */
export type Counts = Partial<Record<View, number>> & { urgent: number; busy: boolean }

function NavItem({
  active,
  compact,
  name,
  icon: Icon,
  count,
  alert,
  busy,
  onClick,
}: {
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
      variant={active ? "default" : "ghost"}
      size="lg"
      className={cn("relative h-10 shrink-0 gap-3 rounded-lg px-3", compact ? "lg:w-10 lg:justify-center lg:px-0" : "justify-start")}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? name : undefined}
      onClick={onClick}
    />
  )
  const content = (
    <>
      <Icon data-icon="inline-start" />
      <span className={cn(compact && "lg:sr-only")}>{name}</span>
      {busy && <Spinner className={cn("ml-auto size-3.5 opacity-70", compact && "lg:absolute lg:top-1 lg:right-1 lg:size-3")} />}
      {count != null && count > 0 && (
        <span
          className={cn(
            "ml-auto rounded-sm px-1.5 py-0.5 font-mono text-[0.7rem] leading-none",
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

function LanguageSwitch({ compact, touch = false }: { compact: boolean; touch?: boolean }) {
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

export function Sidebar({
  view,
  onView,
  name,
  counts,
  compact,
  onCompact,
  chatOpen,
  onChat,
}: {
  view: View
  onView: (v: View) => void
  name: string | null
  counts: Counts
  compact: boolean
  onCompact: (v: boolean) => void
  chatOpen: boolean
  onChat: () => void
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

  return (
    <aside
      className={cn(
        "hidden min-w-0 flex-col gap-6 rounded-xl bg-card p-4 transition-[width] lg:sticky lg:flex lg:top-6 lg:h-[calc(100svh-6rem)] lg:gap-7",
        compact ? "lg:w-18 lg:items-center lg:px-3 lg:py-5" : "lg:w-60 lg:p-5"
      )}
    >
      <div className={cn("flex items-center gap-3 px-1", compact && "lg:flex-col lg:px-0")}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground">
          A
        </span>
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

      <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-6 lg:overflow-visible" aria-label={t.sidebar.sections}>
        {groups.map((g) => (
          <div key={g} className={cn("flex gap-1 lg:flex-col", compact && "lg:items-center")}>
            <span className={cn("hidden px-3 pb-1.5 text-xs text-muted-foreground lg:block", compact && "lg:sr-only")}>
              {t.sidebar.groups[g]}
            </span>
            {VIEWS.filter((v) => v.group === g).map((v) => (
              <NavItem
                key={v.id}
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

      <div className={cn("mt-auto hidden flex-col gap-4 lg:flex", compact && "lg:items-center")}>
        {compact ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-lg"
                  variant={chatOpen ? "default" : "secondary"}
                  className="size-10 rounded-lg"
                  onClick={onChat}
                  aria-pressed={chatOpen}
                  aria-label={t.sidebar.askClaude}
                />
              }
            >
              <SparklesIcon />
            </TooltipTrigger>
            <TooltipContent side="right">{t.sidebar.askClaude} (C)</TooltipContent>
          </Tooltip>
        ) : (
          <div className="relative flex flex-col gap-3 overflow-hidden rounded-lg bg-primary p-4 text-primary-foreground">
            <span className="chrome-orb absolute -top-5 -right-5 size-16 opacity-80" aria-hidden />
            <SparklesIcon className="size-4" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t.sidebar.askClaude}</span>
              <span className="text-xs text-primary-foreground/60">{t.sidebar.askClaudeHint}</span>
            </div>
            <Button variant="secondary" size="sm" className="self-start" onClick={onChat} aria-pressed={chatOpen}>
              {chatOpen ? t.sidebar.closeChat : t.sidebar.openChat}
            </Button>
          </div>
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
          <LanguageSwitch compact={compact} />
        </div>
      </div>
    </aside>
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
}) {
  const { enabled, setEnabled } = usePrivacy()
  const { t, fmt } = useI18n()
  const d = today ? parseDate(today) : null

  return (
    <header className="flex flex-wrap items-center gap-3 pt-1">
      <div className="mr-auto flex min-w-0 flex-col gap-0.5">
        {d && (
          <span className="text-sm text-muted-foreground sm:hidden">
            {capitalize(fmt.weekdayLong.format(d))}, {fmt.long.format(d)}
          </span>
        )}
        <h1 className="truncate text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
      </div>

      {busy && (
        <Button variant="outline" className="h-11 gap-2 rounded-lg border-transparent bg-card px-3" onClick={onBusy} aria-label={busy}>
          <Spinner className="text-muted-foreground" />
          <span className="hidden max-w-48 truncate text-sm sm:inline">{busy}</span>
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
        </div>
      )}

      <InputGroup className="order-last h-11 w-full rounded-lg border-transparent bg-card pl-1 sm:order-none sm:w-72">
        <InputGroupAddon>
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <SearchIcon className="size-4" />
          </span>
        </InputGroupAddon>
        <InputGroupInput
          placeholder={t.topbar.search}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label={t.topbar.search}
        />
      </InputGroup>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="icon-lg" className="relative hidden size-11 rounded-lg lg:inline-flex" onClick={onBell} aria-label={t.topbar.within30Label} />
          }
        >
          <BellIcon />
          {upcoming > 0 && (
            <Badge variant="secondary" className="absolute -top-1 -right-1">
              {upcoming}
            </Badge>
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
            />
          }
        >
          {enabled ? <EyeOffIcon /> : <EyeIcon />}
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
            />
          }
        >
          <SparklesIcon />
        </TooltipTrigger>
        <TooltipContent>{t.sidebar.askClaude} (C)</TooltipContent>
      </Tooltip>
    </header>
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

  const tab = (id: View | "more", Icon: LucideIcon, label: string, active: boolean, onClick: () => void, badge?: number, busy?: boolean) => (
    <button
      key={id}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[0.68rem] font-medium transition-[background-color,color,scale] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
      )}
    >
      <Icon className="size-5" />
      <span className="max-w-full truncate px-1">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className={cn(
            "absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full px-1 font-mono text-[0.6rem] leading-4 ring-2",
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
        <div className="pointer-events-auto mx-auto mb-2 flex h-16 max-w-lg gap-1 rounded-2xl bg-card/85 p-1.5 shadow-lg ring-1 ring-glass-border backdrop-blur-xl">
          {TABS.map((id) => {
            const v = VIEWS.find((x) => x.id === id)!
            return tab(id, v.icon, t.views[id], view === id, () => onView(id), id === "deadlines" ? counts.deadlines : undefined)
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
            {MORE.map((v) => (
              <Button
                key={v.id}
                variant={view === v.id ? "default" : "ghost"}
                className="h-12 justify-start gap-3 rounded-xl px-3 text-base"
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
            <LanguageSwitch compact={false} touch />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
