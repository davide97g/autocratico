// The phishing analyses of the demo's fake emails: what the server stores after the agent flags one
// (the agent's reasons, then the checks scripts/phishing.py makes when an email is saved). Made up.
import type { PhishingAnalysis } from "@autocratico/core"

/** "Agenzia delle Entrate" promising a refund for the card's details. */
export function refundPhishing(at: string): PhishingAnalysis {
  return {
    risk: "high",
    verdict:
      "Finge di essere l'Agenzia delle Entrate per farti inserire i dati della carta su un sito falso. Nel registro non c'è nessun rimborso in attesa.",
    advice: "Non aprire il link e non inserire dati. Se hai dubbi, controlla il cassetto fiscale entrando da agenziaentrate.gov.it.",
    signals: [
      {
        kind: "sender",
        code: "",
        severity: "high",
        evidence: "noreply@agenzia-entrate-servizi.info",
        why: "Il nome dice Agenzia delle Entrate, ma l'indirizzo non è di agenziaentrate.gov.it.",
        source: "agent",
      },
      {
        kind: "credentials",
        code: "",
        severity: "high",
        evidence: "confermi i dati della carta entro 48 ore",
        why: "L'Agenzia non chiede mai i dati della carta: i rimborsi arrivano sul conto indicato nella dichiarazione.",
        source: "agent",
      },
      {
        kind: "context",
        code: "",
        severity: "medium",
        evidence: "rimborso di 284,60 € a suo favore",
        why: "Nessuna dichiarazione o pratica nel registro prevede un rimborso.",
        source: "agent",
      },
      { kind: "auth", code: "dmarc_fail", severity: "high", evidence: "dmarc=fail (agenzia-entrate-servizi.info)", why: "", source: "check" },
      { kind: "sender", code: "impersonation", severity: "high", evidence: "Agenzia Entrate Rimborsi <noreply@agenzia-entrate-servizi.info>", why: "", source: "check" },
      { kind: "reply_to", code: "reply_to_mismatch", severity: "medium", evidence: "rimborsi.ufficio@gmail.com", why: "", source: "check" },
      { kind: "link", code: "link_mismatch", severity: "high", evidence: "www.agenziaentrate.gov.it/rimborsi → agenziaentrate-rimborsi.top", why: "", source: "check" },
      { kind: "link", code: "link_lookalike", severity: "high", evidence: "agenziaentrate-rimborsi.top", why: "", source: "check" },
      { kind: "urgency", code: "urgency", severity: "medium", evidence: "entro 48 ore", why: "", source: "check" },
    ],
    checks: {
      auth: { spf: "softfail", dkim: "none", dmarc: "fail" },
      from: { name: "Agenzia Entrate Rimborsi", address: "noreply@agenzia-entrate-servizi.info", domain: "agenzia-entrate-servizi.info" },
      reply_to: "gmail.com",
      return_path: "agenzia-entrate-servizi.info",
      links: [
        {
          text: "www.agenziaentrate.gov.it/rimborsi",
          href: "https://agenziaentrate-rimborsi.top/conferma?id=8812",
          domain: "agenziaentrate-rimborsi.top",
          flags: ["mismatch", "lookalike", "not_official", "odd_tld"],
        },
      ],
      partial: false,
    },
    analyzed: at,
    dismissed: "",
  }
}

/** A "Poste" parcel held until a small fee is paid. */
export function parcelPhishing(at: string): PhishingAnalysis {
  return {
    risk: "high",
    verdict: "Finto avviso di Poste Italiane: chiede pochi euro per la consegna per avere i dati della carta.",
    advice: "Non pagare e non aprire il link. Le giacenze vere si controllano sull'app o sul sito di Poste.",
    signals: [
      {
        kind: "sender",
        code: "",
        severity: "high",
        evidence: "avvisi@poste-consegne-online.top",
        why: "Il dominio non è poste.it: imita Poste Italiane.",
        source: "agent",
      },
      {
        kind: "payment",
        code: "",
        severity: "medium",
        evidence: "Paga 1,99 € entro 24 ore",
        why: "Una piccola cifra con fretta è il modo tipico per farsi dare i dati della carta.",
        source: "agent",
      },
      {
        kind: "context",
        code: "",
        severity: "low",
        evidence: "Il tuo pacco non può essere consegnato",
        why: "Non risultano spedizioni attese nel registro o nelle email.",
        source: "agent",
      },
      { kind: "auth", code: "spf_fail", severity: "medium", evidence: "spf=fail", why: "", source: "check" },
      { kind: "link", code: "link_odd_tld", severity: "medium", evidence: "poste-consegne-online.top", why: "", source: "check" },
      { kind: "urgency", code: "urgency", severity: "medium", evidence: "entro 24 ore", why: "", source: "check" },
    ],
    checks: {
      auth: { spf: "fail", dkim: "none", dmarc: "fail" },
      from: { name: "Poste Spedizioni", address: "avvisi@poste-consegne-online.top", domain: "poste-consegne-online.top" },
      reply_to: "",
      return_path: "poste-consegne-online.top",
      links: [
        {
          text: "Riprogramma la consegna",
          href: "https://poste-consegne-online.top/pagamento",
          domain: "poste-consegne-online.top",
          flags: ["odd_tld"],
        },
      ],
      partial: false,
    },
    analyzed: at,
    dismissed: "",
  }
}
