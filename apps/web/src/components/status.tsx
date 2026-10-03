import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import { type Level, ORDER, SEVERITY_ICON, severity, STYLE } from "@/lib/status"

/** Colored badge with status and days left. */
export function StatusBadge({ level, days, className }: { level: Level; days?: number; className?: string }) {
  const { t } = useI18n()
  const s = STYLE[level]
  return (
    <Badge variant="secondary" className={cn("gap-1.5 font-medium", s.soft, className)} title={t.status[level]}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {days == null || level === "done" ? t.status[level] : t.relativeDays(days)}
    </Badge>
  )
}

/** Signal-bars icon for severity, with a tooltip. */
export function SeverityIcon({ value, className }: { value: string | undefined; className?: string }) {
  const { t } = useI18n()
  const s = severity(value)
  const Icon = SEVERITY_ICON[s]
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn("inline-flex text-muted-foreground", className)} aria-label={t.severity[s]} />}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{t.severity[s]}</TooltipContent>
    </Tooltip>
  )
}

export function StatusLegend({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {ORDER.map((l) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", STYLE[l].dot)} />
          {t.status[l]}
        </li>
      ))}
    </ul>
  )
}
