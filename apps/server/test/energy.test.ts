/** Energy offers: the ranking in scripts/offers.py on a tiny file in ARERA's format, and the weekly job's advice. */
import { execFileSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { Jobs } from "../src/jobs.ts"
import { setup } from "./helpers.ts"

const ROOT = resolve(import.meta.dirname, "../../..")

const offer = (code: string, body: string) => `<offerta>
  <IdentificativiOfferta><PIVA_UTENTE>01234567890</PIVA_UTENTE><COD_OFFERTA>${code}</COD_OFFERTA></IdentificativiOfferta>
  ${body}
  <ValiditaOfferta><DATA_INIZIO>01/10/2026_00:00:00</DATA_INIZIO><DATA_FINE>31/10/2026_23:59:59</DATA_FINE></ValiditaOfferta>
</offerta>`
const detail = (kind: string, extra = "") =>
  `<DettaglioOfferta><TIPO_MERCATO>01</TIPO_MERCATO><OFFERTA_SINGOLA>SI</OFFERTA_SINGOLA><TIPO_CLIENTE>01</TIPO_CLIENTE><TIPO_OFFERTA>${kind}</TIPO_OFFERTA><TIPOLOGIA_ATT_CONTR>99</TIPOLOGIA_ATT_CONTR><NOME_OFFERTA>Offer ${kind}</NOME_OFFERTA><DURATA>24</DURATA><ModalitaAttivazione><MODALITA>02</MODALITA></ModalitaAttivazione>${extra}</DettaglioOfferta>`
const component = (macro: string, prices: string) => `<ComponenteImpresa><NOME>c</NOME><TIPOLOGIA>01</TIPOLOGIA><MACROAREA>${macro}</MACROAREA>${prices}</ComponenteImpresa>`
const price = (p: number, unit: string, band = "") => `<IntervalloPrezzi>${band ? `<FASCIA_COMPONENTE>${band}</FASCIA_COMPONENTE>` : ""}<PREZZO>${p}</PREZZO><UNITA_MISURA>${unit}</UNITA_MISURA></IntervalloPrezzi>`

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListaOfferteMercatoLibero xmlns="http://www.acquirenteunico.it/schemas/SII_AU/OffertaRetail/01">
${offer("FIXED3", `${detail("01")}<TipoPrezzo><TIPOLOGIA_FASCE>03</TIPOLOGIA_FASCE></TipoPrezzo>${component("01", price(100, "01"))}${component("04", price(0.1, "03", "01") + price(0.1, "03", "02") + price(0.1, "03", "03"))}
  <Sconto><NOME>s</NOME><VALIDITA>01</VALIDITA><Condizione><CONDIZIONE_APPLICAZIONE>00</CONDIZIONE_APPLICAZIONE></Condizione><PrezziSconto><TIPOLOGIA>01</TIPOLOGIA><UNITA_MISURA>01</UNITA_MISURA><PREZZO>20</PREZZO></PrezziSconto></Sconto>
  <Sconto><NOME>web</NOME><VALIDITA>01</VALIDITA><Condizione><CONDIZIONE_APPLICAZIONE>01</CONDIZIONE_APPLICAZIONE></Condizione><PrezziSconto><TIPOLOGIA>01</TIPOLOGIA><UNITA_MISURA>01</UNITA_MISURA><PREZZO>50</PREZZO></PrezziSconto></Sconto>`)}
${offer("VARIABLE", `${detail("02")}<TipoPrezzo><TIPOLOGIA_FASCE>01</TIPOLOGIA_FASCE></TipoPrezzo><RiferimentiPrezzoEnergia><IDX_PREZZO_ENERGIA>12</IDX_PREZZO_ENERGIA></RiferimentiPrezzoEnergia>${component("01", price(60, "01"))}${component("04", price(0.01, "03", "01"))}`)}
${offer("NONRESIDENT", `${detail("01", "<DOMESTICO_RESIDENTE>02</DOMESTICO_RESIDENTE>")}<TipoPrezzo><TIPOLOGIA_FASCE>01</TIPOLOGIA_FASCE></TipoPrezzo>${component("01", price(1, "01"))}`)}
${offer("ZONE", `${detail("01")}<TipoPrezzo><TIPOLOGIA_FASCE>01</TIPOLOGIA_FASCE></TipoPrezzo>${component("01", price(1, "01"))}<ZoneOfferta><PROVINCIA>015</PROVINCIA></ZoneOfferta>`)}
</ListaOfferteMercatoLibero>`

const RANK = `
import json, sys
from datetime import datetime
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import offers
supplies = [{"id": "home", "commodity": "electricity", "annual": 1000, "resident": True}]
rows = offers.rank(Path(sys.argv[2]), supplies, {"PUN": 0.2, "PSV": 0.8}, {"01234567890": "Example Energia"}, datetime(2026, 10, 7, 12))["home"]
print(json.dumps([[r["code"], r["cost"], r["variable"], r["supplier"]] for r in rows]))
`

describe("energy offers", () => {
  it("prices the supplier's part of eligible offers", () => {
    const dir = mkdtempSync(join(tmpdir(), "offers-"))
    writeFileSync(join(dir, "offers.xml"), XML)
    writeFileSync(join(dir, "rank.py"), RANK)
    const out = JSON.parse(execFileSync("python3", [join(dir, "rank.py"), join(ROOT, "scripts"), join(dir, "offers.xml")], { encoding: "utf8" }))
    // fixed: 100 + 1000 kWh × 0.10 - 20 (the e-billing discount is conditional); variable: 60 + 1000 × (0.2 × 1.1 + 0.01)
    expect(out).toEqual([
      ["FIXED3", 180, false, "Example Energia"],
      ["VARIABLE", 290, true, "Example Energia"],
    ])
  })

  it("tells once per best offer when a fixed price ends or switching pays", async () => {
    const { s, data } = setup()
    const bin = mkdtempSync(join(tmpdir(), "py-"))
    const result = {
      supplies: [
        { id: "home-electricity", title: "Home", fixed_until: "2099-01-31", current: 500, best: { name: "Cheap", supplier: "X", cost: 400, months: 24, code: "C1" }, saving: 100, offers: 3, file: "", published: "2026-10-07" },
        { id: "small", title: "Small", fixed_until: null, current: 500, best: { name: "Same", supplier: "Y", cost: 490, months: 12, code: "C2" }, saving: 10, offers: 3, file: "", published: "2026-10-07" },
      ],
    }
    const fake = join(bin, "python")
    writeFileSync(fake, `#!/bin/sh\necho '${JSON.stringify(result)}'\n`)
    chmodSync(fake, 0o755)
    mkdirSync(join(data, "energy"), { recursive: true })
    const sent: string[] = []
    const jobs = new Jobs({
      config: { ...s.config, python: fake },
      store: s.store,
      inbox: s.inbox,
      claude: s.claude,
      repo: s.repo,
      reminders: s.reminders,
      finance: s.finance,
      notifier: () => ({ notify: async (text: string) => void sent.push(text) }),
    })
    expect((await jobs.trigger("energy")).ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain("Home")
    expect(sent[0]).toContain("||100 €||")
    expect(sent[0]).not.toContain("Small") // saves 2%: not worth a message
    await jobs.trigger("energy")
    expect(sent).toHaveLength(1) // same best offer: told already
  })
})
