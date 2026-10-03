// Cheap, deterministic checks that run before any model is asked: shape and a domain that takes mail.
import { promises as dns } from "node:dns"
import { domainToASCII } from "node:url"

const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

export interface Address {
  email: string
  local: string
  domain: string
}

/** Lowercased address with an ASCII (punycode) domain, or null when it is not a plausible address. */
export function parseEmail(input: string): Address | null {
  const raw = input.trim()
  if (raw.length > 254) return null
  const at = raw.lastIndexOf("@")
  if (at < 1) return null
  const local = raw.slice(0, at).toLowerCase()
  const domain = domainToASCII(raw.slice(at + 1).toLowerCase())
  if (!domain || local.length > 64 || !LOCAL.test(local)) return null
  const labels = domain.split(".")
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels.at(-1)!)) return null
  return { email: `${local}@${domain}`, local, domain }
}

export type DomainCheck = "ok" | "none" | "unknown"

export interface Resolver {
  resolveMx(domain: string): Promise<{ exchange: string }[]>
  resolve4(domain: string): Promise<string[]>
  resolve6(domain: string): Promise<string[]>
}

const GONE = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN"])

/**
 * "none" when the domain cannot receive mail: no MX, or a null MX (RFC 7505), and no address
 * records to fall back on. DNS failures other than "does not exist" give "unknown" (fail open).
 */
export async function checkDomain(domain: string, resolver: Resolver = dns): Promise<DomainCheck> {
  const gone = (e: unknown) => GONE.has((e as { code?: string }).code ?? "")
  try {
    const mx = await resolver.resolveMx(domain)
    if (mx.length === 1 && mx[0].exchange === "") return "none"
    if (mx.length > 0) return "ok"
  } catch (e) {
    if (!gone(e)) return "unknown"
  }
  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      if ((await lookup.call(resolver, domain)).length > 0) return "ok"
    } catch (e) {
      if (!gone(e)) return "unknown"
    }
  }
  return "none"
}
