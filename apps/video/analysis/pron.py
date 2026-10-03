"""Display token -> pronunciation spelling used for CTC alignment.

Each display token (lyric line split on spaces) maps to one or more
pronunciation sub-words made of plain letters (and internal apostrophes).
The lyric is Italian: accents are stripped (the acoustic models' alphabets are
plain a-z), and the few tokens that are not read as written are spelled out.
"""
import re
import unicodedata

PRON = {
    "F24!": "effe ventiquattro",
    "Phishing,": "fishing",
    "password,": "pasuord",
}

# alternative pronunciations to test (scored by alignment likelihood)
ALT = {}


def pron(token: str) -> list[str]:
    if token in PRON:
        return PRON[token].split()
    w = unicodedata.normalize("NFD", token.lower())
    w = "".join(c for c in w if not unicodedata.combining(c))
    w = w.replace("’", "'")
    w = re.sub(r"[^a-z' ]", " ", w)
    w = w.strip("' ")
    return [p.strip("'") for p in w.split() if p.strip("'")]


if __name__ == "__main__":
    import common
    for _, _, t in common.load_lyrics_src():
        print(t, "->", " | ".join(" ".join(pron(w)) for w in t.split(" ")))
