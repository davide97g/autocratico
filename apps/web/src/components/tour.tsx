import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n"

/**
 * Each step points at the first visible element with one of these `data-tour` values: the sidebar
 * on desktop, the tab bar on phones (profile and settings sit under "More" there).
 */
const STEPS: { id: string; targets: string[] }[] = [
  { id: "overview", targets: ["overview"] },
  { id: "deadlines", targets: ["deadlines"] },
  { id: "cases", targets: ["cases"] },
  { id: "inbox", targets: ["inbox"] },
  { id: "profile", targets: ["profile", "more"] },
  { id: "chat", targets: ["chat"] },
  { id: "privacy", targets: ["privacy"] },
  { id: "settings", targets: ["settings", "more"] },
]

const GAP = 12
const PAD = 6

function find(targets: string[]): HTMLElement | null {
  for (const id of targets) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

type Box = { top: number; left: number; width: number; height: number }

/** Next to the target: on its right when there is room (the sidebar), else below or above it. */
function place(target: Box | null, card: { width: number; height: number }) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampX = (x: number) => Math.max(GAP, Math.min(x, vw - card.width - GAP))
  const clampY = (y: number) => Math.max(GAP, Math.min(y, vh - card.height - GAP))
  if (!target) return { top: (vh - card.height) / 2, left: (vw - card.width) / 2 }
  const right = target.left + target.width + GAP
  if (right + card.width + GAP <= vw && target.left < vw / 3) return { top: clampY(target.top), left: right }
  const below = target.top + target.height + GAP
  if (below + card.height + GAP <= vh) return { top: below, left: clampX(target.left + target.width / 2 - card.width / 2) }
  return { top: clampY(target.top - card.height - GAP), left: clampX(target.left + target.width / 2 - card.width / 2) }
}

/** A short guided tour over the real interface: a spotlight on each section and a card that explains it. */
export function Tour({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [index, setIndex] = React.useState(0)
  const [box, setBox] = React.useState<Box | null>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)
  const card = React.useRef<HTMLDivElement>(null)
  const step = STEPS[index]
  const text = t.tour.steps[step.id]
  const last = index === STEPS.length - 1

  React.useLayoutEffect(() => {
    const el = find(step.targets)
    el?.scrollIntoView({ block: "nearest" })
    const measure = () => {
      const r = el?.getBoundingClientRect()
      const b = r ? { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null
      setBox(b)
      const c = card.current?.getBoundingClientRect()
      setPos(place(b, { width: c?.width ?? 320, height: c?.height ?? 180 }))
    }
    measure()
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [step])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(STEPS.length - 1, i + 1))
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1))
      else return
      e.stopPropagation()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-labelledby="tour-title">
      {/* The spotlight: a transparent box whose huge shadow dims everything around it. */}
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl shadow-[0_0_0_200vmax] shadow-foreground/45 ring-2 ring-primary-foreground/80 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={box}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-foreground/45" />
      )}
      <Card
        ref={card}
        className="fixed w-[min(20rem,calc(100vw-1.5rem))] rounded-xl shadow-2xl transition-[top,left] duration-300 ease-out motion-reduce:transition-none"
        style={pos ?? { visibility: "hidden" }}
      >
        <CardHeader>
          <span className="font-mono text-xs text-muted-foreground">{t.tour.step(index + 1, STEPS.length)}</span>
          <CardTitle id="tour-title" className="text-lg font-medium tracking-tight">
            {text.title}
          </CardTitle>
          <CardDescription className="leading-relaxed">{text.body}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.id} className={i <= index ? "h-1 flex-1 rounded-full bg-primary" : "h-1 flex-1 rounded-full bg-muted"} />
          ))}
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="ghost" size="sm" className="mr-auto px-0 text-muted-foreground" onClick={onClose}>
            {t.tour.skip}
          </Button>
          {index > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setIndex(index - 1)}>
              {t.tour.back}
            </Button>
          )}
          <Button size="sm" autoFocus onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? t.tour.done : t.tour.next}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
