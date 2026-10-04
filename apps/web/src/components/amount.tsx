import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { useI18n } from "@/i18n"
import type { Occurrence } from "@/lib/api"

/** An occurrence's amount: estimates marked with ≈, payments of unknown amount said so. */
export function Amount({ o, className }: { o: Pick<Occurrence, "amount" | "amount_basis">; className?: string }) {
  const { t, fmt } = useI18n()
  if (o.amount_basis === "unknown") return <span className={cn("italic", className)}>{t.payments.unknownAmount}</span>
  if (o.amount == null) return null
  const estimate = o.amount_basis === "estimate"
  return (
    <span className={className} title={estimate ? t.payments.estimate : undefined}>
      {estimate && "≈ "}
      <Sensitive>{fmt.euro.format(o.amount)}</Sensitive>
    </span>
  )
}
