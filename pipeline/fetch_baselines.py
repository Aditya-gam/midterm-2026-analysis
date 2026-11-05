"""Download the comparison data the analysis needs.

- County presidential results 2020 and 2024 (tonmcg/US_County_Level_Election_Results_08-24, MIT license)
- State turnout denominators: UF Election Lab 2022 and 2026 (VEP)
- County demographics: USDA ERS education, income, population (includes rural-urban codes)
- NBC News national exit polls 2022, 2024, 2026: only the embedded poll data is kept

Files that already exist are skipped unless --refresh (the NBC 2026 poll is
always re-fetched because it is still being weighted to the final count).

Usage: python pipeline/fetch_baselines.py [--refresh]
"""
from __future__ import annotations

import argparse
import http.client
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "data" / "raw" / "baselines"
EXIT = ROOT / "data" / "raw" / "exit"
USER_AGENT = "midterm-2026-analysis/1.0 (personal data analysis)"

TONMCG = "https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master"
ERS = "https://www.ers.usda.gov/media"
FILES = {
    "pres_county_2024.csv": f"{TONMCG}/2024_US_County_Level_Presidential_Results.csv",
    "pres_county_2020.csv": f"{TONMCG}/2020_US_County_Level_Presidential_Results.csv",
    "uf_turnout_2026.csv": "https://election.lab.ufl.edu/data-downloads/turnoutdata/Turnout_2026G_v0.1.csv",
    "uf_turnout_2022.csv": "https://election.lab.ufl.edu/data-downloads/turnoutdata/Turnout_2022G_v0.1.csv",
    "ers_education.csv": f"{ERS}/5495/educational-attainment-for-adults-age-25-and-older-for-the-united-states-states-and-counties-1970-2023.csv?v=50756",
    "ers_income.csv": f"{ERS}/5497/unemployment-and-median-household-income-for-the-united-states-states-and-counties-2000-23.csv?v=15677",
    "ers_population.csv": f"{ERS}/5499/population-estimates-for-the-united-states-states-and-counties-2020-23.csv?v=51486",
    # towns and townships with their counties, for New England results reported by town
    "census_cousub_2020.txt": "https://www2.census.gov/geo/docs/reference/codes2020/national_cousub2020.txt",
}
PAGES = {  # HTML pages parsed later (Wikipedia, CC BY-SA)
    "wp_ballot_measures_2026.html": "https://en.wikipedia.org/api/rest_v1/page/html/2026_United_States_ballot_measures",
}
NBC = {
    2022: "https://www.nbcnews.com/politics/2022-elections/exit-polls/",
    2024: "https://www.nbcnews.com/politics/2024-elections/exit-polls",
    2026: "https://www.nbcnews.com/politics/2026-elections/exit-polls",
}


def download(url: str, tries: int = 4) -> bytes:
    """Transfers were often cut short (IncompleteRead), so retry with a pause."""
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as resp:
                return resp.read()
        except (http.client.HTTPException, urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if attempt == tries:
                raise
            print(f"  retry {attempt} after {type(e).__name__}")
            time.sleep(3 * attempt)
    raise AssertionError("unreachable")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    BASE.mkdir(parents=True, exist_ok=True)
    EXIT.mkdir(parents=True, exist_ok=True)
    failures = []

    for name, url in FILES.items():
        out = BASE / name
        if out.exists() and not args.refresh:
            print(f"skip {name}")
            continue
        try:
            data = download(url)
        except Exception as e:  # report every failure, keep going
            failures.append(name)
            print(f"FAIL {name}: {type(e).__name__} {e}")
            continue
        if data[:15].lower().startswith((b"<!doctype", b"<html")):
            failures.append(name)
            print(f"FAIL {name}: got an HTML page, not a data file")
            continue
        out.write_bytes(data)
        print(f"ok   {name} {len(data):,} bytes")

    for name, url in PAGES.items():  # re-fetched every run: results are still being filled in
        try:
            (BASE / name).write_bytes(download(url))
            print(f"ok   {name}")
        except Exception as e:
            failures.append(name)
            print(f"FAIL {name}: {type(e).__name__} {e}")

    for year, url in NBC.items():
        out = EXIT / f"nbc_national_{year}.json"
        if out.exists() and not args.refresh and year != 2026:
            print(f"skip {out.name}")
            continue
        try:
            html = download(url).decode("utf-8", "replace")
            m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
            if m is None:
                raise ValueError("page has no embedded __NEXT_DATA__")
            props = json.loads(m.group(1))["props"]["pageProps"]
            polls = props["nationalExitPollData"]
        except Exception as e:
            failures.append(out.name)
            print(f"FAIL {out.name}: {type(e).__name__} {e}")
            continue
        out.write_text(json.dumps({"source": url, "page_last_modified": props.get("lastModifiedFormatted"),
                                   "groups": polls}))
        print(f"ok   {out.name} groups={len(polls)} questions={len(polls[0]['polls']['polls'])}")

    print("DONE" if not failures else f"DONE with failures: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
