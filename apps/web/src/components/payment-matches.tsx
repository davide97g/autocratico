import * as React from "react"
import { CheckIcon, LandmarkIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Sensitive } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n"
import { answerMatch, type PaymentMatch, paymentMatches } from "@/lib/api"
import { useLiveRefresh } from "@/lib/events"
import { parseDate } from "@/lib/format"

/** Payments seen in the finance source that look like open deadlines: one tap marks them paid. Hidden when there are none. */
export function PaymentMatchesCard({
  onOpen,
  className,
  style,
}: {
  onOpen: (key: string) => void
  className?: string
  style?: React.CSSProperties
}) {
  const { t, fmt } = useI18n()
  const [matches, setMatches] = React.useState<PaymentMatch[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)
  const refresh = React.useCallback(() => {
    paymentMatches()
      .then(setMatches)
      .catch(() => undefined)
  }, [])
  React.useEffect(refresh, [refresh])
  useLiveRefresh(["data", "finance"], refresh, 60_000)

  async function answer(m: PaymentMatch, a: "paid" | "dismiss") {
    setBusy(m.id)
    try {
      await answerMatch(m.id, a)
      setMatches((list) => list.filter((x) => x.id !== m.id))
      toast.success(a === "paid" ? t.matches.paid : t.matches.dismissed, { description: m.title })
    } catch (e) {
      toast.error((e as Error).message)
      refresh()
    } finally {
      setBusy(null)
    }
  }

  if (!matches.length) return null
  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.matches.title}</CardTitle>
        <CardDescription>{t.matches.description}</CardDescription>
        <CardAction>
          <LandmarkIcon className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {matches.map((m) => {
          const tx = m.transaction
          return (
            <div key={m.id} className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
              <button type="button" onClick={() => onOpen(m.key)} className="min-w-0 text-left outline-none focus-visible:underline sm:flex-1">
                <span className="block truncate text-sm font-medium">{m.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.matches.due(fmt.dayMonth.format(parseDate(m.date)))} · {t.matches.seen(fmt.dayMonth.format(parseDate(tx.date)))}{" "}
                  <Sensitive>{fmt.euro.format(tx.amount)}</Sensitive> · <Sensitive>{tx.description}</Sensitive>
                </span>
              </button>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={busy === m.id} onClick={() => void answer(m, "paid")}>
                  <CheckIcon />
                  {t.matches.markPaid}
                </Button>
                <Button size="sm" variant="outline" disabled={busy === m.id} onClick={() => void answer(m, "dismiss")}>
                  <XIcon />
                  {t.matches.notThis}
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
