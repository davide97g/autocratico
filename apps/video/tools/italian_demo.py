"""Turn a fresh copy of example/ into the Italian demo register the trailer films.

Everything here is made up, like example/ itself: the names, dates and amounts only have to look
plausible on screen. The copy lives in var/video/appdata (gitignored); example/ is never touched.

  rm -rf ../../var/video/appdata
  AUTOCRATICO_DATA=$PWD/../../var/video/appdata python3 ../../scripts/init.py
  python3 tools/italian_demo.py ../../var/video/appdata          (from apps/video)
"""
import json
import subprocess
import sys
from pathlib import Path

D = Path(sys.argv[1]).resolve()

TITLES = {
    "Submit the pre-filled 730 tax return": "Dichiarazione 730 precompilata",
    "Second IRPEF advance payment": "Secondo acconto IRPEF",
    "IMU property tax, first instalment": "IMU, prima rata",
    "IMU property tax, balance": "IMU, saldo",
    "Condominium fee": "Rata condominio",
    "Boiler service": "Manutenzione caldaia",
    "TARI waste tax": "TARI",
    "Renew car insurance": "Rinnovo RC auto",
    "Car inspection (revisione)": "Revisione auto",
    "Fit winter tyres": "Gomme invernali",
    "Book the electronic identity card": "Prenotare la carta d'identità",
    "Birthday (identity card expiry)": "Compleanno (scadenza CIE)",
    "Passport expiry": "Scadenza passaporto",
    "On the Agenzia delle Entrate website or through a CAF.": "Sul sito dell'Agenzia delle Entrate o tramite CAF.",
    "Only if the 730 requires it: withheld from the November payslip.": "Solo se previsto dal 730: trattenuto in busta paga a novembre.",
    "Example: second home. A main residence outside categories A/1, A/8, A/9 is exempt.": "Seconda casa. L'abitazione principale fuori da A/1, A/8, A/9 è esente.",
    "Dates depend on the municipality: copy them from the payment notice.": "Le date dipendono dal Comune: copiale dall'avviso di pagamento.",
    "15 days of grace after expiry; no automatic renewal.": "15 giorni di tolleranza dopo la scadenza; niente rinnovo tacito.",
}

EXTRA = '''
[[deadline]]
id = "bollo-auto"
title = "Bollo auto"
area = "vehicles"
severity = "high"
date = 2026-10-06
repeat = "yearly"
remind_days = [7, 3]
amount = 245.00

[[deadline]]
id = "multa-ztl"
title = "Multa ZTL, pagamento ridotto"
area = "vehicles"
severity = "high"
date = 2026-10-01
repeat = "none"
amount = 83.30
notes = "Pagamento ridotto del 30% entro 5 giorni dalla notifica."
'''

CASE = """# Rinnovo carta d'identità

**Status:** da prenotare
**Due:** prenotare entro il 20 ott 2026
**Area:** documents

## Situazione
- Le carte d'identità cartacee non valgono più dal 3 agosto 2026 (Regolamento UE 2019/1157).
- Numero della carta attuale: ||CA00000AA||.

## Da fare
- [x] Controllare la scadenza del documento attuale
- [ ] Prenotare su agendacie.interno.gov.it o all'anagrafe del Comune
- [ ] Portare: vecchio documento, foto tessera, tessera sanitaria, ||€22||
- [ ] Ritirare la carta e aggiornare `birthday` in deadlines.toml

## Timeline
- 2026-09-20 — Pratica aperta.
- 2026-10-02 — Ricevuto promemoria dal Comune via PEC.
"""

INBOX = [
    ("2026-09-28T09:12:00.000Z", "upload", "Ricevuta manutenzione caldaia", "", "iPhone",
     "Ricevuta archiviata, prossima manutenzione caldaia in deadlines.toml."),
    ("2026-10-01T18:40:00.000Z", "email", "PEC: avviso di pagamento TARI 2026", "protocollo@pec.comune.esempio.it", "pratiche",
     "Avviso archiviato; date TARI da confermare in deadlines.toml."),
    ("2026-10-02T08:05:00.000Z", "telegram", "Nota vocale: bollo auto", "", "Telegram",
     "Bollo auto aggiunto: scadenza 6 ott, promemoria a 7 e 3 giorni."),
    ("2026-10-02T21:17:00.000Z", "email", "Rimborso fiscale in attesa: conferma i tuoi dati", "rimborsi@agenzia-entrate-servizi.info", "pratiche",
     "⚠️ Possibile phishing: non aprire link e non pagare. Il mittente non è dell'Agenzia delle Entrate."),
    ("2026-10-03T07:58:00.000Z", "shortcut", "Verbale multa ZTL", "", "Comando rapido",
     "Multa registrata: pagamento ridotto entro il 1 ott, già scaduto."),
]


# Free-form keys, shown humanized by the web app: Italian keys read as Italian labels.
PROFILE = """# Profilo (DATI D'ESEMPIO, inventati).

[person]
name = "Maria Rossi"
data_di_nascita = 1990-04-12
comune = "Comune di Esempio (XX)"
codice_fiscale = "RSSMRA90D52Z000X"

[work]
tipo = "dipendente"
datore_di_lavoro = "TODO"

[[property]]
nome = "Appartamento"
comune = "Comune di Esempio (XX)"
categoria_catastale = "A/2"
abitazione_principale = true

[[vehicle]]
tipo = "auto"
modello = "TODO"
targa = "AA000AA"
immatricolazione = 2019-03-31
"""

CATALOG = """# Documenti

Ultima verifica: 2026-10-02. Ogni regola ha una fonte e una data di verifica.

| Documento | Validità | Note |
|---|---|---|
| Carta d'identità elettronica (CIE) | 10 anni per i maggiorenni | scade il giorno del compleanno; rinnovabile da 180 giorni prima |
| Tessera sanitaria | 6 anni | rinnovata d'ufficio, arriva per posta |

**Carte d'identità cartacee: non valide dal 3 agosto 2026** (Regolamento UE 2019/1157).

Fonti: https://www.cartaidentita.interno.gov.it
"""


def git(*a):
    # Always the register's own repository, never one that happens to enclose it (var/ sits inside
    # the autocratico checkout): an explicit git dir and work tree.
    subprocess.run(["git", f"--git-dir={D / '.git'}", f"--work-tree={D}", *a], check=True, capture_output=True)


def main():
    if not (D / ".git").is_dir():
        subprocess.run(["git", "init", "-q", str(D)], check=True)
        git("add", "-A")
        git("commit", "-q", "-m", "Start tracking the register")
    p = D / "deadlines.toml"
    s = p.read_text()
    for a, b in TITLES.items():
        s = s.replace(f'"{a}"', f'"{b}"')
    p.write_text(s.rstrip() + "\n" + EXTRA)
    git("add", "-A")
    git("commit", "-m", "Agent: 2 new item(s)")

    case = D / "cases" / "2026-identity-card" / "README.md"
    case.write_text(CASE)
    for old in (D / "inbox").iterdir():
        for f in old.iterdir():
            f.unlink()
        old.rmdir()
    for i, (when, src, title, frm, acc, outcome) in enumerate(INBOX):
        slug = "-".join(title.lower().replace(":", "").replace("'", " ").split()[:4])
        iid = f"{i:02d}ab{i:02d}"
        folder = f"{when[:10]}-{src}-{slug}-{iid}"
        d = D / "inbox" / folder
        d.mkdir(parents=True)
        (d / "item.json").write_text(json.dumps(dict(
            id=f"demo{iid}", source=src, status="processed", received=when, title=title, **{"from": frm},
            account=acc, files=[], ref="", outcome=outcome), indent=2, ensure_ascii=False))
        (d / "content.md").write_text(f"# {title}\n\n(contenuto d'esempio)\n")
    git("add", "-A")
    git("commit", "-m", "Agent: 3 new item(s)")
    (D / "profile.toml").write_text(PROFILE)
    (D / "catalog" / "documents.md").write_text(CATALOG)
    git("add", "-A")
    git("commit", "-m", "Agent: profile updated")


if __name__ == "__main__":
    main()
