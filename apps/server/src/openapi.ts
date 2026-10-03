/** OpenAPI document for clients (future native apps), built from the zod schemas in @autocratico/core. */
import {
  Activity,
  Chat,
  Data,
  Device,
  InboxDetail,
  InboxItem,
  Status,
} from "@autocratico/core"
import { z } from "zod"

type Route = {
  method: "get" | "post" | "delete"
  path: string
  summary: string
  body?: z.ZodType
  response?: z.ZodType
  scope?: "ingest"
}

const Ok = z.object({ ok: z.boolean() })

export const ROUTES: Route[] = [
  { method: "get", path: "/api/health", summary: "Liveness, no authentication", response: Ok },
  { method: "get", path: "/api/session", summary: "Whether this client is paired", response: z.object({ paired: z.boolean(), auth: z.enum(["dev", "prod"]), device: Device.nullable() }) },
  { method: "post", path: "/api/pair", summary: "Exchange a pairing code for a device cookie (or token)", body: z.object({ code: z.string(), name: z.string().optional(), token: z.boolean().optional() }), response: z.object({ device: Device, token: z.string().optional() }) },
  { method: "get", path: "/api/data", summary: "Agenda, cases, profile and catalog", response: Data },
  { method: "post", path: "/api/done", summary: "Mark an occurrence as done or not", body: z.object({ key: z.string(), done: z.boolean() }), response: z.object({ key: z.string(), done_on: z.string().nullable() }) },
  { method: "post", path: "/api/chat", summary: "Ask the agent; streams NDJSON ChatEvent lines, first {type:'chat', id}", body: z.object({ message: z.string(), chat: z.string().nullable().optional(), view: z.string().optional(), locale: z.string().optional() }) },
  { method: "get", path: "/api/chats", summary: "Conversations, newest first", response: z.array(Chat) },
  { method: "delete", path: "/api/chats/{id}", summary: "Delete a conversation", response: Ok },
  { method: "post", path: "/api/ingest", summary: "Add documents to the inbox: multipart (file fields, text, title) or JSON {text, title}", scope: "ingest", response: InboxItem },
  { method: "get", path: "/api/inbox", summary: "Inbox items, newest first", response: z.array(InboxItem) },
  { method: "get", path: "/api/inbox/{id}", summary: "One item with its text", response: InboxDetail },
  { method: "get", path: "/api/inbox/{id}/files/{name}", summary: "Download an attachment" },
  { method: "post", path: "/api/inbox/{id}/status", summary: "Set an item to new (process again) or ignored", body: z.object({ status: z.enum(["new", "ignored"]) }), response: Ok },
  { method: "get", path: "/api/activity", summary: "Job runs and changes to the data", response: Activity },
  { method: "get", path: "/api/activity/{hash}", summary: "One change as a patch", response: z.object({ patch: z.string() }) },
  { method: "post", path: "/api/activity/{hash}/revert", summary: "Undo one change", response: z.object({ hash: z.string() }) },
  { method: "post", path: "/api/jobs/{name}", summary: "Run a job now (gmail, triage, reminders, digest, backup)" },
  { method: "get", path: "/api/status", summary: "Server, jobs and integrations", response: Status },
  { method: "get", path: "/api/devices", summary: "Paired devices", response: z.array(Device) },
  { method: "post", path: "/api/devices", summary: "Create a pairing code, or an ingest token for shortcuts", body: z.object({ name: z.string(), scope: z.enum(["full", "ingest"]) }), response: z.object({ code: z.string().optional(), token: z.string().optional() }) },
  { method: "delete", path: "/api/devices/{id}", summary: "Revoke a device", response: Ok },
  { method: "post", path: "/api/telegram/pair", summary: "Create a code to pair a Telegram chat with /start <code>", response: z.object({ code: z.string(), bot: z.string().nullable() }) },
  { method: "delete", path: "/api/telegram/chats/{id}", summary: "Unpair a Telegram chat", response: Ok },
]

function schema(s: z.ZodType) {
  return z.toJSONSchema(s, { unrepresentable: "any", io: "output" })
}

export function openapi(version: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of ROUTES) {
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }))
    paths[r.path] ??= {}
    paths[r.path][r.method] = {
      summary: r.summary,
      ...(params.length ? { parameters: params } : {}),
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: schema(r.body) } } } } : {}),
      responses: {
        200: r.response ? { description: "OK", content: { "application/json": { schema: schema(r.response) } } } : { description: "OK" },
        401: { description: "Not paired, or Cloudflare Access token missing" },
      },
      ...(r.path === "/api/health" ? { security: [] } : {}),
      ...(r.scope ? { "x-scope": r.scope } : {}),
    }
  }
  return {
    openapi: "3.1.0",
    info: { title: "Autocratico API", version },
    components: {
      securitySchemes: {
        device: { type: "http", scheme: "bearer", description: "Device token from pairing (or the autocratico_device cookie)" },
      },
    },
    security: [{ device: [] }],
    paths,
  }
}
