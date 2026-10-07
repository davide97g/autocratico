# Electricity and gas offers

Every Monday the `energy` job compares the supplies in `data/energy.toml` with the offers on ARERA's [Portale Offerte](https://www.ilportaleofferte.it) and writes one report per supply in `data/energy/<id>.md`. When a locked price ends within 90 days, or an offer would save at least 30 € and 10% a year, it says so on Telegram/ntfy, once per offer. The chat agent reads the reports ("conviene cambiare fornitore della luce?").

## Privacy

The portal publishes every offer of the free market as open data (one XML file per commodity and day, 15-20 MB). `scripts/offers.py` downloads the whole files, plus the monthly PUN/PSV index values and the suppliers' names, from that one host, and ranks the offers on the server. No consumption, address or other data about you is sent anywhere.

## What is compared

What the supplier charges in a year for your consumption: the energy price (by time band F1/F2/F3 for electricity), the fixed fee, the supplier's other components, and discounts with no conditions. Network charges, system charges and taxes are left out: they are the same whoever the supplier is, so they change the bill but not the ranking. For the same reason the current contract's cost is `price × annual + fixed_fee`, before taxes.

- **Fixed-price offers** lasting 12 months or more: the top 10.
- **Variable offers**: priced with the latest monthly PUN (with network losses) or PSV, so an estimate; the top 5.
- Left out: offers for other customer types, non-resident only (for your home), expired or not yet valid, limited to other areas (set `istat` to include the ones for your comune), dual-fuel only, outside their consumption or power limits, with price shapes the script does not price (peak/off-peak, unusual indexes).
- Conditional discounts (e-billing, direct debit, loyalty) are not counted. The report says "web only" and "switching only" where it applies; check the offer's conditions on the supplier's site before choosing.

## Setup

`data/energy.toml` (schema at the top of `template/energy.toml`): one `[[supply]]` per contract, with the yearly consumption from a bill. The background agent fills it in from the bills it files; the current `price`, `fixed_fee` and `fixed_until` make the comparison and the alerts possible. Run it by hand with `python3 scripts/offers.py` or `node apps/server/src/cli.ts job energy`.

Sources: the open data page and its technical specifications (SII "Trasmissione Offerte Mercato Retail"), ARERA resolution 51/2018 (Allegato A, art. 13: CC-BY data, one file per day).
