// Postgres storage: one table, created on start. Only what the waitlist needs (no IP, no user agent).
import postgres from "postgres"

import type { Judgment } from "./jev.ts"

export interface Signup {
  email: string
  locale: string | null
  source: Record<string, string>
  judgment: Judgment | null
}

export interface Store {
  /** Adds the address; true when it is new, false when it was already on the list. */
  add(signup: Signup): Promise<boolean>
  ping(): Promise<void>
  close(): Promise<void>
}

const SCHEMA = `
create table if not exists waitlist (
  id          bigserial primary key,
  email       text not null unique,
  created_at  timestamptz not null default now(),
  consent_at  timestamptz not null default now(),
  locale      text,
  source      jsonb not null default '{}',
  jev         jsonb
)`

/** Connects with `url`, or with the standard PGHOST / PGUSER / PGPASSWORD / PGDATABASE variables. */
export async function pgStore(url?: string): Promise<Store> {
  const opts = { max: 4, idle_timeout: 60, connect_timeout: 10, onnotice: () => {} }
  const sql = url ? postgres(url, opts) : postgres(opts)
  await sql.unsafe(SCHEMA)
  return {
    async add({ email, locale, source, judgment }) {
      const rows = await sql`
        insert into waitlist (email, locale, source, jev)
        values (${email}, ${locale}, ${sql.json(source)}, ${judgment ? sql.json({ ...judgment }) : null})
        on conflict (email) do nothing
        returning id`
      return rows.length > 0
    },
    async ping() {
      await sql`select 1`
    },
    close: () => sql.end({ timeout: 5 }),
  }
}
