"""Build data/midterms.duckdb: the read-only database the chat agents query.

Tables are built from civicAPI lists and the processed analysis tables. Two metadata tables travel inside
the file so the agents' schema prompt always matches the data it describes:
  meta_columns(table_name, column_name, data_type, description)
  meta_notes(note)  - caveats the verifier must respect
Run after build_results.py:  python pipeline/build_db.py
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import duckdb
import pandas as pd

from build_results import AS_OF, office_group
from common import (BASE, OUT, ROOT, STATE_FIPS, STATE_NAMES, is_rollup, lists, office_of, party_code, ranked,
                    real_candidates, share, total_votes)

DB = ROOT / "data" / "midterms.duckdb"
OFFICE_NAMES = {"house": "U.S. House", "sen": "U.S. Senate", "gov": "Governor"}

TABLES: dict[str, tuple[str, dict[str, str]]] = {
    "races": ("Every 2026 general-election race at every level (federal, statewide, legislative, local). One row per race.", {
        "race_id": "civicAPI race id; joins candidates.race_id",
        "state": "two-letter state code",
        "name": "race name as published, e.g. 'Ohio US Senate Special General', 'Austin City Council District 3'",
        "level": "'federal' (House, Senate), 'governor', 'state' (other statewide offices and legislature), 'local', or 'measure'",
        "office": "office category: U.S. House, U.S. Senate, Governor, State legislature, County offices, Mayor, City council, "
                  "School board, Judges & magistrates, Township offices, Special districts, Ballot question, Other offices",
        "place": "municipality or district label when the source gives one",
        "district": "district number for U.S. House races, else null",
        "seats": "number of seats elected in the race",
        "n_candidates": "candidates on the ballot, excluding write-in lines",
        "contested": "true when more candidates ran than there were seats",
        "total_votes": "votes counted so far for all candidates",
        "reporting_pct": "percent of precincts reporting per the source; mail states can show 100 while ballots remain",
        "called": "true when the source has marked a winner (rare below federal level)",
        "leader_name": "candidate currently ahead (or called winner)",
        "leader_party": "D, R or O (other / nonpartisan) for the leader",
        "leader_pct": "leader's share of votes counted, percent",
        "runner_up_name": "second-place candidate",
        "runner_up_pct": "runner-up share, percent",
        "lead_margin": "leader_pct minus runner_up_pct, points; null when uncontested",
    }),
    "candidates": ("Every candidate in every race.", {
        "race_id": "joins races.race_id",
        "name": "candidate name; for ballot questions 'Yes' or 'No'",
        "party": "party label as published",
        "party_code": "D, R or O",
        "votes": "votes counted so far",
        "pct": "share of the race's votes, percent",
        "winner": "true when the source marks this candidate as the winner",
    }),
    "federal_races": ("House, Senate and governor races with Democrat/Republican detail. One row per race.", {
        "race_id": "joins races.race_id", "state": "state code", "state_name": "state name",
        "office": "'U.S. House', 'U.S. Senate' or 'Governor'", "district": "House district number (0 = at-large), null otherwise",
        "dem_name": "top Democrat", "dem_votes": "Democrat's votes", "dem_pct": "Democrat's share, percent",
        "rep_name": "top Republican", "rep_votes": "Republican's votes", "rep_pct": "Republican's share, percent",
        "margin": "dem_pct minus rep_pct in points (positive = Democratic lead); null if one party absent",
        "signed_margin": "margin, or the winner's lead signed by party when one major party is absent",
        "winner_name": "called winner or current leader", "winner_party": "D, R or O",
        "called": "true when the source called the race", "total_votes": "all votes counted", "reporting_pct": "percent reporting",
    }),
    "county_shift": ("Each county's top 2026 statewide race (Senate if both parties ran, else governor) vs the 2024 presidential vote.", {
        "fips": "5-digit county FIPS; joins county_traits.fips", "state": "state code", "county": "county name",
        "office": "'sen' or 'gov': which race was compared", "votes": "2026 votes counted in the county",
        "m26": "2026 margin, D minus R, points", "m24": "2024 presidential margin, D minus R, points",
        "shift": "m26 minus m24 (positive = moved toward Democrats)", "reporting_pct": "lowest percent reporting among the county's units",
        "bachelors_pct": "adults 25+ with a bachelor's degree, percent (ACS 2019-23)", "median_income": "median household income 2022, dollars",
        "area": "Big metro, Mid-size metro, Small metro, Small town or Rural (USDA rural-urban code)",
    }),
    "county_traits": ("Every county's demographics and presidential results (no 2026 data).", {
        "fips": "5-digit county FIPS", "state": "state code", "county": "county name",
        "population": "2023 population estimate", "bachelors_pct": "adults with a bachelor's degree, percent",
        "median_income": "median household income 2022, dollars", "rucc": "USDA rural-urban continuum code 2023, 1 (big metro) to 9 (most rural)",
        "area": "rucc grouped: Big metro, Mid-size metro, Small metro, Small town, Rural",
        "pres24_margin": "2024 presidential margin, D minus R, points", "pres24_votes": "2024 presidential votes",
        "pres20_margin": "2020 presidential margin, D minus R, points",
    }),
    "measures": ("Statewide ballot measures and judicial retention votes.", {
        "measure_id": "joins races.race_id", "state": "state code", "state_name": "state name", "name": "measure name as published",
        "kind": "'Ballot measure' or 'Judicial retention'", "title": "short title from Wikipedia when matched",
        "description": "what a Yes vote does (Wikipedia), when matched", "topic": "topic category; 'Not described in source' when unknown",
        "yes_votes": "Yes votes", "no_votes": "No votes", "yes_pct": "Yes share, percent",
        "threshold": "Yes share needed to pass, percent", "passing": "true when yes_pct is above threshold",
        "reporting_pct": "percent reporting", "pres24_state_margin": "the state's 2024 presidential margin, D minus R",
    }),
    "turnout": ("Turnout by state: votes in the largest one-vote race over citizens eligible to vote.", {
        "state": "state code", "state_name": "state name", "votes": "votes in the largest race so far",
        "eligible_voters": "voting-eligible population (UF Election Lab)", "turnout_pct": "2026 turnout so far, percent",
        "turnout_2022_pct": "2022 turnout, percent (total ballots)", "change_pts": "turnout_pct minus turnout_2022_pct",
        "basis": "which race supplied the vote count", "closest_statewide_margin": "smallest |margin| among Senate/governor races",
    }),
    "state_legislatures": ("State legislative seats on the 2026 ballot won or leading, per chamber.", {
        "state": "state code", "state_name": "state name", "chamber": "'State House' or 'State Senate'",
        "seats": "seats on the ballot", "dem": "Democrats won or leading", "rep": "Republicans won or leading",
        "other": "others / nonpartisan", "races_called": "races with a called winner", "races_leading": "races with only a leader",
    }),
    "exit_poll_groups": ("NBC News national exit polls by voter group: 2022 House, 2024 president, 2026 House.", {
        "year": "2022, 2024 or 2026", "contest": "'House' (2022, 2026) or 'President' (2024)",
        "category": "Gender, Age, Race, Education, Party and ideology, Income, All voters", "voter_group": "e.g. 'Women', '18–29'",
        "share_pct": "group's share of voters, percent (null for Black/Hispanic)", "dem_pct": "Democratic vote share in the group, percent",
        "rep_pct": "Republican vote share, percent", "margin": "dem_pct minus rep_pct, points",
    }),
    "exit_poll_answers": ("NBC News exit poll questions: 2026 vote by 2024 vote, top issue, Trump approval, and age mix 2022/2026.", {
        "question": "'2024 presidential vote', 'Most important issue', 'Trump job approval' or 'Age'",
        "year": "survey year", "answer": "answer option", "share_pct": "share of voters giving this answer, percent",
        "dem_pct": "Democratic House vote among them, percent", "rep_pct": "Republican House vote among them, percent",
        "margin": "dem_pct minus rep_pct, points",
    }),
    "states": ("One row per state.", {
        "state": "state code", "state_name": "state name", "fips": "2-digit state FIPS",
        "pres24_margin": "2024 presidential margin, D minus R, points", "house_seats": "U.S. House seats",
        "has_senate_race": "Senate race in 2026", "has_governor_race": "governor race in 2026",
        "turnout_pct": "2026 turnout so far (null if not reliable)",
    }),
}

NOTES = [
    "All 2026 counts are unofficial and still changing; say so when a figure depends on uncounted ballots.",
    "New York's raw vote counts in the source are about three times too high; its shares and margins are usable, its vote totals are not.",
    "Mail-voting states (California, Washington, Oregon, Utah) report 100% of precincts while ballots are still being counted.",
    "Alaska has no county comparison (its 2024 results are by legislative district).",
    "Below the federal level the source rarely marks winners; 'leader' means currently ahead, not elected.",
    "Most city, school and judicial races are nonpartisan (party_code 'O'); party analysis is meaningful for federal, governor, legislative and most county races.",
    "Several states redrew congressional districts after 2024, so district-to-district comparisons with 2024 are not valid; compare counties instead.",
    "Exit polls: 2024 measured the presidential vote, 2022 and 2026 the House vote; small differences are within the noise.",
    "Margins are Democratic share minus Republican share of all votes, in percentage points.",
]


def load(name: str):
    return json.loads((OUT / f"{name}.json").read_text())


def races_and_candidates() -> tuple[pd.DataFrame, pd.DataFrame]:
    races, cands = [], []
    for st, rs in lists().items():
        for r in rs:
            if is_rollup(r):
                continue
            off = office_of(r)
            cs = real_candidates(r.get("candidates") or [])
            rk = ranked(cs)
            tot = total_votes(cs)
            seats = max(int(r.get("seats") or 1), 1)
            if off:
                level, office = ("governor" if off == "gov" else "federal"), OFFICE_NAMES[off]
            elif r.get("type") == "Referendum":
                level, office = "measure", "Ballot question"
            else:
                g = office_group(r.get("type")) or "Other offices"
                level = "state" if (g == "State legislature" or (not r.get("municipality") and r.get("election_type") == "Statewide")) else "local"
                office = g
            lead = rk[0] if rk else None
            second = rk[1] if len(rk) > 1 else None
            lp = share(int(lead.get("votes") or 0), tot) if lead else None
            sp = share(int(second.get("votes") or 0), tot) if second else None
            races.append({
                "race_id": r["id"], "state": st, "name": r["election_name"], "level": level, "office": office,
                "place": r.get("municipality") or r.get("district") or None,
                "district": int(str(r.get("district")).split("-")[-1]) if off == "house" and str(r.get("district") or "").split("-")[-1].isdigit() else None,
                "seats": seats, "n_candidates": len(cs), "contested": len(cs) > seats, "total_votes": tot,
                "reporting_pct": r.get("percent_reporting"), "called": any(c.get("winner") for c in cs),
                "leader_name": lead.get("name") if lead else None, "leader_party": party_code(lead.get("party")) if lead else None,
                "leader_pct": lp, "runner_up_name": second.get("name") if second else None, "runner_up_pct": sp,
                "lead_margin": round(lp - sp, 2) if lp is not None and sp is not None and len(cs) > seats else None,
            })
            for c in cs:
                v = int(c.get("votes") or 0)
                cands.append({"race_id": r["id"], "name": c.get("name"), "party": c.get("party"), "party_code": party_code(c.get("party")),
                              "votes": v, "pct": share(v, tot), "winner": bool(c.get("winner"))})
    return pd.DataFrame(races), pd.DataFrame(cands)


def county_traits() -> pd.DataFrame:
    from build_results import county_attrs, pres24, rucc_group
    a = county_attrs()
    p24 = pres24()
    p20 = pd.read_csv(BASE / "pres_county_2020.csv", dtype={"county_fips": str})
    p20["fips"] = p20["county_fips"].str.zfill(5)
    p20 = p20.set_index("fips")
    abbr = {v: k for k, v in STATE_NAMES.items()}
    rows = []
    for fips, r in p24.iterrows():
        t = a.loc[fips] if fips in a.index else None
        rows.append({
            "fips": fips, "state": abbr.get(r["state_name"]), "county": r["county_name"],
            "population": None if t is None or pd.isna(t["pop"]) else int(t["pop"]),
            "bachelors_pct": None if t is None or pd.isna(t["bachelors_pct"]) else float(t["bachelors_pct"]),
            "median_income": None if t is None or pd.isna(t["median_income"]) else int(t["median_income"]),
            "rucc": None if t is None or pd.isna(t["rucc"]) else int(t["rucc"]),
            "area": None if t is None else rucc_group(t["rucc"]),
            "pres24_margin": float(r["m24"]), "pres24_votes": int(r["total_votes"]),
            "pres20_margin": round(float((p20.at[fips, "per_dem"] - p20.at[fips, "per_gop"]) * 100), 2) if fips in p20.index else None,
        })
    return pd.DataFrame(rows)


def main() -> None:
    races, cands = races_and_candidates()
    fed = pd.DataFrame(load("races_federal"))
    fed = pd.DataFrame({
        "race_id": fed["id"], "state": fed["state"], "state_name": fed["state_name"], "office": fed["office"].map(OFFICE_NAMES),
        "district": fed["district"], "dem_name": fed["dem_name"], "dem_votes": fed["dem_votes"], "dem_pct": fed["dem_pct"],
        "rep_name": fed["rep_name"], "rep_votes": fed["rep_votes"], "rep_pct": fed["rep_pct"], "margin": fed["margin"],
        "signed_margin": fed["signed_margin"], "winner_name": fed["winner_name"], "winner_party": fed["winner_party"],
        "called": fed["called"], "total_votes": fed["total"], "reporting_pct": fed["reporting"],
    })
    sw = pd.DataFrame(load("county_swing")).rename(columns={"reporting": "reporting_pct"})
    ms = pd.DataFrame(load("measures_statewide"))
    ms = pd.DataFrame({
        "measure_id": ms["id"], "state": ms["state"], "state_name": ms["state_name"], "name": ms["name"], "kind": ms["kind"],
        "title": ms["title"], "description": ms["description"], "topic": ms["topic"], "yes_votes": ms["yes_votes"],
        "no_votes": ms["no_votes"], "yes_pct": ms["yes_pct"], "threshold": ms["threshold"], "passing": ms["passed"],
        "reporting_pct": ms["reporting"], "pres24_state_margin": ms["pres24"],
    })
    t = pd.DataFrame(load("turnout_state"))
    t = pd.DataFrame({
        "state": t["state"], "state_name": t["state_name"], "votes": t["votes"], "eligible_voters": t["vep"],
        "turnout_pct": t["turnout"], "turnout_2022_pct": t["turnout22"], "change_pts": t["change"], "basis": t["basis"],
        "closest_statewide_margin": t["closest_margin"],
    })
    leg = pd.DataFrame(load("state_legislatures"))
    ex = pd.DataFrame(load("exit_shift")).rename(columns={"group": "voter_group", "share": "share_pct", "dem": "dem_pct", "rep": "rep_pct"})
    ex = ex[["year", "contest", "category", "voter_group", "share_pct", "dem_pct", "rep_pct", "margin"]]
    answers = []
    for q, f, year in (("2024 presidential vote", "exit_flow", 2026), ("Most important issue", "exit_issue", 2026),
                       ("Trump job approval", "exit_approval", 2026), ("Age", "exit_age_mix", None)):
        for a in load(f):
            answers.append({"question": q, "year": a.get("year", year), "answer": a["answer"], "share_pct": a["share"],
                            "dem_pct": a["dem"], "rep_pct": a["rep"], "margin": a["margin"]})
    traits = county_traits()
    p24s = traits.groupby("state").apply(lambda g: round(float((g["pres24_margin"] * g["pres24_votes"]).sum() / g["pres24_votes"].sum()), 2),
                                         include_groups=False)
    turn = {r["state"]: r["turnout_pct"] for _, r in t.iterrows()}
    states = pd.DataFrame([{
        "state": st, "state_name": STATE_NAMES[st], "fips": STATE_FIPS[st], "pres24_margin": p24s.get(st),
        "house_seats": int((fed["state"] == st).where(fed["office"] == "U.S. House", False).sum()),
        "has_senate_race": bool(((fed["state"] == st) & (fed["office"] == "U.S. Senate")).any()),
        "has_governor_race": bool(((fed["state"] == st) & (fed["office"] == "Governor")).any()),
        "turnout_pct": turn.get(st),
    } for st in sorted(STATE_NAMES)])

    frames = {"races": races, "candidates": cands, "federal_races": fed, "county_shift": sw, "county_traits": traits, "measures": ms,
              "turnout": t, "state_legislatures": leg, "exit_poll_groups": ex,
              "exit_poll_answers": pd.DataFrame(answers), "states": states}

    tmp = DB.with_suffix(".duckdb.tmp")
    if tmp.exists():
        tmp.unlink()
    con = duckdb.connect(str(tmp))
    meta = []
    for name, df in frames.items():
        desc, cols = TABLES[name]
        df = df[[c for c in cols if c in df.columns]]  # documented columns only, in documented order
        missing = [c for c in cols if c not in df.columns]
        if missing:
            raise SystemExit(f"{name}: documented columns missing from data: {missing}")
        con.register("df", df)
        con.execute(f'CREATE TABLE "{name}" AS SELECT * FROM df')
        con.unregister("df")
        types = dict(con.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{name}'").fetchall())
        meta.append({"table_name": name, "column_name": "", "data_type": "", "description": desc})
        meta += [{"table_name": name, "column_name": c, "data_type": types[c], "description": d} for c, d in cols.items()]
    con.register("m", pd.DataFrame(meta))
    con.execute("CREATE TABLE meta_columns AS SELECT * FROM m")
    con.register("n", pd.DataFrame({"note": NOTES}))
    con.execute("CREATE TABLE meta_notes AS SELECT * FROM n")
    con.execute("CREATE TABLE meta_build AS SELECT ? AS data_as_of, ? AS built_at",
                [AS_OF, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")])
    counts = {n: con.execute(f'SELECT count(*) FROM "{n}"').fetchone()[0] for n in frames}
    con.close()
    os.replace(tmp, DB)  # atomic swap: readers never see a half-built file
    print(f"built {DB} ({DB.stat().st_size / 1e6:.1f} MB): " + ", ".join(f"{k} {v:,}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
