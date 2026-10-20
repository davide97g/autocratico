#!/usr/bin/env python3
"""TIFF scans and faxes as PDFs the agents can read, checked page by page.

Claude Code's Read opens PDFs, not TIFFs. Every TIFF that arrives (email attachment, upload, chat
file) gets a PDF with all its pages next to it; the TIFF itself is never deleted. The PDF is kept
only once it has passed the check below, otherwise the TIFF stays alone.

Conversion: libtiff's tiff2pdf with -n, so that every page is decoded and encoded again (CCITT G4
for black and white pages, Deflate for the rest). Without -n, tiff2pdf copies a Deflate-compressed
1-bit page into the PDF as it is but labels it CCITTFaxDecode (libtiff 4.7, t2p_read_tiff_data):
readers then draw a few streaks on a white page. Fax-style scans from couriers and customs offices
are exactly that (1 bit, Deflate, Ghostscript's tiffg4/tiffsep output), and on 2026-10-18 the
server's first conversion turned some of them into such PDFs and deleted the TIFFs.

Check: the PDF has as many pages as the TIFF, and every page, rendered by poppler's pdftoppm at the
TIFF's pixel size, matches the same page decoded by libtiff (tiffcp) and ffmpeg, compared in small
cells of pixels (thresholds below).

Usage:
  python3 scripts/scans.py convert SCAN.tif [OUT.pdf]   PDF next to the TIFF (or OUT), checked
  python3 scripts/scans.py check SCAN.tif SCAN.pdf      does the PDF show the TIFF?
  python3 scripts/scans.py scan [--data DIR]            list PDFs that conversion may have broken (read-only):
      broken (Deflate labelled CCITT), unchecked (tiff2pdf's, no TIFF beside it) or wrong (fails the check)
  python3 scripts/scans.py repair FOLDER ORIGINAL.tif... [--apply]
      put each TIFF back in FOLDER and make its PDF again, listing both in item.json / message.md;
      without --apply it only says what it would do. Running it again changes nothing.

Needs tiff2pdf and tiffcp (libtiff-tools), pdftoppm and pdfinfo (poppler-utils) and ffmpeg.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

TIFF_SUFFIXES = (".tif", ".tiff")
TIMEOUT = 120
# Pages are compared in cells of 4x4 pixels. A right PDF of the 2026-10-18 scans scores far 0.001,
# mean difference 2.7 and correlation 0.98 at worst; the broken ones far 0.09, difference 15 and
# correlation 0.12 at best.
CELL = 4
FAR = 64
MAX_FAR = 0.01
MAX_MEAN_DIFF = 8.0
MIN_CORRELATION = 0.9
TOOLS = ("tiff2pdf", "tiffcp", "pdftoppm", "pdfinfo", "ffmpeg")


class ScanError(Exception):
    pass


def is_tiff(path: Path) -> bool:
    try:
        with open(path, "rb") as f:
            head = f.read(4)
    except OSError:
        return False
    return head in (b"II*\0", b"MM\0*", b"II+\0", b"MM\0+")


def tiff_pages(path: Path) -> list[tuple[int, int]]:
    """Width and height of every page (IFD) of a TIFF or BigTIFF, in file order."""
    data = path.read_bytes()
    if len(data) < 8 or not is_tiff(path):
        raise ScanError(f"{path.name} is not a TIFF")
    e = "<" if data[:2] == b"II" else ">"
    big = struct.unpack_from(e + "H", data, 2)[0] == 43
    if big:
        offset = struct.unpack_from(e + "Q", data, 8)[0]
        count_fmt, entry_size, next_fmt = "Q", 20, "Q"
    else:
        offset = struct.unpack_from(e + "I", data, 4)[0]
        count_fmt, entry_size, next_fmt = "H", 12, "I"
    pages: list[tuple[int, int]] = []
    seen: set[int] = set()
    try:
        while offset and offset not in seen and len(pages) < 10_000:
            seen.add(offset)
            n = struct.unpack_from(e + count_fmt, data, offset)[0]
            start = offset + struct.calcsize(count_fmt)
            size: dict[int, int] = {}
            for k in range(n):
                at = start + k * entry_size
                tag, kind = struct.unpack_from(e + "HH", data, at)
                if tag in (256, 257):
                    value_at = at + (12 if big else 8)
                    size[tag] = struct.unpack_from(e + ("H" if kind == 3 else "I"), data, value_at)[0]
            if 256 not in size or 257 not in size:
                raise ScanError(f"{path.name}: page {len(pages) + 1} has no size")
            pages.append((size[256], size[257]))
            offset = struct.unpack_from(e + next_fmt, data, start + n * entry_size)[0]
    except struct.error as err:
        raise ScanError(f"{path.name} is damaged ({err})") from err
    if not pages:
        raise ScanError(f"{path.name} has no pages")
    return pages


def _run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, check=True, capture_output=True, timeout=TIMEOUT, **kw)
    except FileNotFoundError as err:
        raise ScanError(f"{cmd[0]} not installed") from err
    except subprocess.CalledProcessError as err:
        last = (err.stderr or b"").decode(errors="replace").strip().splitlines()[-1:] or [f"exit {err.returncode}"]
        raise ScanError(f"{cmd[0]} failed: {last[0][:200]}") from err
    except subprocess.TimeoutExpired as err:
        raise ScanError(f"{cmd[0]} timed out") from err


def missing_tools() -> list[str]:
    return [t for t in TOOLS if not shutil.which(t)]


def _pdf_pages(pdf: Path) -> int:
    out = _run(["pdfinfo", str(pdf)]).stdout.decode(errors="replace")
    m = re.search(r"^Pages:\s+(\d+)", out, re.M)
    if not m:
        raise ScanError(f"{pdf.name}: pdfinfo shows no pages")
    return int(m.group(1))


def _tiff_gray(tiff: Path, page: int, width: int, height: int, tmp: Path) -> bytes:
    """One page as 8-bit gray pixels, decoded by libtiff (tiffcp, uncompressed) then ffmpeg."""
    one = tmp / f"page-{page}.tif"
    _run(["tiffcp", "-c", "none", "-f", "msb2lsb", f"{tiff},{page}", str(one)])
    px = _run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(one), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout
    if len(px) != width * height:
        raise ScanError(f"page {page + 1}: ffmpeg decoded {len(px)} pixels, not {width}x{height}")
    return px


def _pdf_gray(pdf: Path, page: int, width: int, height: int) -> bytes:
    """One page rendered by pdftoppm at the TIFF's pixel size, 8-bit gray, without anti-aliasing."""
    n = str(page + 1)
    out = _run(
        ["pdftoppm", "-f", n, "-l", n, "-gray", "-aa", "no", "-aaVector", "no",
         "-scale-to-x", str(width), "-scale-to-y", str(height), str(pdf)]
    ).stdout
    m = re.match(rb"P5\s+(\d+)\s+(\d+)\s+(\d+)\s", out)
    if not m or int(m.group(3)) != 255:
        raise ScanError(f"page {page + 1}: pdftoppm gave no image")
    w, h = int(m.group(1)), int(m.group(2))
    if (w, h) != (width, height):
        raise ScanError(f"page {page + 1}: rendered {w}x{h}, the scan is {width}x{height}")
    px = out[m.end():]
    if len(px) != width * height:
        raise ScanError(f"page {page + 1}: pdftoppm gave a short image")
    return px


def _cells(px: bytes, width: int, height: int) -> bytes:
    """The page in cells of CELL x CELL pixels (their average gray), through ffmpeg's area filter."""
    size = f"{max(1, width // CELL)}:{max(1, height // CELL)}"
    return _run(
        ["ffmpeg", "-nostdin", "-v", "error", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{width}x{height}", "-i", "-",
         "-vf", f"scale={size}:flags=area", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        input=px,
    ).stdout


def compare(a: bytes, b: bytes) -> tuple[float, float, float]:
    """Cells far apart (gray differs by more than FAR), mean difference, and correlation of two pages
    in cells (1.0 when both are blank). Comparing cells, not pixels, forgives the renderer's
    resampling of halftones and edges; a page that shows something else fails on all three."""
    n = len(a)
    if not n or len(b) != n:
        return 1.0, 255.0, 0.0
    far = sum(1 for x, y in zip(a, b) if abs(x - y) > FAR) / n
    mad = sum(abs(x - y) for x, y in zip(a, b)) / n
    ma, mb = sum(a) / n, sum(b) / n
    va = sum((x - ma) ** 2 for x in a)
    vb = sum((y - mb) ** 2 for y in b)
    if va < n or vb < n:  # (almost) one flat gray: nothing to correlate, the difference decides
        corr = 1.0 if mad <= MAX_MEAN_DIFF else 0.0
    else:
        corr = sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (va * vb) ** 0.5
    return far, mad, corr


def check(tiff: Path, pdf: Path) -> None:
    """Raises ScanError unless `pdf` shows every page of `tiff`."""
    pages = tiff_pages(tiff)
    if not pdf.read_bytes().startswith(b"%PDF"):
        raise ScanError(f"{pdf.name} is not a PDF")
    count = _pdf_pages(pdf)
    if count != len(pages):
        raise ScanError(f"{pdf.name} has {count} pages, {tiff.name} has {len(pages)}")
    with tempfile.TemporaryDirectory(prefix="autocratico-scan-") as tmp:
        for i, (w, h) in enumerate(pages):
            scan_cells = _cells(_tiff_gray(tiff, i, w, h, Path(tmp)), w, h)
            pdf_cells = _cells(_pdf_gray(pdf, i, w, h), w, h)
            far, mad, corr = compare(scan_cells, pdf_cells)
            if far > MAX_FAR or mad > MAX_MEAN_DIFF or corr < MIN_CORRELATION:
                raise ScanError(f"{pdf.name}: page {i + 1} does not match the scan (far {far:.3f}, difference {mad:.1f}, correlation {corr:.2f})")


def to_pdf(tiff: Path, pdf: Path) -> Path:
    """Writes `pdf` from `tiff` (every page), checked; on any failure nothing is written."""
    if missing := missing_tools():
        raise ScanError(f"not installed: {', '.join(missing)}")
    pdf.parent.mkdir(parents=True, exist_ok=True)
    # Next to the result, so that keeping it is a rename on the same filesystem.
    fd, name = tempfile.mkstemp(dir=pdf.parent, prefix=".convert-", suffix=".pdf")
    os.close(fd)
    tmp = Path(name)
    try:
        _run(["tiff2pdf", "-n", "-z", "-o", str(tmp), str(tiff)])
        check(tiff, tmp)
        os.chmod(tmp, 0o644)
        os.replace(tmp, pdf)
    finally:
        tmp.unlink(missing_ok=True)
    return pdf


# ---------- PDFs broken on 2026-10-18 ----------

_CCITT = re.compile(rb"/Filter\s*/CCITTFaxDecode[^>]*>>\s*>>\s*stream\r?\n", re.S)


def broken(pdf: Path) -> bool:
    """A PDF from tiff2pdf whose CCITTFaxDecode image is really Deflate data (the bug in the header)."""
    try:
        data = pdf.read_bytes()
    except OSError:
        return False
    if b"tiff2pdf" not in data[:4096]:
        return False
    for m in _CCITT.finditer(data):
        chunk = data[m.end() : m.end() + 4096]
        if len(chunk) < 2 or (chunk[0] & 0x0F) != 8 or ((chunk[0] << 8) | chunk[1]) % 31:
            continue
        try:
            zlib.decompressobj().decompress(chunk)
            return True
        except zlib.error:
            continue
    return False


def _tiffs_for(pdf: Path) -> list[Path]:
    stem = pdf.stem.lower()
    return sorted(p for p in pdf.parent.iterdir() if p.suffix.lower() in TIFF_SUFFIXES and p.stem.lower() == stem)


def status(pdf: Path) -> str | None:
    """What is known of a PDF that tiff2pdf made (None for any other PDF): `broken` (the Deflate data
    labelled CCITTFaxDecode), `ok` or `wrong` against the TIFF next to it, or `unchecked` (no TIFF
    to compare with: the broken conversion deleted it)."""
    try:
        with open(pdf, "rb") as f:
            head = f.read(4096)
    except OSError:
        return None
    if not head.startswith(b"%PDF") or b"tiff2pdf" not in head:
        return None
    if broken(pdf):
        return "broken"
    tiffs = _tiffs_for(pdf)
    if not tiffs:
        return "unchecked"
    try:
        check(tiffs[0], pdf)
        return "ok"
    except ScanError:
        return "wrong"


def scan(data: Path) -> list[tuple[Path, str]]:
    """PDFs under archive/, inbox/ and chats/ of a data folder that tiff2pdf made, but those checked
    against their TIFF: what the conversion of 2026-10-18 may have broken."""
    found: list[tuple[Path, str]] = []
    for top in ("archive", "inbox", "chats"):
        for root, dirs, files in os.walk(data / top):
            dirs[:] = sorted(d for d in dirs if not d.startswith("."))
            for f in sorted(files):
                if f.lower().endswith(".pdf") and (st := status(Path(root) / f)) not in (None, "ok"):
                    found.append((Path(root) / f, st))
    return found


# ---------- repair ----------


def _listed(names: list[str], pdf: str, tiff: str) -> list[str]:
    """`names` with the PDF and, right after it, the TIFF (each once)."""
    out = [n for n in names if n not in (pdf, tiff)]
    at = next((i for i, n in enumerate(names) if n in (pdf, tiff)), len(names))
    at = len([n for n in names[:at] if n not in (pdf, tiff)])
    return out[:at] + [pdf, tiff] + out[at:]


def _fix_listings(folder: Path, pdf: str, tiff: str, apply: bool) -> list[str]:
    """Lists both files in the folder's item.json (inbox) or message.md (archive/email)."""
    changes: list[str] = []
    item = folder / "item.json"
    if item.exists():
        meta = json.loads(item.read_text(encoding="utf-8"))
        files = meta.get("files") if isinstance(meta.get("files"), list) else []
        fixed = _listed(files, pdf, tiff)
        if fixed != files:
            changes.append(f"list both in item.json: {json.dumps(files, ensure_ascii=False)} -> {json.dumps(fixed, ensure_ascii=False)}")
            if apply:
                meta["files"] = fixed
                _write(item, json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    message = folder / "message.md"
    if message.exists():
        text = message.read_text(encoding="utf-8")
        m = re.search(r"^attachments: (.*)$", text, re.M)
        if m:
            try:
                names = json.loads(m.group(1))
            except json.JSONDecodeError:
                names = None
            if isinstance(names, list):
                fixed = _listed(names, pdf, tiff)
                if fixed != names:
                    line = f"attachments: {json.dumps(fixed, ensure_ascii=False)}"
                    changes.append(f"list both in message.md: {m.group(1)} -> {json.dumps(fixed, ensure_ascii=False)}")
                    if apply:
                        _write(message, text[: m.start()] + line + text[m.end() :])
    return changes


def _write(path: Path, text: str) -> None:
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.chmod(tmp, path.stat().st_mode & 0o777)
    os.replace(tmp, path)


def repair(folder: Path, original: Path, apply: bool) -> list[str]:
    """Puts `original` back in `folder` and makes its PDF again. Returns what it did (or would do)."""
    if not folder.is_dir():
        raise ScanError(f"{folder} is not a folder")
    if not original.is_file() or not is_tiff(original):
        raise ScanError(f"{original} is not a TIFF")
    tiff = folder / original.name
    pdf = next((p for p in folder.iterdir() if p.suffix.lower() == ".pdf" and p.stem.lower() == tiff.stem.lower()), folder / f"{tiff.stem}.pdf")
    steps: list[str] = []

    if tiff.exists():
        if tiff.read_bytes() != original.read_bytes():
            raise ScanError(f"{tiff} exists and is not the same file as {original}")
    else:
        steps.append(f"put back {tiff.name}")
        if apply:
            shutil.copyfile(original, tiff)
            os.chmod(tiff, 0o644)

    source = tiff if tiff.exists() else original
    redo = True
    if pdf.exists() and not broken(pdf):
        try:
            check(source, pdf)
            redo = False
        except ScanError as err:
            if b"tiff2pdf" not in pdf.read_bytes()[:4096]:
                raise ScanError(f"{pdf} was not made from a TIFF here, left alone ({err})") from err
    if redo:
        steps.append(f"{'replace' if pdf.exists() else 'make'} {pdf.name}{' (broken)' if pdf.exists() and broken(pdf) else ''}")
        if apply:
            to_pdf(source, pdf)
        else:
            # Dry run: the conversion in a scratch folder, so the answer says whether it will work.
            with tempfile.TemporaryDirectory(prefix="autocratico-scan-") as tmp:
                to_pdf(original, Path(tmp) / pdf.name)
    steps += _fix_listings(folder, pdf.name, tiff.name, apply)
    return steps


def _data_dir() -> Path:
    from store import DATA_DIR

    return DATA_DIR


def main() -> None:
    p = argparse.ArgumentParser(description="TIFF scans to checked PDFs, and repair of the PDFs broken on 2026-10-18.")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("convert", help="make the PDF of a TIFF, checked page by page")
    c.add_argument("tiff", type=Path)
    c.add_argument("pdf", type=Path, nargs="?")
    k = sub.add_parser("check", help="does the PDF show every page of the TIFF?")
    k.add_argument("tiff", type=Path)
    k.add_argument("pdf", type=Path)
    s = sub.add_parser("scan", help="list PDFs the broken conversion may have made (read-only)")
    s.add_argument("--data", type=Path, help="data folder (default: AUTOCRATICO_DATA or data/)")
    r = sub.add_parser("repair", help="put a TIFF back and make its PDF again (dry run without --apply)")
    r.add_argument("folder", type=Path)
    r.add_argument("originals", type=Path, nargs="+", metavar="original")
    r.add_argument("--apply", action="store_true", help="write the changes")
    a = p.parse_args()

    try:
        if a.cmd == "convert":
            out = to_pdf(a.tiff, a.pdf or a.tiff.with_suffix(".pdf"))
            print(out)
        elif a.cmd == "check":
            check(a.tiff, a.pdf)
            print(f"ok: {a.pdf} shows all {len(tiff_pages(a.tiff))} pages of {a.tiff.name}")
        elif a.cmd == "scan":
            data = (a.data or _data_dir()).expanduser().resolve()
            found = scan(data)
            for f, st in found:
                tiffs = _tiffs_for(f)
                print(f"{f.relative_to(data)}\t{st}\toriginal here: {', '.join(t.name for t in tiffs) if tiffs else 'no'}")
            print(f"{len(found)} suspect PDF(s) in {data} (read-only scan)", file=sys.stderr)
        elif a.cmd == "repair":
            changed = False
            for original in a.originals:
                steps = repair(a.folder, original, a.apply)
                for step in steps:
                    print(f"{'' if a.apply else 'would '}{step}")
                if not steps:
                    print(f"{original.name}: nothing to do, the TIFF is there and its PDF is right")
                changed = changed or bool(steps)
            if changed and not a.apply:
                print("dry run: nothing written (add --apply)")
    except (ScanError, OSError) as err:
        sys.exit(f"error: {err}")


if __name__ == "__main__":
    main()
