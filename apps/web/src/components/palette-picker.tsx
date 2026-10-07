import * as React from "react"
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { cn } from "cn"

import { useTheme } from "@/components/theme-provider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import { PALETTES, type Palette } from "@/lib/palettes"
import { usePrefs } from "@/lib/prefs"
import { switchPalette, switchTheme } from "@/lib/theme-switch"

type Origin = { x: number; y: number }

const THEMES = [
  { id: "light", icon: SunIcon },
  { id: "dark", icon: MoonIcon },
  { id: "system", icon: MonitorIcon },
] as const

/** Light, dark or system, the new one spreading from the button pressed. */
export function ThemeSwitch() {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const origin = React.useRef<Origin | undefined>(undefined)
  return (
    <ToggleGroup
      value={[theme]}
      onValueChange={(v) => v[0] && switchTheme(setTheme, v[0] as typeof theme, origin.current)}
      onPointerDown={(e) => (origin.current = { x: e.clientX, y: e.clientY })}
      className="rounded-lg bg-muted p-0.5"
      aria-label={t.settings.interface.theme}
    >
      {THEMES.map(({ id, icon: Icon }) => (
        <ToggleGroupItem key={id} value={id} size="sm" className="h-8 gap-1.5 rounded-md px-2.5 text-xs aria-pressed:bg-card aria-pressed:shadow-xs">
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{t.settings.interface.themes[id]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * A palette in miniature. It carries data-palette itself, so it shows that palette's real tokens
 * (index.css) in the current light or dark, whatever palette the page is in.
 */
export function PaletteSwatch({ palette, className }: { palette: Palette; className?: string }) {
  return (
    <span data-palette={palette} aria-hidden className={cn("flex h-12 overflow-hidden rounded-md border bg-background p-1.5", className)}>
      <span className="flex flex-1 flex-col justify-between rounded-sm bg-card p-1.5 shadow-xs">
        <span className="h-1 w-2/3 rounded-full bg-foreground/70" />
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-primary" />
          <span className="size-2 rounded-full bg-chart-2" />
          <span className="size-2 rounded-full bg-chart-1" />
        </span>
      </span>
    </span>
  )
}

/** The palette as three dots (card, primary, chart), in its own tokens like PaletteSwatch. */
function PaletteDots({ palette }: { palette: Palette }) {
  return (
    <span data-palette={palette} aria-hidden className="flex shrink-0 gap-0.5 rounded-full border bg-background p-0.5">
      <span className="size-2.5 rounded-full border bg-card" />
      <span className="size-2.5 rounded-full bg-primary" />
      <span className="size-2.5 rounded-full bg-chart-2" />
    </span>
  )
}

/**
 * The color palettes. `large` (onboarding) lists them with a preview and a line each; `compact`
 * (Settings, the demo) is a row of pills. The new palette spreads from the one pressed.
 */
export function PalettePicker({ size = "compact", className }: { size?: "large" | "compact"; className?: string }) {
  const { t } = useI18n()
  const { prefs, set } = usePrefs()
  const origin = React.useRef<Origin | undefined>(undefined)
  const large = size === "large"
  return (
    <ToggleGroup
      value={[prefs.palette]}
      onValueChange={(v) => v[0] && switchPalette((p) => set("palette", p), v[0] as Palette, origin.current)}
      onPointerDown={(e) => (origin.current = { x: e.clientX, y: e.clientY })}
      className={cn(large ? "grid w-full grid-cols-1 gap-2" : "flex w-full flex-wrap gap-2", className)}
      aria-label={t.settings.interface.palette}
    >
      {PALETTES.map((id) =>
        large ? (
          <ToggleGroupItem
            key={id}
            value={id}
            className="h-auto justify-start gap-3 rounded-lg border bg-card p-1.5 pr-3 text-left whitespace-normal aria-pressed:border-primary aria-pressed:bg-card aria-pressed:ring-2 aria-pressed:ring-primary/30"
          >
            <PaletteSwatch palette={id} className="w-20 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{t.palettes[id].name}</span>
              <span className="text-xs font-normal text-muted-foreground">{t.palettes[id].tagline}</span>
            </span>
            <CheckIcon className={cn("size-4 shrink-0 text-primary", prefs.palette !== id && "invisible")} />
          </ToggleGroupItem>
        ) : (
          <ToggleGroupItem
            key={id}
            value={id}
            title={t.palettes[id].tagline}
            className="h-9 gap-2 rounded-full border bg-card pr-3 pl-1.5 text-xs aria-pressed:border-primary aria-pressed:bg-card aria-pressed:ring-2 aria-pressed:ring-primary/30"
          >
            <PaletteDots palette={id} />
            {t.palettes[id].name}
          </ToggleGroupItem>
        )
      )}
    </ToggleGroup>
  )
}
