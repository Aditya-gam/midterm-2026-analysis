"""Shared loaders and race helpers for the analysis scripts."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CIVIC = RAW / "civic"
BASE = RAW / "baselines"
OUT = ROOT / "data" / "processed"

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "DC": "11",
    "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30",
    "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56",
}

WRITE_IN = re.compile(r"write[\s-]*in", re.I)


def party_code(party: str | None) -> str:
    p = (party or "").strip().lower()
    if p.startswith("dem") or p in ("d", "dfl"):
        return "D"
    if p.startswith("rep") or p in ("r", "gop"):
        return "R"
    return "O"


def real_candidates(cands: list[dict]) -> list[dict]:
    """Candidates minus write-in placeholder lines."""
    return [c for c in cands or [] if not WRITE_IN.search(c.get("name") or "") and not WRITE_IN.search(c.get("party") or "")]


PARTY_WORDS = {"democratic", "democrat", "republican", "independent", "libertarian", "green", "other", "nonpartisan"}


def is_rollup(race: dict) -> bool:
    """civicAPI chamber summaries ('Texas State Senate', 31 seats) list parties, not people, as candidates."""
    cands = race.get("candidates") or []
    return bool(cands) and all((c.get("name") or "").strip().lower() in PARTY_WORDS for c in cands)


def total_votes(cands: list[dict]) -> int:
    return sum(int(c.get("votes") or 0) for c in cands or [])


def ranked(cands: list[dict]) -> list[dict]:
    return sorted(real_candidates(cands), key=lambda c: -(c.get("votes") or 0))


def top_by_party(cands: list[dict], code: str) -> dict | None:
    best = None
    for c in cands or []:
        if party_code(c.get("party")) == code and (best is None or (c.get("votes") or 0) > (best.get("votes") or 0)):
            best = c
    return best


def share(v: float, tot: float) -> float | None:
    return round(100.0 * v / tot, 2) if tot else None


@lru_cache(maxsize=1)
def lists() -> dict[str, list[dict]]:
    out = {}
    for f in sorted((CIVIC / "lists").glob("*.json")):
        out[f.stem] = json.loads(f.read_text())["races"]
    return out


@lru_cache(maxsize=1)
def details() -> dict[int, dict]:
    out = {}
    for f in (CIVIC / "races").glob("*.json"):
        out[int(f.stem)] = json.loads(f.read_text())
    return out


def office_of(r: dict) -> str | None:
    """'sen' | 'gov' | 'house' for federal and governor races, else None."""
    name = (r.get("election_name") or "").lower()
    if r.get("election_type") not in ("General", "Statewide") and r.get("type") != "House of Representatives":
        return None
    if r.get("type") == "Referendum" or re.search(r"question|proposition|amendment|measure|initiative|retention", name):
        return None
    if re.search(r"\bu\.?\s?s\.? senate\b|\bunited states senate\b", name):
        return "sen"
    if re.search(r"\bgovernor\b", name) and "lieutenant" not in name and "board" not in name:
        return "gov"
    if r.get("type") == "House of Representatives" or re.search(r"\bu\.?\s?s\.? house\b", name):
        return "house"
    return None


def _norm(name: str) -> str:
    n = re.sub(r"\(.*?\)", " ", (name or "").lower())  # NY: "Albany (Active Registered Voters: 211,266)"
    n = n.replace("saint ", "st ").replace("st. ", "st ")
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def _strip_town(n: str) -> str:
    """'agawam town city' -> 'agawam'; 'laconia ward 3' -> 'laconia'; 'cary plt' -> 'cary'."""
    n = re.sub(r" ward \d+$", "", n)
    n = re.sub(r" plt$", "", n)
    prev = None
    while prev != n:
        prev, n = n, _TOWN_SUFFIX.sub("", n)
    return n


_COUNTY_SUFFIX = re.compile(r" (county|parish|borough|census area|city and borough|municipality)$")
_TOWN_SUFFIX = re.compile(r" (town|city|township|plantation|village|gore|grant|location|purchase|unorganized territory)$")


@lru_cache(maxsize=1)
def county_index() -> tuple[dict, dict]:
    """(state, normalized name, 'city'|'county') -> FIPS, and FIPS -> display name, from the 2024 county file."""
    import csv
    abbr = {v: k for k, v in STATE_NAMES.items()}
    idx, names = {}, {}
    with (BASE / "pres_county_2024.csv").open() as f:
        for r in csv.DictReader(f):
            st = abbr.get(r["state_name"])
            fips = r["county_fips"].zfill(5)
            n = _norm(r["county_name"])
            kind = "city" if n.endswith(" city") and st in ("VA", "MD", "MO", "NV") else "county"
            idx[(st, _COUNTY_SUFFIX.sub("", re.sub(r" city$", "", n) if kind == "city" else n), kind)] = fips
            names[fips] = r["county_name"]
    return idx, names


@lru_cache(maxsize=1)
def town_index() -> dict:
    """(state, normalized town name) -> county FIPS; None where a name is ambiguous within the state."""
    idx: dict = {}
    with (BASE / "census_cousub_2020.txt").open(encoding="latin-1") as f:
        next(f)
        for line in f:
            st, sfp, cfp, *_, sub, _cls, _stat = line.rstrip("\n").split("|")
            if sub.startswith("County subdivisions not defined"):
                continue
            key = (st, _strip_town(_norm(sub)))
            fips = sfp + cfp
            idx[key] = fips if idx.get(key, fips) == fips else None
    return idx


def region_fips(st: str, v: dict) -> str | None:
    """County FIPS for one civicAPI region result: its own code, or matched by county or town name."""
    if st == "AK":  # 2024 baseline is by legislative district; borough codes would collide with it
        return None
    f = str(v.get("fips") or "")
    if len(f) == 5:
        return f
    t = (v.get("type") or "").lower()
    name = _norm(v.get("name") or "")
    if t in ("town", "township"):
        return town_index().get((st, _strip_town(name)))
    if t in ("county", "city", "parish", "borough"):
        idx, _ = county_index()
        base = _COUNTY_SUFFIX.sub("", re.sub(r" city$", "", name))
        first, second = ("city", "county") if t == "city" else ("county", "city")
        return idx.get((st, base, first)) or idx.get((st, base, second))
    return None


def write(name: str, rows) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(rows, separators=(",", ":")))
    n = len(rows) if isinstance(rows, list) else 1
    print(f"{name}: {n} rows, {(OUT / f'{name}.json').stat().st_size:,} bytes")
