# Reference imagery — credits

Every file in `public/ref/` with its source, author, licence and what was changed. The repository is public:
everything here is public domain, CC0, CC BY or CC BY-SA, and may be redistributed with attribution.
**CC BY-SA files**: the derived files (grey grades, cut-outs) are shared under the same licence as their source.

Suffixes: `-orig` = original colours, resized; `-grey` = graded to the film palette (ink #0A0A0A – paper #E6E6E6);
`-cut.png` = background removed (alpha); `-cut-grey.png` = graded cut-out (grey + alpha).

Credit line for the film's end card / description (short form):
> Immagini: Sentinel-2 cloudless 2016 di EOX IT Services GmbH (dati Copernicus Sentinel modificati, CC BY 4.0) · NASA (DSCOVR/EPIC, Black Marble, ISS, MODIS) · confini ISTAT (CC BY 4.0) · Natural Earth · foto da Wikimedia Commons: N. Frisardi, Ricardalovesmonuments, Groucho85, Kaitu, Tenam2, Blackcat, Sailko, A. Vitali, EnricoRubicondo, Alexmar983, Paolo Monti (BEIC), J. Perez Montes, W.carter, H. Ellgaard, Dvortygirl, RandomKatze, MHM55, D. Orban, GJo, N. Bildhauer, CTHOE, seier+seier, Szilas, Mattes, Matrobriva, C. Steinbeisser, E. Perodi (CC BY / CC BY-SA, vedi CREDITS.md).

## Orbit-to-Rome zoom (`earth/zoom-z*.jpg`)

- Source: **Sentinel-2 cloudless 2016** by EOX IT Services GmbH, https://s2maps.eu — “Contains modified Copernicus Sentinel data 2016”, **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/). WMTS layer `s2cloudless_3857` (title “Sentinel-2 cloudless layer for 2016 by EOX - 3857”), tiles `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg`. Only the 2016 layer is used (later years are CC BY-NC-SA).
- Changes: tiles stitched and **re-projected into a vertical perspective view** (camera straight above the target, 60° FOV, 2048×2048, spherical Earth R = 6,378,137 m, 2×2 supersampled for z ≤ 12), space left black; `-grey` versions graded to the palette.
- Target: Palazzo delle Finanze / MEF, Via XX Settembre 97, Rome — **41.906237 N, 12.497572 E** (Wikidata Q2047643), exactly at the image centre (pixel coordinate 1024,1024, the corner shared by the four centre pixels) in every level.
- Geometry: level z has `m_per_px_center = 2π·R·cos(lat)/(256·2^z)` (the Web-Mercator ground resolution at the target), camera altitude = m_per_px · 1773.6 px (focal length). So **level z+1 = level z scaled ×2 about the centre** (×√2 for the half steps). Checked: mean abs difference after the ×2 scale is 0.4–4.6 grey levels for z ≥ 9, about 11 at z5→z6 (Earth curvature + texture resolution), with zero offset. Below z6 the globe's limb grows less than ×2 per step (perspective); crossfade quickly there.
- Native resolution ends at z14 (≈ 10 m Sentinel pixels); z15 is z14 data upsampled (soft) — cut to the aerial photo / facade from there.

| file | zoom | texture zoom | m/px at centre | camera altitude km | globe radius px |
|---|---|---|---|---|---|
| `earth/zoom-z03.0.jpg` | 3.0 | 3 | 14563.1758 | 25829.5 | 358.3 |
| `earth/zoom-z03.5.jpg` | 3.5 | 4 | 10297.7204 | 18264.2 | 475.3 |
| `earth/zoom-z04.0.jpg` | 4.0 | 4 | 7281.5879 | 12914.8 | 621.3 |
| `earth/zoom-z04.5.jpg` | 4.5 | 5 | 5148.8602 | 9132.1 | 800.1 |
| `earth/zoom-z05.0.jpg` | 5.0 | 5 | 3640.794 | 6457.4 | 1015.6 |
| `earth/zoom-z05.5.jpg` | 5.5 | 6 | 2574.4301 | 4566.1 | 1272.0 |
| `earth/zoom-z06.0.jpg` | 6.0 | 6 | 1820.397 | 3228.7 | — |
| `earth/zoom-z06.5.jpg` | 6.5 | 7 | 1287.215 | 2283.0 | — |
| `earth/zoom-z07.0.jpg` | 7.0 | 7 | 910.1985 | 1614.3 | — |
| `earth/zoom-z08.0.jpg` | 8.0 | 8 | 455.0992 | 807.2 | — |
| `earth/zoom-z09.0.jpg` | 9.0 | 9 | 227.5496 | 403.6 | — |
| `earth/zoom-z10.0.jpg` | 10.0 | 10 | 113.7748 | 201.8 | — |
| `earth/zoom-z11.0.jpg` | 11.0 | 11 | 56.8874 | 100.9 | — |
| `earth/zoom-z12.0.jpg` | 12.0 | 12 | 28.4437 | 50.4 | — |
| `earth/zoom-z13.0.jpg` | 13.0 | 13 | 14.2219 | 25.2 | — |
| `earth/zoom-z14.0.jpg` | 14.0 | 14 | 7.1109 | 12.6 | — |
| `earth/zoom-z15.0.jpg` | 15.0 | 14 | 3.5555 | 6.3 | — |

## Photos (Wikimedia Commons, NASA)

### epic-europe-africa
- Files: `earth/epic-europe-africa-orig.jpg`, `earth/epic-europe-africa-grey.jpg`
- What: Full Earth disc from DSCOVR/EPIC (1.5 million km): Europe, Mediterranean and Africa, Italy upper centre, real clouds
- Source: https://commons.wikimedia.org/wiki/File:Africa_and_Europe_from_a_Million_Miles_Away_(19931748669).jpg (Africa and Europe from a Million Miles Away (19931748669).jpg)
- Author: NASA Earth Observatory
- Licence: Public domain
- Changes: resized to ≤ 2048 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### black-marble-europe
- Files: `earth/black-marble-europe-orig.jpg`, `earth/black-marble-europe-grey.jpg`
- What: NASA Black Marble night-lights globe: Europe, Africa, Middle East; Italy lit at upper left
- Source: https://commons.wikimedia.org/wiki/File:Black_Marble_-_Africa,_Europe,_and_the_Middle_East_(8247962102).jpg (Black Marble - Africa, Europe, and the Middle East (8247962102).jpg)
- Author: NASA Earth Observatory
- Licence: Public domain
- Changes: resized to ≤ 3840 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### iss-italy-night-a
- Files: `earth/iss-italy-night-a-orig.jpg`, `earth/iss-italy-night-a-grey.jpg`
- What: ISS-47 photo: Italy at night from orbit, oblique with the limb and blue atmosphere, whole boot and Sicily
- Source: https://commons.wikimedia.org/wiki/File:ISS-47_Italy_night_view.jpg (ISS-47 Italy night view.jpg)
- Author: NASA
- Licence: Public domain
- Changes: resized to ≤ 3840 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### iss-italy-night-b
- Files: `earth/iss-italy-night-b-orig.jpg`, `earth/iss-italy-night-b-grey.jpg`
- What: ISS-40 photo: central and southern Italy and Sicily at night, oblique, black sky
- Source: https://commons.wikimedia.org/wiki/File:ISS-40_Night_View_of_Italy_(1).jpg (ISS-40 Night View of Italy (1).jpg)
- Author: NASA
- Licence: Public domain
- Changes: resized to ≤ 3840 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### modis-italy
- Files: `earth/modis-italy-orig.jpg`, `earth/modis-italy-grey.jpg`
- What: Terra MODIS true-colour image: all of Italy, Alps to Sicily, clear sky
- Source: https://commons.wikimedia.org/wiki/File:Late_Summer_in_Italy_(MODIS_2025-09-21).jpg (Late Summer in Italy (MODIS 2025-09-21).jpg)
- Author: MODIS Land Rapid Response Team, NASA GSFC
- Licence: Public domain
- Changes: resized to ≤ 1597 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### rome-aerial-termini
- Files: `earth/rome-aerial-termini-orig.jpg`, `earth/rome-aerial-termini-grey.jpg`
- What: Oblique aerial photo of central Rome from a plane, Termini station lower left, the Esquilino/Castro Pretorio grid; the Palazzo delle Finanze area is in frame (not individually identified)
- Source: https://commons.wikimedia.org/wiki/File:Roma_dall%27alto_giugno_2005.jpg (Roma dall'alto giugno 2005.jpg)
- Author: seier+seier
- Licence: CC BY 2.0 — https://creativecommons.org/licenses/by/2.0
- Changes: resized to ≤ 3264 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### palazzo-finanze-front
- Files: `palazzo-finanze-front-orig.jpg`, `palazzo-finanze-front-grey.jpg`, `palazzo-finanze-front-cut.png`, `palazzo-finanze-front-cut-grey.png`
- What: Palazzo delle Finanze (Ministero dell’Economia e delle Finanze), Via XX Settembre, Rome: frontal facade, blue sky, parked cars
- Source: https://commons.wikimedia.org/wiki/File:Palazzo_delle_Finanze_-_panoramio.jpg (Palazzo delle Finanze - panoramio.jpg)
- Author: Nicholas Frisardi
- Licence: CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0
- Changes: resized to ≤ 4000 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6; cut-out alpha eroded 2 px and feathered to remove sky fringe

### palazzo-finanze-front-b
- Files: `palazzo-finanze-front-b-orig.jpg`, `palazzo-finanze-front-b-grey.jpg`
- What: Palazzo delle Finanze, Rome: frontal facade, wider, entrance canopy, street in foreground
- Source: https://commons.wikimedia.org/wiki/File:Palazzo_delle_Finanze_(Rome).jpg (Palazzo delle Finanze (Rome).jpg)
- Author: Ricardalovesmonuments
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### palazzo-finanze-1890
- Files: `palazzo-finanze-1890-orig.jpg`, `palazzo-finanze-1890-grey.jpg`
- What: Palazzo delle Finanze, Rome, period photo-engraving from “Roma italiana, 1870-1895”
- Source: https://commons.wikimedia.org/wiki/File:Ministero_delle_Finanze_-_Roma_italiana,_1870-1895_(page_285_crop).jpg (Ministero delle Finanze - Roma italiana, 1870-1895 (page 285 crop).jpg)
- Author: Emma Perodi
- Licence: Public domain
- Changes: resized to ≤ 2673 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### palazzo-finanze-cortile
- Files: `palazzo-finanze-cortile-orig.jpg`, `palazzo-finanze-cortile-grey.jpg`
- What: Courtyard of the Palazzo delle Finanze, Rome
- Source: https://commons.wikimedia.org/wiki/File:Ministero_dell%27Economia_e_delle_Finanze.jpg (Ministero dell'Economia e delle Finanze.jpg)
- Author: Groucho85
- Licence: CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0
- Changes: resized to ≤ 1600 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### via-xx-settembre
- Files: `via-xx-settembre-orig.jpg`, `via-xx-settembre-grey.jpg`
- What: Via XX Settembre, Rome, from Piazza San Bernardo toward the ministries
- Source: https://commons.wikimedia.org/wiki/File:Via_XX_Settembre_from_Piazza_San_Bernardo.jpg (Via XX Settembre from Piazza San Bernardo.jpg)
- Author: Szilas
- Licence: Public domain
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### agenzia-entrate-milano
- Files: `agenzia-entrate-milano-orig.jpg`, `agenzia-entrate-milano-grey.jpg`, `agenzia-entrate-milano-cut.png`, `agenzia-entrate-milano-cut-grey.png`
- What: Agenzia delle Entrate building, Milan (corner of Via Manin / Via Tarchetti): monumental 1930s block
- Source: https://commons.wikimedia.org/wiki/File:Milano_Palazzo_Agenzia_delle_entrate,_angolo_Manin_-_Via_Iginio_Ugo_Tarchetti.jpg (Milano Palazzo Agenzia delle entrate, angolo Manin - Via Iginio Ugo Tarchetti.jpg)
- Author: Kaitu
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6; cut-out alpha eroded 2 px and feathered to remove sky fringe

### agenzia-entrate-aosta
- Files: `agenzia-entrate-aosta-orig.jpg`, `agenzia-entrate-aosta-grey.jpg`
- What: Agenzia delle Entrate office, Aosta: entrance with the bilingual building sign “Agenzia delle Entrate / Agence des impôts”, flags, parked cars
- Source: https://commons.wikimedia.org/wiki/File:Agence_des_%C3%AEmpots_rue_Trottechien-Aoste.JPG (Agence des împots rue Trottechien-Aoste.JPG)
- Author: Tenam2
- Licence: CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### posta-piazza-bologna
- Files: `posta-piazza-bologna-orig.jpg`, `posta-piazza-bologna-grey.jpg`, `posta-piazza-bologna-cut.png`, `posta-piazza-bologna-cut-grey.png`
- What: Post office of Piazza Bologna, Rome (Ridolfi, 1930s rationalist curved facade), wide panorama
- Source: https://commons.wikimedia.org/wiki/File:Piazza_Bologna_ufficio_postale.jpg (Piazza Bologna ufficio postale.jpg)
- Author: Blackcat
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 2679 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6; cut-out alpha eroded 2 px and feathered to remove sky fringe

### posta-ostia-storica
- Files: `posta-ostia-storica-orig.jpg`, `posta-ostia-storica-grey.jpg`
- What: Historic photo of the Ostia post office (rationalist, 1930s), sepia
- Source: https://commons.wikimedia.org/wiki/File:UFFICIOPOSTAOSTIA.jpg (UFFICIOPOSTAOSTIA.jpg)
- Author: unknown author (uploaded by Indeciso42 at it.wikipedia)
- Licence: Public domain
- Changes: resized to ≤ 1400 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### archivio-pescia
- Files: `archivio-pescia-orig.jpg`, `archivio-pescia-grey.jpg`
- What: State Archive of Pescia: wooden shelves with iron grilles full of old paper bundles (faldoni)
- Source: https://commons.wikimedia.org/wiki/File:Archivio_di_stato_di_pescia_(sezione_di_pt),_interno,_scaffali_con_faldoni_01.jpg (Archivio di stato di pescia (sezione di pt), interno, scaffali con faldoni 01.jpg)
- Author: Sailko
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### archivio-palermo-registri
- Files: `archivio-palermo-registri-orig.jpg`, `archivio-palermo-registri-grey.jpg`
- What: Historic Municipal Archive of Palermo: shelves of bound registers, spines peeling
- Source: https://commons.wikimedia.org/wiki/File:Libri_Archivio_Storico_Comunale_di_Palermo,_dettaglio.jpg (Libri Archivio Storico Comunale di Palermo, dettaglio.jpg)
- Author: Alessandro Vitali
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 3061 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### archivio-palermo-sala
- Files: `archivio-palermo-sala-orig.jpg`, `archivio-palermo-sala-grey.jpg`
- What: Historic Municipal Archive of Palermo: long hall, floor-to-ceiling shelves of registers, chequered floor, display cases
- Source: https://commons.wikimedia.org/wiki/File:Aula_Archivio_Storico_Comunale_di_Palermo_1.tif (Aula Archivio Storico Comunale di Palermo 1.tif)
- Author: EnricoRubicondo
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### archivio-serravalle
- Files: `archivio-serravalle-orig.jpg`, `archivio-serravalle-grey.jpg`
- What: Municipal archive of Serravalle Pistoiese: narrow aisle between metal shelves of archive boxes and binders
- Source: https://commons.wikimedia.org/wiki/File:2018-09-08_Interno_Archivio_Storico_Comunale_(Serravalle_Pistoiese)_01.jpg (2018-09-08 Interno Archivio Storico Comunale (Serravalle Pistoiese) 01.jpg)
- Author: Alexmar983
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 2560 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### ufficio-monti-1963
- Files: `ufficio-monti-1963-orig.jpg`, `ufficio-monti-1963-grey.jpg`
- What: Paolo Monti, Milan 1963: office interior with wall unit of binders, wooden cabinets (B/W)
- Source: https://commons.wikimedia.org/wiki/File:Paolo_Monti_-_Servizio_fotografico_(Milano,_1963)_-_BEIC_6343392.jpg (Paolo Monti - Servizio fotografico (Milano, 1963) - BEIC 6343392.jpg)
- Author: Paolo Monti
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 1280 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### ufficio-monti-corridoio
- Files: `ufficio-monti-corridoio-orig.jpg`, `ufficio-monti-corridoio-grey.jpg`
- What: Paolo Monti: office corridor with glass partitions (B/W)
- Source: https://commons.wikimedia.org/wiki/File:Paolo_Monti_-_Servizio_fotografico_-_BEIC_6355465.jpg (Paolo Monti - Servizio fotografico - BEIC 6355465.jpg)
- Author: Paolo Monti
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 1280 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### zerbino
- Files: `zerbino-orig.jpg`, `zerbino-grey.jpg`, `zerbino-cut.png`, `zerbino-cut-grey.png`
- What: Coir doormat seen from above, cracked down the middle, on terracotta tiles
- Source: https://commons.wikimedia.org/wiki/File:Broken_doormat_1.jpg (Broken doormat 1.jpg)
- Author: Javier Perez Montes
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### fila-napoli-1973
- Files: `fila-napoli-1973-orig.jpg`, `fila-napoli-1973-grey.jpg`
- What: Crowd queueing in a Naples street, 1973, seen from above (B/W, small)
- Source: https://commons.wikimedia.org/wiki/File:Persone_in_fila_per_la_vaccinazione_(Napoli,_1973).png (Persone in fila per la vaccinazione (Napoli, 1973).png)
- Author: unknown author
- Licence: Public domain
- Changes: resized to ≤ 806 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### faldoni-scaffale
- Files: `faldoni-scaffale-orig.jpg`, `faldoni-scaffale-grey.jpg`
- What: Shelf of lever-arch files (handwritten German labels)
- Source: https://commons.wikimedia.org/wiki/File:Aktenordner,_stehend.jpg (Aktenordner, stehend.jpg)
- Author: Mattes
- Licence: Public domain
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### eliminacode
- Files: `eliminacode-orig.jpg`, `eliminacode-grey.jpg`, `eliminacode-cut.png`, `eliminacode-cut-grey.png`
- What: Red Turn-O-Matic queue-ticket dispenser on a wall, ticket coming out
- Source: https://commons.wikimedia.org/wiki/File:Turn-O-Matic_ticket_machine_in_Brastad_Bageri.jpg (Turn-O-Matic ticket machine in Brastad Bageri.jpg)
- Author: W.carter
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### eliminacode-m90
- Files: `eliminacode-m90-orig.jpg`, `eliminacode-m90-grey.jpg`, `eliminacode-m90-cut.png`, `eliminacode-m90-cut-grey.png`
- What: Turn-O-Matic M90 ticket dispenser (red/grey) on pegboard
- Source: https://commons.wikimedia.org/wiki/File:Turn_o_matic_M90.jpg (Turn o matic M90.jpg)
- Author: Holger.Ellgaard
- Licence: CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0
- Changes: resized to ≤ 1593 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### timbri-carosello
- Files: `timbri-carosello-orig.jpg`, `timbri-carosello-grey.jpg`, `timbri-carosello-cut.png`, `timbri-carosello-cut-grey.png`
- What: Rotating rack of wooden rubber stamps (German postal labels on the stamps)
- Source: https://commons.wikimedia.org/wiki/File:Stempelkarussel.JPG (Stempelkarussel.JPG)
- Author: Carl Steinbeisser
- Licence: Public domain
- Changes: resized to ≤ 1600 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### timbro-datario
- Files: `timbro-datario-orig.jpg`, `timbro-datario-grey.jpg`, `timbro-datario-cut.png`, `timbro-datario-cut-grey.png`
- What: Self-inking date stamp (“AUG 17 2029”), seen from above
- Source: https://commons.wikimedia.org/wiki/File:Date_ink_stamp.jpg (Date ink stamp.jpg)
- Author: RandomKatze
- Licence: CC0 — http://creativecommons.org/publicdomain/zero/1.0/deed.en
- Changes: resized to ≤ 1024 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### timbro-numeratore
- Files: `timbro-numeratore-orig.jpg`, `timbro-numeratore-grey.jpg`, `timbro-numeratore-cut.png`, `timbro-numeratore-cut-grey.png`
- What: Numbering stamp with rotating bands on an ink pad
- Source: https://commons.wikimedia.org/wiki/File:Rubber_stamp_IMG_20190427_113849721_HDR.jpg (Rubber stamp IMG 20190427 113849721 HDR.jpg)
- Author: Dvortygirl
- Licence: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0
- Changes: resized to ≤ 3072 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### marca-da-bollo
- Files: `marca-da-bollo-orig.jpg`, `marca-da-bollo-grey.jpg`, `marca-da-bollo-cut.png`, `marca-da-bollo-cut-grey.png`
- What: Italian revenue stamp “Marca da bollo, centesimi uno” (19th century, Kingdom of Italy)
- Source: https://commons.wikimedia.org/wiki/File:Marca_da_bollo-centesimi_uno-r.jpg (Marca da bollo-centesimi uno-r.jpg)
- Author: MHM55
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 590 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### marca-da-bollo-blocco
- Files: `marca-da-bollo-blocco-orig.jpg`, `marca-da-bollo-blocco-grey.jpg`, `marca-da-bollo-blocco-cut.png`, `marca-da-bollo-blocco-cut-grey.png`
- What: Block of four “Marca da bollo centesimi uno” revenue stamps
- Source: https://commons.wikimedia.org/wiki/File:Marca_da_bollo-centesimi_uno-blocco_di_4-r.jpg (Marca da bollo-centesimi uno-blocco di 4-r.jpg)
- Author: MHM55
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 1177 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### macchina-da-scrivere
- Files: `macchina-da-scrivere-orig.jpg`, `macchina-da-scrivere-grey.jpg`, `macchina-da-scrivere-cut.png`, `macchina-da-scrivere-cut-grey.png`
- What: Olivetti Lettera 22 typewriter, three-quarter view (MoMA)
- Source: https://commons.wikimedia.org/wiki/File:Olivetti_Lettera_22_at_the_MOMA.jpg (Olivetti Lettera 22 at the MOMA.jpg)
- Author: David Orban
- Licence: CC BY 2.0 — https://creativecommons.org/licenses/by/2.0
- Changes: resized to ≤ 2373 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### macchina-da-scrivere-b
- Files: `macchina-da-scrivere-b-orig.jpg`, `macchina-da-scrivere-b-grey.jpg`, `macchina-da-scrivere-b-cut.png`, `macchina-da-scrivere-b-cut-grey.png`
- What: Olivetti Lettera 22 typewriter, frontal view
- Source: https://commons.wikimedia.org/wiki/File:Lettera_22_2.JPG (Lettera 22 2.JPG)
- Author: Matrobriva
- Licence: Public domain
- Changes: resized to ≤ 1542 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### libro-mastro
- Files: `libro-mastro-orig.jpg`, `libro-mastro-grey.jpg`, `libro-mastro-cut.png`, `libro-mastro-cut-grey.png`
- What: Libro mastro (ledger) of 1561, Modena: leather binding with straps
- Source: https://commons.wikimedia.org/wiki/File:Modena_-_Libro_Mastro_(1561).jpg (Modena - Libro Mastro (1561).jpg)
- Author: GJo
- Licence: CC BY-SA 3.0 — http://creativecommons.org/licenses/by-sa/3.0/
- Changes: resized to ≤ 2804 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

### pila-pratiche
- Files: `pila-pratiche-orig.jpg`, `pila-pratiche-grey.jpg`
- What: Close-up of a thick stack of paper sheets and forms
- Source: https://commons.wikimedia.org/wiki/File:FileStack.jpg (FileStack.jpg)
- Author: Niklas Bildhauer
- Licence: CC BY-SA 2.0 — https://creativecommons.org/licenses/by-sa/2.0
- Changes: resized to ≤ 2592 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6

### pila-pratiche-b
- Files: `pila-pratiche-b-orig.jpg`, `pila-pratiche-b-grey.jpg`, `pila-pratiche-b-cut.png`, `pila-pratiche-b-cut-grey.png`
- What: Tall stack of paper files in a museum (Versicherungsmuseum)
- Source: https://commons.wikimedia.org/wiki/File:Aktenstapel-Versicherungsmuseum-CTH.JPG (Aktenstapel-Versicherungsmuseum-CTH.JPG)
- Author: CTHOE
- Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0
- Changes: resized to ≤ 1929 px long side, re-encoded JPEG q88; resized, converted to greyscale, auto levels + S-curve, mapped to ink #0A0A0A – paper #E6E6E6; background removed with macOS Vision (VNGenerateForegroundInstanceMaskRequest), cropped to subject, ≤ 1600 px; background removed (Vision), cropped, ≤ 2048 px, greyscale graded ink #0A0A0A – paper #E6E6E6

## Maps (`geo/`)

- `italia-regioni.*`, `italia-outline.svg`, `italia-comuni*`: **ISTAT**, “Confini delle unità amministrative a fini statistici al 1° gennaio 2025” (versione generalizzata), https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/2025/Limiti01012025_g.zip (licence: https://www.istat.it/note-legali/). Licence **CC BY 4.0** (ISTAT site legal notes: “Salvo diversa indicazione, tutti i contenuti … licenza Creative Commons – Attribuzione – versione 4.0”). Attribution: “Fonte: ISTAT”. Changes: reprojected from UTM 32N to WGS84 lon/lat, simplified (regions ~400 m, comuni ~350 m tolerance), coordinates rounded, centroids computed (representative point when the centroid falls outside), SVGs projected in Web Mercator.
- `italia-outline-ne.geojson`, `europa-context-ne.geojson`: **Natural Earth** 10m / 50m admin-0 countries (https://www.naturalearthdata.com, via github.com/nvkelso/natural-earth-vector), **public domain**. Changes: Italy extracted / countries clipped to a box around Italy, simplified, rounded.

## Not included, and why
- No green registered-mail envelope with a free licence exists on Commons: draw the *busta verde* in code (put it on `zerbino-cut*.png`).
- No modern *marca da bollo* or Agenzia/INPS/Poste logos (official marks); the post-office interior with Poste branding and visible faces was rejected; a rubber-stamp pile showing a private person's name was rejected.
- German text: `timbri-carosello` (stamp labels) and `faldoni-scaffale` (file labels) — keep them small, blurred or cropped.
