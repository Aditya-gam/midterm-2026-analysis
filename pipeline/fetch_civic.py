"""Fetch 2026 general-election results from civicAPI (https://civicapi.org).

Phase 1 saves every state's race list; phase 2 saves the full detail record
(county results, incumbents, registered voters) for federal, governor,
statewide-office and statewide-measure races. Raw responses are stored as-is
so later analysis never needs to re-fetch.

Resumable: detail files already on disk are skipped unless --refresh.
One request at a time, with retries and backoff, because the API was flaky on
election night. Ends with one summary line: DONE ... or STOPPED ...

Usage: python pipeline/fetch_civic.py [--refresh] [--lists-only] [--max-minutes 90]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "civic"
LISTS, RACES = RAW / "lists", RAW / "races"
LOG = RAW / "fetch.log"

BASE = "https://civicapi.org/api/v2"
USER_AGENT = "midterm-2026-analysis/1.0 (personal data analysis)"
ELECTION_DATE = "2026-11-03"
LIMIT = 10000  # hard cap per state, as a truncation guard
PAGE = 1000
PAUSE = 0.7  # seconds between requests
STATES = ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM "
          "NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY").split()


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}"
    with LOG.open("a") as f:
        f.write(line + "\n")


def get_json(url: str, timeout: int = 90) -> dict:
    """Fetch with curl: Python's urllib (HTTP/1.1) kept getting large civicAPI bodies cut off
    mid-transfer, while curl fetched the same URLs whole."""
    out = subprocess.run(["curl", "-sS", "--fail", "-m", str(timeout), "-A", USER_AGENT,
                          "-H", "Accept: application/json", url],
                         capture_output=True, check=True, timeout=timeout + 10)
    return json.loads(out.stdout)


def fetch_with_retry(url: str, what: str, tries: int = 4) -> dict | None:
    for attempt in range(1, tries + 1):
        try:
            return get_json(url)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError) as e:
            log(f"{what} attempt {attempt} failed: {type(e).__name__} {e}"[:300])
            if attempt < tries:
                time.sleep((5, 15, 40)[attempt - 1])
    return None


def fetch_state_pages(st: str) -> list[dict] | None:
    """All of a state's races, PAGE at a time; None if any page fails."""
    races: dict[int, dict] = {}
    offset = 0
    while offset < LIMIT:
        q = urllib.parse.urlencode({"startDate": ELECTION_DATE, "endDate": ELECTION_DATE, "country": "US",
                                    "province": st, "limit": PAGE, "offset": offset})
        body = fetch_with_retry(f"{BASE}/race/search?{q}", f"list {st} offset {offset}")
        time.sleep(PAUSE)
        if body is None:
            return None
        page = body.get("races") or []
        for r in page:
            races[r["id"]] = r
        if len(page) < PAGE:
            break
        offset += PAGE
    return list(races.values())


def detail_priority(r: dict) -> int | None:
    """Lower = fetched first; None = no detail needed."""
    name = (r.get("election_name") or "").lower()
    etype, rtype = r.get("election_type"), r.get("type")
    if etype not in ("General", "Statewide"):
        return None
    if "senate" in name and ("u.s." in name or "us senate" in name or "united states" in name):
        return 0
    if "governor" in name and "lieutenant" not in name and "board" not in name:
        return 0
    if rtype == "House of Representatives" or "us house" in name or "u.s. house" in name:
        return 1
    if rtype == "Referendum":
        return 2
    return 3  # other statewide offices: AG, SoS, courts, ...


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-fetch detail files that already exist")
    ap.add_argument("--lists-only", action="store_true")
    ap.add_argument("--missing-lists", action="store_true", help="fetch only states with no saved list")
    ap.add_argument("--max-minutes", type=float, default=90)
    args = ap.parse_args()
    for d in (LISTS, RACES):
        d.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + args.max_minutes * 60
    log(f"START refresh={args.refresh} lists_only={args.lists_only}")

    # Phase 1: race lists, paged (large single responses were often cut off mid-transfer)
    lists_ok, truncated, wanted = 0, [], []
    for st in STATES:
        out = LISTS / f"{st}.json"
        if args.missing_lists and out.exists():
            races = json.loads(out.read_text())["races"]
        else:
            if time.monotonic() > deadline:
                break
            races = fetch_state_pages(st)
            if races is None:
                continue
            if len(races) >= LIMIT:
                truncated.append(st)
            out.write_text(json.dumps({"races": races, "_fetched_at": datetime.now(timezone.utc).isoformat()}))
            log(f"list {st}: {len(races)} races")
        lists_ok += 1
        for r in races:
            p = detail_priority(r)
            if p is not None:
                wanted.append((p, r["id"]))
    log(f"lists {lists_ok}/{len(STATES)} truncated={truncated} detail_wanted={len(wanted)}")
    if args.lists_only:
        print(f"DONE lists={lists_ok}/{len(STATES)} truncated={truncated}")
        return 0

    # Phase 2: race detail, highest priority first
    wanted.sort()
    got = skipped = failed = 0
    for i, (_, rid) in enumerate(wanted, 1):
        out = RACES / f"{rid}.json"
        if out.exists() and not args.refresh:
            skipped += 1
            continue
        if time.monotonic() > deadline:
            msg = f"STOPPED at deadline lists={lists_ok}/{len(STATES)} details={got} skipped={skipped} failed={failed} remaining={len(wanted) - i + 1}"
            log(msg)
            print(msg)
            return 2
        body = fetch_with_retry(f"{BASE}/race/{rid}", f"race {rid}", tries=3)
        time.sleep(PAUSE)
        if body is None:
            failed += 1
            continue
        body["_fetched_at"] = datetime.now(timezone.utc).isoformat()
        out.write_text(json.dumps(body))
        got += 1
        if got % 50 == 0:
            log(f"heartbeat details={got} skipped={skipped} failed={failed} of {len(wanted)}")
    msg = f"DONE lists={lists_ok}/{len(STATES)} truncated={truncated} details={got} skipped={skipped} failed={failed} wanted={len(wanted)}"
    log(msg)
    print(msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
