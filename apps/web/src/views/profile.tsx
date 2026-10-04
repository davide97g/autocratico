import * as React from "react"
import {
  BriefcaseBusinessIcon,
  CarIcon,
  CheckIcon,
  CopyIcon,
  FolderIcon,
  GlobeIcon,
  HeartPulseIcon,
  HouseIcon,
  IdCardIcon,
  LandmarkIcon,
  type LucideIcon,
  PlugZapIcon,
  UserRoundIcon,
  UsersRoundIcon,
  WalletIcon,
} from "lucide-react"
import { cn } from "cn"

import { Documents } from "@/components/documents"
import { Sensitive } from "@/components/privacy"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import type { Profile as ProfileData, Value } from "@/lib/api"
import { humanize, parseDate } from "@/lib/format"

type Row = Record<string, Value>

const SECTION_ICONS: Record<string, LucideIcon> = {
  person: UserRoundIcon,
  work: BriefcaseBusinessIcon,
  property: HouseIcon,
  vehicle: CarIcon,
  family: UsersRoundIcon,
  utilities: PlugZapIcon,
  foreign_account: GlobeIcon,
  documents: IdCardIcon,
  accounts: WalletIcon,
  bank: LandmarkIcon,
  health: HeartPulseIcon,
}

/** Keys that name an entry of a list section (a property, a vehicle): shown as its heading. */
const HEADING_KEYS = ["name", "nome", "title", "titolo", "model", "modello"]

const isEmpty = (v: Value) => v === "TODO" || v === "" || v == null

/**
 * Files linked from the profile: a value made only of paths under `archive/` or `inbox/`
 * (one, or several separated by commas or new lines; a TOML array works too).
 */
function filePaths(v: unknown): string[] | null {
  const parts = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v.split(/[,\n]/)
      : []
  const paths = parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
  return paths.length && paths.every((p) => /^(archive|inbox)\/[^\s]/.test(p))
    ? paths
    : null
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(id)
  }, [copied])
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
            aria-label={copied ? t.profile.copied : t.profile.copy}
            onClick={() =>
              void navigator.clipboard
                .writeText(text)
                .then(() => setCopied(true))
            }
          />
        }
      >
        {copied ? <CheckIcon className="text-status-done" /> : <CopyIcon />}
      </TooltipTrigger>
      <TooltipContent>
        {copied ? t.profile.copied : t.profile.copy}
      </TooltipContent>
    </Tooltip>
  )
}

function Field({ name, value }: { name: string; value: Value }) {
  const { t, fmt } = useI18n()
  const files = filePaths(value)
  if (files) {
    return (
      <div className="flex flex-col gap-2 @md:col-span-full">
        <dt className="text-xs text-muted-foreground">{humanize(name)}</dt>
        <dd>
          <Documents paths={files} className="max-w-sm" />
        </dd>
      </div>
    )
  }
  const text =
    typeof value === "boolean"
      ? value
        ? t.profile.yes
        : t.profile.no
      : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? fmt.long.format(parseDate(value))
        : String(value)
  return (
    <div className="group flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{humanize(name)}</dt>
      {isEmpty(value) ? (
        <dd className="text-sm text-muted-foreground italic">
          {t.profile.toFill}
        </dd>
      ) : (
        <dd className="-my-1 flex min-w-0 items-start gap-1">
          <Sensitive className="min-w-0 py-1 text-sm leading-snug font-medium wrap-anywhere">
            {text}
          </Sensitive>
          <CopyButton text={text} />
        </dd>
      )}
    </div>
  )
}

function Fields({ row, skip = [] }: { row: Row; skip?: string[] }) {
  const entries = Object.entries(row).filter(([k]) => !skip.includes(k))
  // Linked files close the list, after the plain values.
  const sorted = [
    ...entries.filter(([, v]) => !filePaths(v)),
    ...entries.filter(([, v]) => filePaths(v)),
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-3">
      {sorted.map(([k, v]) => (
        <Field key={k} name={k} value={v} />
      ))}
    </dl>
  )
}

function SectionIcon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const Icon = SECTION_ICONS[name] ?? FolderIcon
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
        className
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

/** `[person]`: the name as the card's heading, the rest below it. */
function Person({ row }: { row: Row }) {
  const { t } = useI18n()
  const name =
    typeof row.name === "string" && !isEmpty(row.name) ? row.name : null
  return (
    <Card className="@container rounded-xl">
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary text-lg text-primary-foreground">
              <Sensitive>{name ? initials(name) : "?"}</Sensitive>
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserRoundIcon className="size-3.5" />
              {t.profile.sections.person}
            </span>
            <span className="text-2xl font-medium tracking-tight wrap-anywhere">
              <Sensitive when={Boolean(name)}>
                {name ?? t.sidebar.profileMissing}
              </Sensitive>
            </span>
          </div>
        </div>
        <Fields row={row} skip={["name"]} />
      </CardContent>
    </Card>
  )
}

/** A section: one table (`[work]`) or a list of them (`[[vehicle]]`), each under its own heading. */
function Section({ name, rows }: { name: string; rows: Row[] }) {
  const { t } = useI18n()
  const title = t.profile.sections[name] ?? humanize(name)
  return (
    <Card className="@container mb-6 break-inside-avoid rounded-xl">
      <CardHeader className="flex flex-row items-center gap-3">
        <SectionIcon name={name} />
        <CardTitle className="mr-auto text-lg font-medium tracking-tight">
          {title}
        </CardTitle>
        {rows.length > 1 && (
          <span className="font-mono text-xs text-muted-foreground">
            {rows.length}
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col">
        {rows.map((row, i) => {
          const key = HEADING_KEYS.find(
            (k) => typeof row[k] === "string" && !isEmpty(row[k])
          )
          const heading = key
            ? String(row[key])
            : rows.length > 1
              ? `${title} ${i + 1}`
              : null
          return (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-4",
                i > 0 && "mt-5 border-t pt-5"
              )}
            >
              {heading && (
                <span className="text-base font-medium wrap-anywhere">
                  <Sensitive when={Boolean(key)}>{heading}</Sensitive>
                </span>
              )}
              <Fields row={row} skip={key ? [key] : []} />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function Profile({ profile }: { profile: ProfileData }) {
  const person =
    profile.person && !Array.isArray(profile.person) ? profile.person : null
  const sections = Object.entries(profile)
    .filter(([name]) => name !== "person" || !person)
    .map(([name, value]) => ({
      name,
      rows: Array.isArray(value) ? value : [value],
    }))
    .filter((s) => s.rows.length > 0)
  return (
    <div className="flex flex-col gap-6">
      {person && <Person row={person} />}
      <div className="gap-6 @3xl:columns-2 @7xl:columns-3">
        {sections.map((s) => (
          <Section key={s.name} {...s} />
        ))}
      </div>
    </div>
  )
}
