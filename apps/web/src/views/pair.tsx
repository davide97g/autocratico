import * as React from "react"
import { KeyRoundIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/i18n"
import { pair } from "@/lib/api"

/** Shown until this browser is paired with the server (production mode). */
export function Pair({ onPaired }: { onPaired: () => void }) {
  const { t } = useI18n()
  const [code, setCode] = React.useState("")
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(false)
    try {
      await pair(code, name.trim() || undefined)
      onPaired()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-gutter pt-safe pb-safe">
      <Card className="w-full max-w-sm rounded-xl">
        <CardHeader>
          <span className="mb-2 flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRoundIcon className="size-5" />
          </span>
          <CardTitle className="text-xl font-medium tracking-tight">{t.pair.title}</CardTitle>
          <CardDescription>{t.pair.body}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">{t.pair.code}</span>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                className="font-mono tracking-widest"
                aria-invalid={error || undefined}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">{t.pair.name}</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.pair.namePlaceholder} />
            </label>
            {error && <p className="text-sm text-status-overdue">{t.pair.invalid}</p>}
            <Button type="submit" disabled={busy || code.replace(/\D/g, "").length < 8}>
              {t.pair.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
