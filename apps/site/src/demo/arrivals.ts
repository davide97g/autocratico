// What can arrive in the demo's inbox, and what the agent does with each (the triage profile, scripted).
import { eur, fmtDay, fmtShort, iso } from "../time.ts"
import { s } from "./core.ts"
import { D, PERSON, YEAR, type Deadline } from "./data.ts"

export type DocId = "multa" | "phishing" | "bollo" | "whatsapp"

export const DOCS: { id: DocId; icon: string; source: string; title: string; file: string }[] = [
  { id: "multa", icon: "camera", source: "Foto su Telegram", title: "Verbale multa ZTL", file: "IMG_2041.HEIC" },
  { id: "phishing", icon: "mail", source: "Email · rimborsi@agenzia-entrate-servizi.info", title: "Rimborso fiscale in attesa: conferma i tuoi dati", file: "2 link, nessun allegato" },
  { id: "bollo", icon: "mic", source: "Nota vocale su Telegram · 0:07", title: "«Il bollo della Panda scade a fine mese»", file: "voce.ogg" },
  { id: "whatsapp", icon: "message-circle", source: "Export di WhatsApp", title: "Chat «Condominio via Roma»", file: "WhatsApp Chat.zip" },
]

export interface Arrival {
  lines: { icon: string; html: string; kind?: "warn" | "ok" }[]
  diff?: string[]
  commit: string
  files: string[]
  add: Deadline[]
  flagged?: boolean
  telegram: { html: string; warn?: boolean; deadline?: string }
}

const code = (t: string) => `<code>${t}</code>`

export function arrival(id: DocId): Arrival {
  switch (id) {
    case "multa":
      return {
        lines: [
          { icon: "image", html: `Foto HEIC: ne salvo una copia JPEG e leggo il verbale` },
          { icon: "search", html: `Verbale n. ${s("2026/0004471")}, Polizia Locale, accesso in ZTL` },
          { icon: "car", html: `Targa ${s(PERSON.plate)}: è la ${PERSON.car} del profilo` },
          { icon: "calendar", html: `Notificato oggi: ridotto del 30% entro 5 giorni, ${s(eur(58.1))}` },
        ],
        diff: [`[[deadline]]`, `id = "multa-ztl-ridotta"`, `area = "vehicles"`, `severity = "high"`, `date = ${iso(D.multa5)}`, `amount = ${s("58.10")}`],
        commit: "Agente: multa ZTL, pagamento ridotto entro 5 giorni",
        files: ["deadlines.toml", `cases/${YEAR}-multa-ztl/README.md`, `archive/${YEAR}/veicoli/verbale-ztl.jpg`],
        add: [
          { id: "multa5", title: "Multa ZTL, pagamento ridotto", area: "Veicoli", severity: "high", date: D.multa5, amount: 58.1 },
          { id: "multa60", title: "Multa ZTL, importo pieno", area: "Veicoli", severity: "high", date: D.multa60, amount: 83 },
        ],
        telegram: { html: `<b>Multa ZTL</b>: pagamento ridotto entro il ${fmtShort(D.multa5)}, ${s(eur(58.1))}. Ti preparo i dati del verbale, paghi tu.`, deadline: "multa5" },
      }
    case "phishing":
      return {
        lines: [
          { icon: "mail", html: `Leggo l'email da ${code("agenzia-entrate-servizi.info")}` },
          { icon: "triangle-alert", html: `Il dominio non è quello dell'Agenzia delle Entrate (${code("agenziaentrate.gov.it")})`, kind: "warn" },
          { icon: "triangle-alert", html: `Chiede i dati della carta per «sbloccare il rimborso»`, kind: "warn" },
          { icon: "lock", html: `Non apro i due link. Nessuna scadenza aggiunta.` },
        ],
        commit: "Agente: email segnalata come possibile phishing",
        files: ["inbox/…/item.json"],
        add: [],
        flagged: true,
        telegram: { html: `<b>Possibile phishing: non aprire link e non pagare.</b> Un falso rimborso dell'Agenzia delle Entrate è nell'inbox.`, warn: true },
      }
    case "bollo":
      return {
        lines: [
          { icon: "audio-lines", html: `Trascrivo la nota vocale sul server: «Il bollo della Panda scade a fine mese»` },
          { icon: "car", html: `Veicolo nel profilo: ${s(PERSON.car)}, targa ${s(PERSON.plate)}` },
          { icon: "calendar", html: `Scade il ${fmtDay(D.bollo)}, ogni anno. Promemoria a 7 e a 3 giorni` },
        ],
        diff: [`[[deadline]]`, `id = "bollo-auto"`, `area = "vehicles"`, `date = ${iso(D.bollo)}`, `repeat = "yearly"`, `remind_days = [7, 3]`],
        commit: "Agente: bollo auto, ogni anno a fine mese",
        files: ["deadlines.toml"],
        add: [{ id: "bollo", title: "Bollo auto", area: "Veicoli", severity: "medium", date: D.bollo, amount: 186.4, estimate: true }],
        telegram: { html: `<b>Bollo auto</b> aggiunto: scade il ${fmtDay(D.bollo)}. Ti avviso a 7 e a 3 giorni.`, deadline: "bollo" },
      }
    case "whatsapp":
      return {
        lines: [
          { icon: "message-circle", html: `Apro l'export: 214 messaggi, 3 allegati` },
          { icon: "search", html: `Assemblea straordinaria il ${fmtDay(D.assemblea)}: lavori al tetto` },
          { icon: "receipt", html: `Quota stimata ${s(eur(1200))}, da approvare in assemblea` },
          { icon: "folder-open", html: `Collego tutto alla pratica ${code(`cases/${YEAR}-condominio`)}` },
        ],
        diff: [`[[deadline]]`, `id = "assemblea-tetto"`, `area = "home"`, `date = ${iso(D.assemblea)}`, `case = "${YEAR}-condominio"`],
        commit: "Agente: assemblea straordinaria del condominio",
        files: ["deadlines.toml", `cases/${YEAR}-condominio/README.md`],
        add: [{ id: "assemblea", title: "Assemblea condominio, lavori al tetto", area: "Casa", severity: "medium", date: D.assemblea }],
        telegram: { html: `<b>Assemblea condominio</b> il ${fmtDay(D.assemblea)}: si votano i lavori al tetto, quota stimata ${s(eur(1200))}.`, deadline: "assemblea" },
      }
  }
}
