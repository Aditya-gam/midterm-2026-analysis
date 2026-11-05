"""Export the analysis tables for the website (web/public/data).

Copies data/processed/*.json and adds:
  states.json            one row per state for the state index and state pages
  local/<ST>.json        every state and local race in a state, compact, loaded on demand by the state page
  office_by_state.json   contested/uncontested/close counts per state and office group
  margins_by_state.json  winning-margin histogram (5-point bins) per state and office group
Run after build_results.py:  python pipeline/export_web.py
"""
from __future__ import annotations

import json
import shutil
from collections import Counter, defaultdict

from build_results import office_group
from common import (OUT, ROOT, STATE_FIPS, STATE_NAMES, is_rollup, lists, office_of, party_code, ranked, real_candidates, share,
                    total_votes)

WEB = ROOT / "web" / "public" / "data"


def dump(path, rows) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, separators=(",", ":")))


def main() -> None:
    WEB.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.json"):
        shutil.copy2(f, WEB / f.name)

    office_rows: Counter = Counter()
    margin_rows: Counter = Counter()
    states = []
    turnout = {r["state"]: r for r in json.loads((OUT / "turnout_state.json").read_text())}
    fed = json.loads((OUT / "races_federal.json").read_text())
    for st, races in sorted(lists().items()):
        local = []
        for r in races:
            if office_of(r) or is_rollup(r):
                continue  # federal and governor races live in races_federal.json; chamber roll-ups are not races
            cands = real_candidates(r.get("candidates") or [])
            tot = total_votes(cands)
            seats = max(int(r.get("seats") or 1), 1)
            group = "Ballot question" if r.get("type") == "Referendum" else (office_group(r.get("type")) or "Other offices")
            local.append({
                "id": r["id"], "name": r["election_name"], "type": r.get("type"), "group": group,
                "place": r.get("municipality") or r.get("district") or "", "reporting": r.get("percent_reporting"),
                "seats": seats, "total": tot,
                "cands": [[c.get("name"), party_code(c.get("party")), int(c.get("votes") or 0), share(int(c.get("votes") or 0), tot),
                           bool(c.get("winner"))] for c in ranked(cands)[:8]],
            })
            if group == "Ballot question":
                continue
            office_rows[(st, group, "races")] += 1
            contested = len(cands) > seats
            office_rows[(st, group, "contested" if contested else "uncontested")] += 1
            rk = ranked(cands)
            if contested and seats == 1 and tot and (r.get("percent_reporting") or 0) >= 50:
                gap = share((rk[0].get("votes") or 0) - (rk[1].get("votes") or 0), tot) or 0.0
                office_rows[(st, group, "measured")] += 1
                office_rows[(st, group, "close")] += int(gap < 5)
                margin_rows[(st, group, min(int(gap // 5) * 5, 95))] += 1
        dump(WEB / "local" / f"{st}.json", local)
        t = turnout.get(st)
        states.append({
            "state": st, "name": STATE_NAMES[st], "fips": STATE_FIPS[st], "local_races": len(local),
            "federal_races": sum(1 for x in fed if x["state"] == st),
            "house_seats": sum(1 for x in fed if x["state"] == st and x["office"] == "house"),
            "has_sen": any(x["state"] == st and x["office"] == "sen" for x in fed),
            "has_gov": any(x["state"] == st and x["office"] == "gov" for x in fed),
            "turnout": t["turnout"] if t else None,
        })

    keys = defaultdict(dict)
    for (st, group, k), v in office_rows.items():
        keys[(st, group)][k] = v
    dump(WEB / "office_by_state.json", [
        {"state": st, "office": g, "races": d.get("races", 0), "uncontested": d.get("uncontested", 0),
         "measured": d.get("measured", 0), "close": d.get("close", 0)} for (st, g), d in sorted(keys.items())])
    dump(WEB / "margins_by_state.json", [{"state": st, "office": g, "bin": b, "races": n}
                                         for (st, g, b), n in sorted(margin_rows.items())])
    dump(WEB / "states.json", states)
    size = sum(f.stat().st_size for f in WEB.rglob("*.json"))
    print(f"exported {len(list(WEB.rglob('*.json')))} files, {size / 1e6:.1f} MB to {WEB}")


if __name__ == "__main__":
    main()
