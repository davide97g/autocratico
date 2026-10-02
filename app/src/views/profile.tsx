import { Sensitive } from "@/components/privacy"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n"
import type { Profile as ProfileData, Value } from "@/lib/api"
import { humanize } from "@/lib/format"

const isEmpty = (v: Value) => v === "TODO" || v === "" || v == null

function Section({ title, fields }: { title: string; fields: Record<string, Value> }) {
  const { t } = useI18n()
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 @xl:grid-cols-2">
        {Object.entries(fields).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-lg bg-muted px-4 py-2.5">
            <span className="text-xs text-muted-foreground">{humanize(k)}</span>
            {isEmpty(v) ? (
              <span className="text-sm text-muted-foreground italic">{t.profile.toFill}</span>
            ) : (
              <span className="truncate text-sm font-medium">
                <Sensitive>{typeof v === "boolean" ? (v ? t.profile.yes : t.profile.no) : String(v)}</Sensitive>
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function Profile({ profile }: { profile: ProfileData }) {
  const { t } = useI18n()
  const label = (name: string) => t.profile.sections[name] ?? humanize(name)
  const sections = Object.entries(profile).flatMap(([name, value]) =>
    Array.isArray(value)
      ? value.map((v, i) => ({ title: `${label(name)}${value.length > 1 ? ` ${i + 1}` : ""}`, fields: v }))
      : [{ title: label(name), fields: value }]
  )
  return (
    <div className="grid gap-6 @3xl:grid-cols-2">
      {sections.map((s) => (
        <Section key={s.title} {...s} />
      ))}
    </div>
  )
}
