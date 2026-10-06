import * as React from "react"
import { FlaskConicalIcon, MinusIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { DEMO_MESSAGES } from "@/i18n/demo"
import { track } from "@/demo/analytics"

const KEY = "autocratico.demo-bar"
export const WAITLIST_URL = `${__DEMO_SITE_URL__.replace(/\/+$/, "")}/#lista`

/**
 * Always on screen in the demo: made-up data, nothing saved, start over, the waiting list.
 * Above the tab bar on phones, bottom centre elsewhere; it folds into a small chip.
 */
export function DemoBar({ onRestart }: { onRestart: () => void }) {
  const { locale } = useI18n()
  const d = DEMO_MESSAGES[locale]
  const [small, setSmall] = React.useState(() => {
    try {
      return sessionStorage.getItem(KEY) === "small"
    } catch {
      return false
    }
  })
  const fold = (v: boolean) => {
    setSmall(v)
    try {
      sessionStorage.setItem(KEY, v ? "small" : "")
    } catch {
      // storage unavailable
    }
  }
  const restart = () => {
    if (!window.confirm(d.restartConfirm)) return
    track("app_demo_reset")
    onRestart()
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-gutter lg:bottom-4">
      {small ? (
        <Button
          variant="secondary"
          size="sm"
          className="pointer-events-auto rounded-full shadow-lg"
          onClick={() => fold(false)}
          aria-label={d.show}
        >
          <FlaskConicalIcon data-icon="inline-start" />
          {d.barShort}
        </Button>
      ) : (
        <div
          role="status"
          className="rise-in pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-primary py-1 pr-1 pl-3.5 text-xs text-primary-foreground shadow-lg"
        >
          <FlaskConicalIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate px-1.5">
            <span className="sm:hidden">{d.barMobile}</span>
            <span className="hidden sm:inline">{d.bar}</span>
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 rounded-full text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            onClick={restart}
          >
            <RotateCcwIcon data-icon="inline-start" />
            <span className="hidden sm:inline">{d.restart}</span>
          </Button>
          <Button
            variant="secondary"
            size="xs"
            className="shrink-0 rounded-full"
            render={
              <a
                href={WAITLIST_URL}
                target="_blank"
                rel="noopener"
                onClick={() => track("app_demo_waitlist", { location: "bar" })}
              />
            }
            nativeButton={false}
          >
            {d.waitlist}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 rounded-full text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            onClick={() => fold(true)}
            aria-label={d.hide}
          >
            <MinusIcon />
          </Button>
        </div>
      )}
    </div>
  )
}
