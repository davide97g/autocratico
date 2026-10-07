"""Compare the user's energy supplies with the offers on ARERA's Portale Offerte (open data).

Usage: python3 scripts/offers.py [--date YYYY-MM-DD]

Reads energy.toml (one [[supply]] per electricity or gas contract), downloads the day's open data
of the free market (one XML file per commodity, ~15-20 MB) and the monthly PUN/PSV index values,
and ranks the offers by what the supplier charges in a year for that consumption: energy price,
fixed fee, its own components and unconditional discounts. Network charges, system charges and
taxes are the same whoever the supplier is, so they are left out of both the offers and the
current cost. Variable offers are priced with the latest monthly index, an estimate.

Nothing about the user leaves the machine: the files are fetched whole, from one public host,
and ranked here. Writes energy/<supply id>.md and prints a JSON summary for the server's job.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import tempfile
import tomllib
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from pathlib import Path

from store import DATA_DIR, today

ENERGY_FILE = DATA_DIR / "energy.toml"
OUT_DIR = DATA_DIR / "energy"
HOST = "https://www.ilportaleofferte.it"
LANDING = f"{HOST}/portaleOfferte/it/open-data.page"
MAX_BYTES = 120 * 1024 * 1024
NS = "{http://www.acquirenteunico.it/schemas/SII_AU/OffertaRetail/01}"
LAMBDA = 0.10  # network losses applied to the PUN by indexed electricity offers (ARERA parameters)
DEFAULT_BANDS = (0.33, 0.31, 0.36)  # F1, F2, F3 of a typical household
TOP_FIXED = 10
TOP_VARIABLE = 5

TEXT = {
    "it": {
        "title": "Offerte a confronto",
        "basis": "Costo annuo della sola parte del fornitore (energia, quota fissa, sconti senza condizioni), imposte e oneri di rete esclusi: uguali per tutti.",
        "source": "Fonte: open data del Portale Offerte ARERA del {day}; offerte variabili stimate con PUN/PSV di {month}.",
        "current": "Contratto attuale: circa **||{cost} €||/anno** con gli stessi criteri",
        "until": "prezzo bloccato fino al {date}",
        "fixed": "Prezzo fisso",
        "variable": "Prezzo variabile (stima)",
        "head": "| Offerta | Fornitore | €/anno | Durata | Note |",
        "months": "{n} mesi",
        "open": "senza scadenza",
        "web": "solo web",
        "switch": "solo cambio fornitore",
        "none": "Nessuna offerta adatta trovata.",
        "check": "Da verificare sul sito del fornitore prima di scegliere: condizioni, penali, offerte riservate ai nuovi clienti.",
    },
    "en": {
        "title": "Offers compared",
        "basis": "Yearly cost of the supplier's part only (energy, fixed fee, unconditional discounts); taxes and network charges left out: the same for everyone.",
        "source": "Source: ARERA Portale Offerte open data of {day}; variable offers estimated with the PUN/PSV of {month}.",
        "current": "Current contract: about **||{cost} €||/year** on the same basis",
        "until": "price locked until {date}",
        "fixed": "Fixed price",
        "variable": "Variable price (estimate)",
        "head": "| Offer | Supplier | €/year | Lasts | Notes |",
        "months": "{n} months",
        "open": "open-ended",
        "web": "web only",
        "switch": "switching only",
        "none": "No suitable offer found.",
        "check": "Check on the supplier's site before choosing: conditions, exit fees, offers for new customers only.",
    },
}


# ---------- downloads ----------


class _SameHost(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith(HOST + "/"):
            raise urllib.error.HTTPError(newurl, code, "redirect to another host refused", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_SameHost)


def fetch(url: str, dest: Path | None = None) -> bytes | None:
    """GET a public file of the portal; None when it is not there (404). Big files go to `dest`."""
    assert url.startswith(HOST + "/")
    try:
        with _OPENER.open(urllib.request.Request(url, headers={"User-Agent": "autocratico"}), timeout=120) as r:
            if dest is None:
                return r.read(MAX_BYTES)
            size = 0
            with dest.open("wb") as f:
                while chunk := r.read(1 << 20):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise RuntimeError(f"{url}: larger than {MAX_BYTES} bytes")
                    f.write(chunk)
            return b""
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def day_url(folder: str, name: str, day: date, ext: str) -> str:
    return f"{HOST}/portaleOfferte/resources/opendata/csv/{folder}/{day.year}_{day.month}/{name}_{day:%Y%m%d}.{ext}"


def offers_file(commodity: str, day: date, tmp: Path) -> tuple[Path, date]:
    """The free-market offers of `commodity` (E or G), from `day` or the days before."""
    for back in range(4):
        d = day - timedelta(days=back)
        dest = tmp / f"{commodity}-{d:%Y%m%d}.xml"
        if fetch(day_url("offerteML", f"PO_Offerte_{commodity}_MLIBERO", d, "xml"), dest) is not None:
            return dest, d
    raise RuntimeError(f"no {commodity} offers published in the last days")


def supplier_names(day: date) -> dict[str, str]:
    """VAT number -> supplier name, from the PLACET lists (most suppliers publish one)."""
    names: dict[str, str] = {}
    for commodity in ("E", "G"):
        for back in range(4):
            raw = fetch(day_url("offerte", f"PO_Offerte_{commodity}_PLACET", day - timedelta(days=back), "csv"))
            if raw is not None:
                for row in csv.DictReader(io.StringIO(raw.decode("utf-8", "replace"))):
                    if row.get("p_iva") and row.get("denominazione"):
                        names[row["p_iva"].strip()] = row["denominazione"].strip()
                break
    return names


def index_values() -> tuple[str, dict[str, float]]:
    """Latest month of the portal's index prices: ('YYYYMM', {'PUN': €/kWh, 'PSV': €/Smc, ...})."""
    page = (fetch(LANDING) or b"").decode("utf-8", "replace")
    m = re.search(r"/portaleOfferte/resources/cms/documents/[0-9a-f]{32}\.csv", page)
    if not m:
        raise RuntimeError("index prices not found on the open data page")
    rows = [r for r in csv.reader(io.StringIO((fetch(HOST + m.group(0)) or b"").decode("cp1252")), delimiter=";") if r]
    head = [h.split(" ")[0] for h in rows[0]]
    if "PUN" not in head or "PSV" not in head:
        raise RuntimeError("unexpected index prices file")
    last = rows[-1]
    values = {h: float(v.replace(",", ".")) for h, v in zip(head[1:], last[1:]) if v.strip()}
    return last[0], values


# ---------- parsing ----------


def _obj(el: ET.Element):
    kids = list(el)
    if not kids:
        return (el.text or "").strip()
    out: dict = {}
    for k in kids:
        out.setdefault(k.tag.replace(NS, ""), []).append(_obj(k))
    return {k: v[0] if len(v) == 1 else v for k, v in out.items()}


def offers(path: Path):
    for _, el in ET.iterparse(path, events=("end",)):
        if el.tag.replace(NS, "") == "offerta":
            yield _obj(el)
            el.clear()


def _list(x) -> list:
    return x if isinstance(x, list) else [] if x in (None, "") else [x]


def _num(x) -> float:
    return float(str(x).replace(",", "."))


def _when(s: str) -> datetime:
    return datetime.strptime(s, "%d/%m/%Y_%H:%M:%S")


# ---------- ranking ----------


def eligible(o: dict, s: dict, now: datetime) -> bool:
    d = o.get("DettaglioOfferta") or {}
    customer = "01" if s.get("customer", "domestic") == "domestic" else "02"
    if d.get("TIPO_CLIENTE") != customer or d.get("OFFERTA_SINGOLA") == "NO" or d.get("OFFERTA_ONNICOMPRENSIVA"):
        return False
    resident = d.get("DOMESTICO_RESIDENTE")
    if customer == "01" and resident in ("01", "02") and resident != ("01" if s.get("resident", True) else "02"):
        return False
    v = o.get("ValiditaOfferta") or {}
    try:
        if not (_when(v["DATA_INIZIO"]) <= now <= _when(v["DATA_FINE"])):
            return False
    except (KeyError, ValueError):
        return False
    kinds = set(_list(d.get("TIPOLOGIA_ATT_CONTR")))
    if kinds and not kinds & {"01", "99"}:  # not open to a supplier change
        return False
    features = o.get("CaratteristicheOfferta") or {}
    annual = float(s["annual"])
    for key, ok in (("CONSUMO_MIN", lambda v: annual >= v), ("CONSUMO_MAX", lambda v: annual <= v)):
        if features.get(key) and not ok(_num(features[key])):
            return False
    if s.get("power_kw"):
        for key, ok in (("POTENZA_MIN", lambda v: s["power_kw"] >= v), ("POTENZA_MAX", lambda v: s["power_kw"] <= v)):
            if features.get(key) and not ok(_num(features[key])):
                return False
    zones = _list(o.get("ZoneOfferta"))
    if zones:
        istat = str(s.get("istat", ""))
        if not istat:
            return False
        places = {str(x) for z in zones if isinstance(z, dict) for k in ("COMUNE", "PROVINCIA") for x in _list(z.get(k))}
        if istat not in places and istat[:3] not in places:
            return False
    return True


def cost(o: dict, s: dict, index: dict[str, float]) -> tuple[float, bool] | None:
    """Yearly supplier cost of offer `o` for supply `s`, and whether it is variable; None when it cannot be priced."""
    gas = s["commodity"] == "gas"
    annual = float(s["annual"])
    bands = s.get("bands") or DEFAULT_BANDS
    split = {"01": annual * bands[0], "02": annual * bands[1], "03": annual * bands[2], "91": annual * (bands[1] + bands[2])}
    shape = (o.get("TipoPrezzo") or {}).get("TIPOLOGIA_FASCE")
    if not gas and shape not in ("01", "03", "91"):
        return None

    def use(band) -> float:
        return annual if gas or band in (None, "") or shape == "01" else split.get(band, 0.0)

    total = 0.0
    for c in _list(o.get("ComponenteImpresa")):
        if c.get("TIPOLOGIA") == "02" and c.get("MACROAREA") == "06":
            continue  # an optional green option
        for p in _list(c.get("IntervalloPrezzi")):
            if "PeriodoValidita" in p or "CONSUMO_DA" in p:
                continue  # tiers and limited periods: the default interval of each band counts
            price, unit = _num(p["PREZZO"]), p.get("UNITA_MISURA")
            if unit in ("01", "05"):
                total += price
            elif unit in ("03", "04"):
                total += price * use(p.get("FASCIA_COMPONENTE"))
            elif unit == "02":
                total += price * float(s.get("power_kw") or 3.0)
    for disp in _list(o.get("Dispacciamento")):
        if isinstance(disp, dict) and disp.get("TIPO_DISPACCIAMENTO") == "99" and disp.get("VALORE_DISP"):
            total += _num(disp["VALORE_DISP"]) * annual
    detail = o.get("DettaglioOfferta") or {}
    variable = detail.get("TIPO_OFFERTA") in ("02", "04")
    if variable:
        codes = {r.get("IDX_PREZZO_ENERGIA") for r in _list(o.get("RiferimentiPrezzoEnergia")) if isinstance(r, dict)}
        if gas and codes and codes <= {"03", "10", "14"}:
            total += index["PSV"] * annual
        elif not gas and codes and codes <= {"01", "08", "12"}:
            total += index["PUN"] * (1 + LAMBDA) * annual
        else:
            return None
    for sc in _list(o.get("Sconto")):
        cond = sc.get("Condizione")
        conds = {c.get("CONDIZIONE_APPLICAZIONE") for c in _list(cond) if isinstance(c, dict)}
        if conds != {"00"} or sc.get("VALIDITA") not in ("01", "02") or sc.get("CODICE_COMPONENTE_FASCIA"):
            continue
        period = sc.get("PeriodoValidita") or {}
        share = min(int(period["DURATA"]), 12) / 12 if period.get("DURATA") else 1.0
        if period.get("MESE_VALIDITA") or period.get("VALIDO_FINO"):
            share = 1 / 12
        for p in _list(sc.get("PrezziSconto"))[:1]:  # suppliers repeat it once per band
            value = _num(p["PREZZO"])
            if p.get("TIPOLOGIA") == "01" and p.get("UNITA_MISURA") == "01":
                total -= value * share
            elif p.get("TIPOLOGIA") == "01" and p.get("UNITA_MISURA") == "05":
                total -= value
            elif p.get("TIPOLOGIA") == "03" and p.get("UNITA_MISURA") in ("03", "04"):
                total -= value * annual * share
    return round(total, 2), variable


def current_cost(s: dict) -> float | None:
    if s.get("price") is None:
        return None
    return round(float(s["price"]) * float(s["annual"]) + float(s.get("fixed_fee") or 0), 2)


def rank(path: Path, supplies: list[dict], index: dict[str, float], names: dict[str, str], now: datetime) -> dict[str, list[dict]]:
    found: dict[str, list[dict]] = {s["id"]: [] for s in supplies}
    for o in offers(path):
        for s in supplies:
            if not eligible(o, s, now):
                continue
            priced = cost(o, s, index)
            if priced is None:
                continue
            d = o["DettaglioOfferta"]
            vat = (o.get("IdentificativiOfferta") or {}).get("PIVA_UTENTE", "")
            contacts = d.get("Contatti") if isinstance(d.get("Contatti"), dict) else o.get("Contatti") or {}
            modes = set(_list((d.get("ModalitaAttivazione") or {}).get("MODALITA")))
            found[s["id"]].append(
                {
                    "cost": priced[0],
                    "variable": priced[1],
                    "name": d.get("NOME_OFFERTA", "?"),
                    "supplier": names.get(vat, f"P.IVA {vat}"),
                    "months": int(d["DURATA"]) if str(d.get("DURATA", "")).lstrip("-").isdigit() else -1,
                    "web_only": modes == {"01"},
                    "switch_only": set(_list(d.get("TIPOLOGIA_ATT_CONTR"))) == {"01"},
                    "url": (contacts or {}).get("URL_OFFERTA") or (contacts or {}).get("URL_SITO_VENDITORE") or "",
                    "code": (o.get("IdentificativiOfferta") or {}).get("COD_OFFERTA", ""),
                }
            )
    for rows in found.values():
        rows.sort(key=lambda r: r["cost"])
    return found


# ---------- output ----------


def _cell(s: str) -> str:
    return s.replace("|", "/").replace("\n", " ").strip()


def report(s: dict, rows: list[dict], day: date, month: str, locale: str) -> str:
    t = TEXT[locale]
    lines = [f"# {t['title']}: {s.get('title', s['id'])}", "", t["basis"], t["source"].format(day=day.isoformat(), month=f"{month[4:]}/{month[:4]}"), ""]
    now = current_cost(s)
    if now is not None:
        until = f" ({t['until'].format(date=s['fixed_until'])})" if s.get("fixed_until") else ""
        lines += [t["current"].format(cost=f"{now:.0f}") + until, ""]
    for title, pick, top in ((t["fixed"], lambda r: not r["variable"] and r["months"] >= 12, TOP_FIXED), (t["variable"], lambda r: r["variable"], TOP_VARIABLE)):
        chosen = [r for r in rows if pick(r)][:top]
        lines += [f"## {title}", ""]
        if not chosen:
            lines += [t["none"], ""]
            continue
        lines += [t["head"], "|---|---|---:|---|---|"]
        for r in chosen:
            name = f"[{_cell(r['name'])}]({r['url']})" if re.fullmatch(r"https?://[^\s()<>|\[\]]+", r["url"]) else _cell(r["name"])
            lasts = t["months"].format(n=r["months"]) if r["months"] > 0 else t["open"]
            notes = ", ".join(x for x, on in ((t["web"], r["web_only"]), (t["switch"], r["switch_only"])) if on)
            lines.append(f"| {name} | {_cell(r['supplier'])} | {r['cost']:.0f} | {lasts} | {notes} |")
        lines.append("")
    lines += [t["check"], ""]
    return "\n".join(lines)


def load_supplies() -> list[dict]:
    if not ENERGY_FILE.exists():
        return []
    with ENERGY_FILE.open("rb") as f:
        raw = tomllib.load(f).get("supply", [])
    out = []
    for s in raw:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", str(s.get("id", ""))):
            raise ValueError(f"energy.toml: invalid supply id {s.get('id')!r} (lowercase kebab-case)")
        if s.get("commodity") not in ("electricity", "gas"):
            raise ValueError(f"{s['id']}: commodity must be electricity or gas")
        if not isinstance(s.get("annual"), (int, float)) or s["annual"] <= 0:
            raise ValueError(f"{s['id']}: annual must be the yearly consumption (kWh or Smc)")
        bands = s.get("bands")
        if bands is not None and (len(bands) != 3 or abs(sum(bands) - 1) > 0.02):
            raise ValueError(f"{s['id']}: bands must be three shares (F1, F2, F3) adding up to 1")
        if isinstance(s.get("fixed_until"), date):
            s["fixed_until"] = s["fixed_until"].isoformat()
        out.append(s)
    return out


def main() -> None:
    args = sys.argv[1:]
    day = date.fromisoformat(args[args.index("--date") + 1]) if "--date" in args else today()
    locale = "en" if os.environ.get("AUTOCRATICO_LOCALE") == "en" else "it"
    supplies = load_supplies()
    if not supplies:
        print(json.dumps({"supplies": []}))
        return
    month, index = index_values()
    names = supplier_names(day)
    now = datetime.combine(day, datetime.min.time()).replace(hour=12)
    OUT_DIR.mkdir(exist_ok=True)
    summary = []
    with tempfile.TemporaryDirectory() as tmp:
        for commodity, kind in (("E", "electricity"), ("G", "gas")):
            group = [s for s in supplies if s["commodity"] == kind]
            if not group:
                continue
            path, published = offers_file(commodity, day, Path(tmp))
            ranked = rank(path, group, index, names, now)
            path.unlink()
            for s in group:
                rows = ranked[s["id"]]
                (OUT_DIR / f"{s['id']}.md").write_text(report(s, rows, published, month, locale), encoding="utf-8")
                best = next((r for r in rows if not r["variable"] and r["months"] >= 12), None)
                current = current_cost(s)
                summary.append(
                    {
                        "id": s["id"],
                        "title": s.get("title", s["id"]),
                        "fixed_until": s.get("fixed_until"),
                        "current": current,
                        "best": best and {k: best[k] for k in ("name", "supplier", "cost", "months", "code")},
                        "saving": round(current - best["cost"], 2) if best and current is not None else None,
                        "offers": len(rows),
                        "file": f"energy/{s['id']}.md",
                        "published": published.isoformat(),
                        "index_month": month,
                    }
                )
    print(json.dumps({"supplies": summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
