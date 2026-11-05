"""Write the dashboard's store documents as local JSON files, ready for one ArtifactData batch.

Input:  site/asset_urls.json  {"<dataset id>": {"url": "/_blob/...", "name": "<file>.json"}} (from the uploads)
Output: site/store/dash__meta.json, site/store/datasets__<id>.json, site/store/files__<name>.json
Usage:  python pipeline/make_store_docs.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
STORE = SITE / "store"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
EDIT = {"via": "claude", "at": NOW}

CIVIC = "Unofficial 2026 results from civicAPI (civicapi.org)"
DATASETS = {
    "headline": ("Seats and votes by office", f"{CIVIC}: races won or leading per party for House, Senate and governor, and combined votes."),
    "races_federal": ("House, Senate, governor races", f"{CIVIC}: one row per federal or governor race, with candidates, margin, winner and reporting."),
    "statewide_vs_pres": ("Statewide races vs 2024", f"{CIVIC}, set against each state's 2024 presidential margin (tonmcg county results, MIT license)."),
    "county_swing": ("County shift since 2024", f"{CIVIC} by county for each state's top statewide race, against 2024 presidential results by county; county traits from USDA ERS."),
    "swing_by_type": ("Shift by kind of county", "County shifts summarized by rural-urban type, education and income fifths (USDA ERS county data)."),
    "geo_counties": ("County outlines", "County shapes from us-atlas 3.0.1 (Albers USA), pre-drawn as SVG paths."),
    "geo_states": ("State outlines", "State shapes from us-atlas 3.0.1 (Albers USA), pre-drawn as SVG paths."),
    "turnout_state": ("Turnout by state", f"{CIVIC}: votes in each state's largest one-vote race, over eligible voters from UF Election Lab; 2022 turnout from UF Election Lab."),
    "measures_statewide": ("Statewide ballot measures", f"{CIVIC} for statewide measures; titles and topics from Wikipedia's 2026 ballot measures list (CC BY-SA)."),
    "measures_local": ("Local ballot questions", f"{CIVIC}: local ballot questions grouped by words in their titles, with how many are passing."),
    "measure_featured": ("Featured ballot measure", f"{CIVIC}: the measure passing in the state Trump carried by the most in 2024."),
    "measure_counties": ("Featured measure by county", f"{CIVIC} by county for the featured measure, with each county's 2024 Trump share."),
    "office_contest": ("Contested races by office", f"{CIVIC}: state and local races by office type, how many had no contest and how close the rest were."),
    "office_margins": ("Winning margins by office", f"{CIVIC}: single-seat contested races at least half counted, by winning margin in 5-point bins."),
    "state_legislatures": ("State legislative seats", f"{CIVIC}: state house and senate seats on the 2026 ballot won or leading per party."),
    "exit_shift": ("Exit polls: vote by group", "NBC News national exit polls, 2022 House, 2024 president and 2026 House: vote by voter group."),
    "exit_flow": ("Exit poll: 2024 vote to 2026", "NBC News 2026 exit poll: House vote by how people voted for president in 2024."),
    "exit_issue": ("Exit poll: top issue", "NBC News 2026 exit poll: the most important issue and the House vote among those naming it."),
    "exit_approval": ("Exit poll: Trump approval", "NBC News 2026 exit poll: Trump job approval and the House vote at each level."),
    "exit_age_mix": ("Exit poll: voters by age", "NBC News exit polls: share of voters in each age group, 2022 and 2026."),
}
PAGE_FILES = ["index.html", "kit.js", "national.js", "more.js"]


def dump(name: str, doc: dict) -> None:
    STORE.mkdir(parents=True, exist_ok=True)
    (STORE / name).write_text(json.dumps(doc))


def main() -> None:
    urls = json.loads((SITE / "asset_urls.json").read_text())
    missing = [d for d in DATASETS if d not in urls]
    if missing:
        raise SystemExit(f"no uploaded file for: {missing}")
    dump("dash__meta.json", {"title": "2026 Midterm Atlas"})
    for ds, (title, desc) in DATASETS.items():
        u = urls[ds]
        dump(f"datasets__{ds}.json", {
            "title": title, "description": desc,
            "source": {"kind": "file", "url": u["url"], "name": u["name"], "format": "json"},
            "updated": {"at": u.get("at", NOW), "by": "Claude, from the project pipeline"},
            "schedule": "Rebuilt by hand as counting finishes and after certification",
            "staleAfterHours": 72, "edit": EDIT,
        })
    for f in PAGE_FILES:
        text = (SITE / f).read_text()
        if len(text.encode()) > 250_000:
            raise SystemExit(f"{f} is over the 256 KB document limit")
        dump(f"files__{f}.json", {"text": text, "edit": EDIT})
    print(f"wrote {len(DATASETS) + len(PAGE_FILES) + 1} documents to {STORE}")


if __name__ == "__main__":
    main()
