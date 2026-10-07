import * as React from "react"
import { CheckIcon, SparklesIcon } from "lucide-react"
import { cn } from "cn"

import { dismissSplash, Logo } from "@/components/logo"
import { ShinyText, stagger } from "@/components/motion"
import { PalettePicker } from "@/components/palette-picker"
import { LanguageSwitch } from "@/components/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { useI18n } from "@/i18n"
import { DEMO_MESSAGES } from "@/i18n/demo"
import { track } from "@/demo/analytics"
import { seed } from "@/demo/backend/seed"
import { start } from "@/demo/backend/state"
import { reducedMotion, sleep } from "@/demo/backend/util"

type Step = "welcome" | "generating" | "ready"

/**
 * The way into the demo: a name for the made-up register, then the agent "reads" the mailbox and the
 * documents while the register is built, then the app opens (with the tour, if wanted).
 */
export function Intro({ onDone }: { onDone: (tour: boolean) => void }) {
  const { locale } = useI18n()
  const d = DEMO_MESSAGES[locale]
  const [step, setStep] = React.useState<Step>("welcome")
  const [name, setName] = React.useState("")
  const [progress, setProgress] = React.useState(0)
  const [owner, setOwner] = React.useState<string | null>(null)

  React.useEffect(() => {
    dismissSplash()
    track("app_demo_start")
  }, [])

  async function generate(e: React.FormEvent) {
    e.preventDefault()
    setStep("generating")
    track("app_demo_generate", { named: Boolean(name.trim()) })
    const register = seed(name)
    setOwner(register.name)
    const fast = reducedMotion()
    const total = d.steps.length
    for (let i = 0; i < total; i++) {
      await sleep(fast ? 120 : 850 + ((i * 337) % 500))
      setProgress(i + 1)
    }
    await sleep(fast ? 100 : 500)
    start(register)
    setStep("ready")
  }

  function enter(tour: boolean) {
    track("app_demo_ready", { tour })
    onDone(tour)
  }

  const shown = owner ?? (name.trim() || d.namePlaceholder)

  return (
    <div className="flex min-h-svh items-start justify-center pt-safe px-gutter pb-safe sm:items-center">
      <Card className="my-6 w-full max-w-lg rounded-xl">
        <CardHeader className="gap-4">
          <div className="flex items-center gap-3">
            <Logo className="size-8" />
            <span className="font-medium tracking-tight">Autocratico</span>
            <Badge variant="secondary" className="mr-auto">
              {d.badge}
            </Badge>
            <LanguageSwitch compact={false} />
          </div>
          {step !== "welcome" && (
            <Progress
              value={(progress / d.steps.length) * 100}
              aria-label={d.generatingTitle}
            />
          )}
        </CardHeader>

        {step === "welcome" && (
          <form onSubmit={generate} className="contents">
            <CardHeader>
              <CardTitle className="text-2xl font-medium tracking-tight">
                {d.welcomeTitle}
              </CardTitle>
              <CardDescription className="leading-relaxed">
                {d.welcomeBody}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <ul className="flex flex-col gap-3 text-sm">
                {d.points.map((p, i) => (
                  <li key={p} className="rise-in flex gap-3" style={stagger(i)}>
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-status-done" />
                    {p}
                  </li>
                ))}
              </ul>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">{d.nameLabel}</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={d.namePlaceholder}
                  maxLength={60}
                  autoComplete="off"
                />
                <span className="text-xs text-muted-foreground">
                  {d.nameHint}
                </span>
              </label>
              <div className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">{d.paletteLabel}</span>
                <PalettePicker />
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" autoFocus>
                <SparklesIcon data-icon="inline-start" />
                {d.generate}
              </Button>
            </CardFooter>
          </form>
        )}

        {step !== "welcome" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-medium tracking-tight">
                {step === "ready" ? d.readyTitle(shown) : d.generatingTitle}
              </CardTitle>
              <CardDescription className="leading-relaxed">
                {step === "ready" ? d.readyBody : d.generatingBody}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2.5 text-sm" aria-live="polite">
                {d.steps.map((s, i) => {
                  if (i > progress) return null
                  const doing = i === progress && step === "generating"
                  return (
                    <li
                      key={s.done}
                      className={cn(
                        "rise-in flex items-start gap-3",
                        doing ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {doing ? (
                        <Spinner className="mt-0.5 shrink-0" />
                      ) : (
                        <CheckIcon className="mt-0.5 size-4 shrink-0 text-status-done" />
                      )}
                      {doing ? (
                        <ShinyText>{s.doing}</ShinyText>
                      ) : (
                        <span>{s.done}</span>
                      )}
                    </li>
                  )
                })}
              </ol>
            </CardContent>
            {step === "ready" && (
              <CardFooter className="justify-end gap-2">
                <Button variant="ghost" onClick={() => enter(false)}>
                  {d.enter}
                </Button>
                <Button onClick={() => enter(true)} autoFocus>
                  {d.tour}
                </Button>
              </CardFooter>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
