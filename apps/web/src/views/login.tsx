import * as React from "react"
import { LockKeyholeIcon } from "lucide-react"
import { cn } from "cn"

import { LanguageSwitch } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/i18n"
import { ApiError, login } from "@/lib/api"

/** A hidden username, so password managers file the masterpass under this server. */
export function UsernameHint() {
  return <input type="text" name="username" autoComplete="username" value="autocratico" readOnly tabIndex={-1} aria-hidden className="sr-only" />
}

/** A sentence with `commands` in it, the commands in monospace. */
export function Hint({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      {text.split("`").map((part, i) =>
        i % 2 ? (
          <code key={i} className="rounded-sm bg-muted px-1 font-mono">
            {part}
          </code>
        ) : (
          part
        )
      )}
    </p>
  )
}

/** Shown when the owner exists but this browser has no session. */
export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useI18n()
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(password)
      onLoggedIn()
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      if (status === 429) setError(t.login.locked(Math.max(1, Math.ceil((err as ApiError).retryAfter / 60))))
      else if (status === 401) setError(t.login.wrong)
      else setError((err as Error).message)
      setPassword("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-gutter pt-safe pb-safe">
      <Card className="w-full max-w-sm rounded-xl">
        <CardHeader>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <LockKeyholeIcon className="size-5" />
            </span>
            <LanguageSwitch compact={false} />
          </div>
          <CardTitle className="text-xl font-medium tracking-tight">{t.login.title}</CardTitle>
          <CardDescription>{t.login.body}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <UsernameHint />
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">{t.login.password}</span>
              <Input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={error !== null || undefined}
                autoFocus
              />
            </label>
            {error && <p className="text-sm text-status-overdue">{error}</p>}
            <Button type="submit" disabled={busy || !password}>
              {t.login.submit}
            </Button>
            <Hint text={t.login.forgot} />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
