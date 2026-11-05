"""Analysis tables from civicAPI results plus the baselines.

Margins are Democratic share minus Republican share of all votes cast in the
race, in percentage points (positive = Democratic lead), for 2026 and 2024
alike. A "shift" is 2026 margin minus 2024 presidential margin. Counts are
unofficial and change as counting finishes; every table carries reporting %.
Run: python pipeline/build_results.py
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import median

import pandas as pd

from common import (BASE, STATE_NAMES, county_index, details, is_rollup, lists, office_of, party_code, ranked,
                    real_candidates, region_fips, share, top_by_party, total_votes, write)

def _fetched_at() -> str:
    """When the newest civicAPI response was downloaded: the counts are as of then, not when this script ran."""
    import json as _json
    from common import CIVIC
    stamps = []
    for f in list((CIVIC / "lists").glob("*.json")) + list((CIVIC / "races").glob("*.json")):
        s = _json.loads(f.read_text()).get("_fetched_at")
        if s:
            stamps.append(s)
    if not stamps:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return max(datetime.fromisoformat(s) for s in stamps).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


AS_OF = _fetched_at()


# ---------- baselines ----------

def county_attrs() -> pd.DataFrame:
    def ers(file, code_col, attrs):
        d = pd.read_csv(BASE / file, encoding="latin-1", low_memory=False)
        d = d[d["Attribute"].isin(attrs)]
        d["fips"] = d[code_col].astype(int).astype(str).str.zfill(5)
        return d.pivot_table(index="fips", columns="Attribute", values="Value", aggfunc="first")
    edu = ers("ers_education.csv", "FIPS Code", ["Percent of adults with a bachelor's degree or higher, 2019-23"])
    inc = ers("ers_income.csv", "FIPS_Code", ["Median_Household_Income_2022", "Rural_Urban_Continuum_Code_2023"])
    pop = ers("ers_population.csv", "FIPStxt", ["POP_ESTIMATE_2023"])
    a = edu.join(inc, how="outer").join(pop, how="outer")
    a.columns = ["bachelors_pct", "median_income", "rucc", "pop"]
    a = a[~a.index.str.endswith("000")]  # drop state and national rows
    return a


def rucc_group(code) -> str | None:
    if pd.isna(code):
        return None
    c = int(code)
    return {1: "Big metro", 2: "Mid-size metro", 3: "Small metro"}.get(c, "Small town" if c <= 7 else "Rural")


def pres24() -> pd.DataFrame:
    p = pd.read_csv(BASE / "pres_county_2024.csv", dtype={"county_fips": str})
    p["fips"] = p["county_fips"].str.zfill(5)
    p["m24"] = ((p["per_dem"] - p["per_gop"]) * 100).round(2)
    return p.set_index("fips")


def pres24_state(p: pd.DataFrame) -> dict[str, float]:
    abbr = {v: k for k, v in STATE_NAMES.items()}
    g = p.groupby("state_name")[["votes_dem", "votes_gop", "total_votes"]].sum()
    return {abbr[s]: round(100 * (r.votes_dem - r.votes_gop) / r.total_votes, 2) for s, r in g.iterrows() if s in abbr}


# ---------- races ----------

def race_summary(r: dict) -> dict:
    cands = real_candidates(r.get("candidates") or [])
    tot = total_votes(cands)
    rk = ranked(cands)
    d, rep = top_by_party(cands, "D"), top_by_party(cands, "R")
    called = next((c for c in cands if c.get("winner")), None)
    lead = rk[0] if rk and (rk[0].get("votes") or 0) > 0 else None
    second = rk[1] if len(rk) > 1 else None
    winner = called or lead
    wp = party_code(winner.get("party")) if winner else None
    gap = share((lead.get("votes") or 0) - ((second.get("votes") or 0) if second else 0), tot) if lead else None
    dr_margin = share(int(d["votes"] or 0) - int(rep["votes"] or 0), tot) if d and rep else None
    # signed margin for ranking seats: D-minus-R where both ran, else the winner's lead signed by party
    signed = dr_margin if dr_margin is not None else (
        None if gap is None or wp not in ("D", "R") else (gap if wp == "D" else -gap))
    return {
        "total": tot, "reporting": r.get("percent_reporting"),
        "dem_name": d["name"] if d else None, "dem_votes": int(d["votes"] or 0) if d else 0,
        "rep_name": rep["name"] if rep else None, "rep_votes": int(rep["votes"] or 0) if rep else 0,
        "dem_pct": share(int(d["votes"] or 0), tot) if d else None,
        "rep_pct": share(int(rep["votes"] or 0), tot) if rep else None,
        "margin": dr_margin, "signed_margin": signed,
        "winner_name": winner["name"] if winner else None, "winner_party": wp,
        "called": bool(called), "lead_gap": gap, "n_cands": len(cands),
        "incumbent_ran": any(c.get("incumbent") for c in r.get("candidates") or []),
        "incumbent_lost": bool(called) and any(c.get("incumbent") and not c.get("winner") for c in cands),
    }


def federal_rows() -> list[dict]:
    det = details()
    rows = []
    for st, races in lists().items():
        for r in races:
            off = office_of(r)
            if not off:
                continue
            full = det.get(r["id"], r)  # detail has incumbent flags and fresher counts
            s = race_summary(full)
            dist = r.get("district") or ""
            m = re.search(r"(\d+)$", dist)
            rows.append({"id": r["id"], "state": st, "state_name": STATE_NAMES.get(st, st), "office": off,
                         "district": int(m.group(1)) if (off == "house" and m) else (0 if off == "house" else None),
                         "race": r["election_name"], "updated": full.get("last_updated"), **s})
    return rows


def by_county(race_id: int) -> dict[str, dict]:
    """Region results summed to counties (towns and townships roll up): fips -> {votes by candidate name, reporting}."""
    det = details().get(race_id) or {}
    st = det.get("province")
    out: dict[str, dict] = {}
    for v in det.get("region_results", {}).values():
        if v.get("type") == "State":
            continue
        f = region_fips(st, v)
        if not f:
            continue
        agg = out.setdefault(f, {"cands": {}, "reporting": []})
        for c in real_candidates(v.get("candidates") or []):
            k = (c.get("name"), party_code(c.get("party")))
            agg["cands"][k] = agg["cands"].get(k, 0) + int(c.get("votes") or 0)
        if v.get("percent_reporting") is not None:
            agg["reporting"].append(v["percent_reporting"])
    return out


def county_results(race_id: int) -> dict[str, dict]:
    names = county_index()[1]
    out = {}
    for f, agg in by_county(race_id).items():
        tot = sum(agg["cands"].values())
        dem = max((v for (n, p), v in agg["cands"].items() if p == "D"), default=None)
        rep = max((v for (n, p), v in agg["cands"].items() if p == "R"), default=None)
        if not tot or dem is None or rep is None:
            continue
        out[f] = {"county": names.get(f, f), "total": tot, "dem": dem, "rep": rep, "m26": share(dem - rep, tot),
                  "reporting": min(agg["reporting"]) if agg["reporting"] else None}
    return out


def pick_top_race(fed: list[dict]) -> dict[str, dict]:
    """Per state: the Senate race if it has both a Democrat and a Republican, else governor."""
    best: dict[str, dict] = {}
    for r in fed:
        if r["office"] not in ("sen", "gov") or r["margin"] is None or r["id"] not in details():
            continue
        cur = best.get(r["state"])
        if cur is None or (r["office"] == "sen" and cur["office"] != "sen"):
            best[r["state"]] = r
    return best


def county_swing(fed, attrs, p24) -> list[dict]:
    rows = []
    for st, race in pick_top_race(fed).items():
        for fips, c in county_results(race["id"]).items():
            if fips not in p24.index:
                continue
            a = attrs.loc[fips] if fips in attrs.index else None
            rows.append({"fips": fips, "state": st, "county": c["county"], "office": race["office"],
                         "votes": c["total"], "m26": c["m26"], "m24": float(p24.at[fips, "m24"]),
                         "shift": round(c["m26"] - float(p24.at[fips, "m24"]), 2), "reporting": c["reporting"],
                         "bachelors_pct": None if a is None or pd.isna(a.bachelors_pct) else float(a.bachelors_pct),
                         "median_income": None if a is None or pd.isna(a.median_income) else int(a.median_income),
                         "area": None if a is None else rucc_group(a.rucc)})
    return rows


def swing_by_type(sw: list[dict]) -> list[dict]:
    df = pd.DataFrame(sw)
    out = []

    def summarize(dim, label, g, order):
        s = g["shift"]
        out.append({"dimension": dim, "group": label, "order": order, "counties": int(len(g)),
                    "median_shift": round(float(s.median()), 2), "p25": round(float(s.quantile(.25)), 2),
                    "p75": round(float(s.quantile(.75)), 2),
                    "weighted_shift": round(float((g["shift"] * g["votes"]).sum() / g["votes"].sum()), 2)})
    for i, area in enumerate(["Big metro", "Mid-size metro", "Small metro", "Small town", "Rural"]):
        g = df[df["area"] == area]
        if len(g):
            summarize("Place", area, g, i)
    for col, dim, fmt in (("bachelors_pct", "Adults with a bachelor's degree", "{:.0f}–{:.0f}%"),
                          ("median_income", "Median household income", "${:,.0f}k–${:,.0f}k")):
        d = df.dropna(subset=[col]).copy()
        d["q"] = pd.qcut(d[col], 5, labels=False)
        for q, g in d.groupby("q"):
            lo, hi = g[col].min(), g[col].max()
            lab = fmt.format(lo / 1000, hi / 1000) if "income" in col else fmt.format(lo, hi)
            summarize(dim, lab, g, int(q))
    return out


def statewide_vs_pres(fed, p24s) -> list[dict]:
    rows = []
    for r in fed:
        if r["office"] in ("sen", "gov") and r["margin"] is not None and r["state"] in p24s:
            rows.append({"id": r["id"], "state": r["state"], "state_name": r["state_name"], "office": r["office"],
                         "race": r["race"], "dem_name": r["dem_name"], "rep_name": r["rep_name"],
                         "margin": r["margin"], "pres24": p24s[r["state"]],
                         "over": round(r["margin"] - p24s[r["state"]], 2), "reporting": r["reporting"],
                         "winner_party": r["winner_party"], "called": r["called"]})
    return sorted(rows, key=lambda x: x["over"])


def headline(fed, suspect: set[str]) -> list[dict]:
    """Seat counts from every race; vote totals leave out states whose raw counts are implausible."""
    rows = []
    note = (f"Vote totals leave out {', '.join(STATE_NAMES[s] for s in sorted(suspect))}: "
            "its raw counts in the source exceed its eligible voters.") if suspect else ""
    for off in ("house", "sen", "gov"):
        rs = [r for r in fed if r["office"] == off]
        c = Counter((r["winner_party"], r["called"]) for r in rs if r["winner_party"])
        counted = [r for r in rs if r["state"] not in suspect]
        dv = sum(r["dem_votes"] for r in counted)
        rv = sum(r["rep_votes"] for r in counted)
        tv = sum(r["total"] for r in counted)
        rows.append({"office": off, "races": len(rs),
                     "dem_won": c[("D", True)], "rep_won": c[("R", True)], "other_won": c[("O", True)],
                     "dem_leading": c[("D", False)], "rep_leading": c[("R", False)], "other_leading": c[("O", False)],
                     "dem_total": c[("D", True)] + c[("D", False)], "rep_total": c[("R", True)] + c[("R", False)],
                     "uncalled": sum(v for (p, called), v in c.items() if not called),
                     "with_results": sum(c.values()),
                     "dem_votes": dv, "rep_votes": rv, "total_votes": tv,
                     "vote_margin": share(dv - rv, tv), "incumbents_lost": sum(r["incumbent_lost"] for r in rs),
                     "vote_note": note, "excluded": sorted(suspect), "as_of": AS_OF})
    return rows


# ---------- turnout ----------

# No state has topped ~80% of eligible voters in a modern midterm; a count above this means the
# source's raw vote counts are inflated (seen for New York on election night), so the state is set aside.
MAX_PLAUSIBLE_TURNOUT = 85.0
SUSPECT_COUNTS: set[str] = set()


def turnout(fed) -> list[dict]:
    def num(x):
        return float(str(x).replace(",", "").replace("%", "")) if pd.notna(x) and str(x).strip() else None
    vep26 = {r.STATE_ABV: num(r.VEP) for r in pd.read_csv(BASE / "uf_turnout_2026.csv").itertuples() if isinstance(r.STATE_ABV, str)}
    t22 = {r.STATE_ABV: num(r.VEP_TURNOUT_RATE) for r in pd.read_csv(BASE / "uf_turnout_2022.csv").itertuples() if isinstance(r.STATE_ABV, str)}
    close = defaultdict(lambda: None)
    for r in fed:
        if r["office"] in ("sen", "gov") and r["margin"] is not None:
            cur = close[r["state"]]
            close[r["state"]] = abs(r["margin"]) if cur is None else min(cur, abs(r["margin"]))
    rows = []
    for st, races in lists().items():
        # only one-vote-per-voter contests: Senate, governor, statewide measures, and all House races together
        # (multi-seat boards and chamber roll-ups count some voters more than once)
        single = []
        for r in races:
            off = office_of(r)
            if off in ("sen", "gov"):
                single.append((total_votes(real_candidates(r.get("candidates"))), r.get("percent_reporting"), r["election_name"]))
            elif r.get("type") == "Referendum" and not r.get("district") and not r.get("municipality"):
                y, n, _ = yes_no(r.get("candidates") or [])
                single.append((y + n, r.get("percent_reporting"), r["election_name"]))
        house = sum(total_votes(real_candidates(r.get("candidates"))) for r in races if office_of(r) == "house")
        best = max(single, default=(0, None, None))
        votes, rep, basis = (best if best[0] >= house else (house, None, "all U.S. House races"))
        vep, prior = vep26.get(st), t22.get(st)
        if not vep or not votes:
            continue
        rate = 100 * votes / vep
        if rate > MAX_PLAUSIBLE_TURNOUT:
            SUSPECT_COUNTS.add(st)
            continue
        rows.append({"state": st, "state_name": STATE_NAMES[st], "votes": votes, "vep": int(vep),
                     "turnout": round(rate, 1), "turnout22": prior,
                     "change": round(rate - prior, 1) if prior else None,
                     "basis": basis, "reporting": rep, "closest_margin": close[st]})
    return rows


# ---------- ballot measures ----------

TOPICS = [
    ("Abortion & reproductive rights", r"abortion|reproductive|pregnan|fetal|unborn"),
    ("Rights & identity", r"\barms\b|\bgun|firearm|\bdei\b|equal rights|discriminat|gender|biological sex|marriage|athletic|speech"),
    ("Housing & land", r"housing|homebuyer|mortgage|\brent\b|zoning|lot size|eminent domain"),
    ("Health", r"health|immun|therap|medicaid|medical|hospital"),
    ("Elections & voting", r"ranked|voter|voting|election|citizen|ballot|primar|redistrict|electoral|vote"),
    ("Taxes & budget", r"\btax|budget|revenue|homestead|property assess|exemption|bond|fund|spending|debt|economic development"),
    ("Wages & labor", r"wage|labor|worker|paid leave|sick leave|union|employ"),
    ("Drugs & alcohol", r"marijuana|cannabis|psilocybin|drug|alcohol|liquor|gambling|casino|sports bet|wager"),
    ("Crime & justice", r"crime|criminal|police|bail|sentenc|prison|cartel|terror|court|judge|justice|pardon"),
    ("Education", r"school|education|teacher|universit|college|student|tuition|instruction"),
    ("Housing & land", r"housing|rent|zoning|land|eminent domain|property right"),
    ("Environment & energy", r"environment|energy|climate|water|wildlife|hunting|fishing|park|conservation|oil|gas|mining"),
    ("Health", r"health|medicaid|medical|insurance|hospital"),
    ("Rights & identity", r"\bdei\b|equal rights|discriminat|gender|sex\b|biological sex|marriage|athletic|speech|gun|firearm"),
    ("Government & officials", r"legislat|governor|term limit|official|salar|ethics|session|veto|appoint|commission|vacanc"),
]

MEASURE_ID = re.compile(r"\b(prop\w*|amendment|question|measure|initiative|issue|referendum|referral)"
                        r"\s+(?:no\.\s*)?([a-z]{1,3}|\d{1,4}[a-z]?)\b", re.I)
MT_CODE = re.compile(r"\b(CI|I|LR|C|IM|LC)-(\d+)\b")  # Montana-style "CI-132", "I-194"
STOP = set("""alaska alabama arizona arkansas california colorado florida georgia hawaii idaho indiana kansas kentucky
louisiana maryland massachusetts michigan minnesota missouri montana nebraska nevada mexico york north carolina
dakota ohio oklahoma oregon rhode island south tennessee utah vermont virginia washington west wisconsin wyoming
amendment measure ballot constitutional initiative proposition question proposal state require requirement
allow establish house joint resolution public""".split())


def measure_key(name: str) -> tuple[str, str] | None:
    m = None
    for m in MEASURE_ID.finditer(name):
        pass  # keep the last match: "Initiative Measure 442" -> ("measure", "442")
    if m:
        return m.group(1).lower(), m.group(2).upper()
    c = MT_CODE.search(name)
    return ("code", c.group(2)) if c else None


def words(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{4,}", s.lower()) if w not in STOP}


def measure_titles() -> dict[tuple[str, str], dict]:
    """(state, id) -> {title, description} from Wikipedia's 2026 ballot measures page (Nov 3 rows only)."""
    import html as _html
    src = (BASE / "wp_ballot_measures_2026.html").read_text(errors="replace")
    abbr = {v: k for k, v in STATE_NAMES.items()}
    out: dict[tuple[str, str], dict] = {}
    parts = re.split(r"<h3[^>]*>(.*?)</h3>", src)
    for i in range(1, len(parts) - 1, 2):
        st = abbr.get(_html.unescape(re.sub(r"<[^>]+>", "", parts[i])).strip())
        if not st:
            continue
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", parts[i + 1], re.S):
            cells = [_html.unescape(re.sub(r"<[^>]+>", "", c)).replace("\xa0", " ").strip()
                     for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
            if len(cells) < 5 or not cells[4].startswith("Nov"):
                continue
            key = measure_key(cells[2])
            title = re.split(r"[,:]", cells[2], maxsplit=1)[1].strip() if re.search(r"[,:]", cells[2]) else cells[2]
            title = re.sub(r"\[\d+\]", "", title)
            desc = re.sub(r"\[\d+\]", "", cells[3])
            out[(st, key[1] if key else f"#{len(out)}")] = {"title": title, "description": desc, "numbered": bool(key)}
    return out


def match_measure(st: str, name: str, titles: dict) -> dict | None:
    """By state and measure number; else by shared distinctive words (only when unambiguous)."""
    key = measure_key(name)
    if key and (st, key[1]) in titles:
        return titles[(st, key[1])]
    mine = words(name)
    if len(mine) < 2:
        return None
    scored = sorted(((len(mine & words(v["title"] + " " + v["description"])), v)
                     for (s, _), v in titles.items() if s == st), key=lambda x: -x[0])
    if scored and scored[0][0] >= 2 and (len(scored) == 1 or scored[1][0] < scored[0][0]):
        return scored[0][1]
    return None


def topic_of(name: str) -> str:
    n = name.lower()
    for t, pat in TOPICS:
        if re.search(pat, n):
            return t
    return "Not described in source"


def threshold(state: str, name: str) -> float:
    n = name.lower()
    if state == "FL" and "amendment" in n:
        return 60.0
    if state == "CO" and "amendment" in n:
        return 55.0
    if state == "NH" and ("constitution" in n or "question" in n):
        return 66.7
    return 50.0


def yes_no(cands: list[dict]) -> tuple[int, int, dict | None]:
    yes = next((c for c in cands if (c.get("name") or "").strip().lower() in ("yes", "for", "approve", "retain")), None)
    no = next((c for c in cands if (c.get("name") or "").strip().lower() in ("no", "against", "reject", "not retain")), None)
    return (int(yes["votes"] or 0) if yes else 0), (int(no["votes"] or 0) if no else 0), yes


def statewide_measures(p24s) -> list[dict]:
    det = details()
    titles = measure_titles()
    rows = []
    for st, races in lists().items():
        for r in races:
            if r.get("district") or r.get("municipality") or r.get("election_type") not in ("Statewide", "General"):
                continue
            full = det.get(r["id"], r)
            y, n, yc = yes_no(full.get("candidates") or [])
            if not (y or n) or yc is None:
                continue
            name = r["election_name"]
            kind = "Judicial retention" if "retention" in name.lower() or "retain" in name.lower() else "Ballot measure"
            yp = share(y, y + n)
            th = threshold(st, name)
            wp = match_measure(st, name, titles)
            # topic from the title first (precise); the longer description only when the title says nothing,
            # since descriptions mention funds and taxes in passing
            topic = topic_of(name + " " + (wp["title"] if wp else ""))
            if topic == "Not described in source" and wp:
                topic = topic_of(wp["description"])
            rows.append({"id": r["id"], "state": st, "state_name": STATE_NAMES[st], "name": name, "kind": kind,
                         "title": wp["title"] if wp else None, "description": wp["description"] if wp else None,
                         "topic": topic if kind == "Ballot measure" else "Judicial retention",
                         "yes_votes": y, "no_votes": n, "yes_pct": yp, "threshold": th,
                         "passed": bool(yp is not None and yp > th),
                         "status": "Passing" if yp is not None and yp > th else "Failing",
                         "reporting": full.get("percent_reporting"),
                         "pres24": p24s.get(st), "has_counties": r["id"] in det})
    return rows


LOCAL_KINDS = [
    ("School funding", r"school|education|college|librar"),
    ("Bonds & borrowing", r"\bbond|borrow|debt"),
    ("Taxes & levies", r"tax|levy|millage|mill\b|assessment|sales"),
    ("Charter & government", r"charter|council|mayor|term|election|recall|ordinance|govern|annex|consolidat"),
    ("Alcohol & cannabis", r"alcohol|liquor|beer|wine|marijuana|cannabis|dispensar"),
    ("Land & zoning", r"zoning|land|park|open space|develop|housing"),
]


def local_measures() -> list[dict]:
    agg: dict[str, Counter] = defaultdict(Counter)
    for st, races in lists().items():
        for r in races:
            if r.get("type") != "Referendum" or r.get("election_type") != "Local":
                continue
            y, n, _ = yes_no(r.get("candidates") or [])
            if not (y + n):
                continue
            name = r["election_name"].lower()
            kind = next((k for k, pat in LOCAL_KINDS if re.search(pat, name)), "Other or not described")
            agg[kind]["measures"] += 1
            agg[kind]["passed" if y > n else "failed"] += 1
    return [{"kind": k, "measures": c["measures"], "passed": c["passed"], "failed": c["failed"],
             "pass_rate": share(c["passed"], c["measures"])} for k, c in sorted(agg.items(), key=lambda x: -x[1]["measures"])]


def measure_counties(m: dict, p24) -> list[dict]:
    names = county_index()[1]
    rows = []
    for f, agg in by_county(m["id"]).items():
        y, n, _ = yes_no([{"name": k[0], "votes": v} for k, v in agg["cands"].items()])
        if y + n and f in p24.index:
            rows.append({"fips": f, "county": names.get(f, f), "yes_pct": share(y, y + n), "votes": y + n,
                         "trump24": round(float(p24.at[f, "per_gop"]) * 100, 1)})
    return rows


# ---------- state and local offices ----------

OFFICE_GROUPS = [
    ("State legislature", {"State House", "State Senate"}),
    ("County offices", {"County Commission", "County Council", "County Board", "County Supervisor", "Sheriff",
                        "County Clerk", "County Attorney", "Coroner", "County Treasurer", "Clerk"}),
    ("Mayor", {"Mayor"}),
    ("City council", {"City Council", "Alderman / City Council Member"}),
    ("School board", {"School Board", "School Board Member"}),
    ("Judges & magistrates", {"Judicial", "Judge", "Magistrate", "Justice of the Peace", "Constable"}),
    ("Township offices", {"Township Trustee", "Township Board", "Township Clerk"}),
    ("Special districts", {"Special District", "Natural Resources District"}),
]


def office_group(t: str | None) -> str | None:
    return next((g for g, ts in OFFICE_GROUPS if t in ts), None)


def local_offices() -> tuple[list[dict], list[dict], list[dict]]:
    stats: dict[str, Counter] = defaultdict(Counter)
    margins: dict[str, list[float]] = defaultdict(list)
    legis: dict[tuple, Counter] = defaultdict(Counter)
    for st, races in lists().items():
        for r in races:
            g = office_group(r.get("type"))
            if not g or is_rollup(r):
                continue
            cands = real_candidates(r.get("candidates") or [])
            seats = max(int(r.get("seats") or 1), 1)
            stats[g]["races"] += 1
            contested = len(cands) > seats
            stats[g]["contested" if contested else "uncontested"] += 1
            tot = total_votes(cands)
            rk = ranked(cands)
            if contested and seats == 1 and tot and (r.get("percent_reporting") or 0) >= 50:
                gap = share((rk[0].get("votes") or 0) - (rk[1].get("votes") or 0), tot)
                margins[g].append(gap)
                stats[g]["close"] += int(gap < 5)
                stats[g]["measured"] += 1
            if r.get("type") in ("State House", "State Senate"):
                winners = [c for c in cands if c.get("winner")] or (rk[:seats] if tot else [])
                key = (st, r["type"])
                for c in winners[:seats]:
                    legis[key][party_code(c.get("party"))] += 1
                legis[key]["seats"] += seats
                legis[key]["called" if any(c.get("winner") for c in cands) else "leading"] += 1
    contest = [{"office": g, "races": c["races"], "uncontested": c["uncontested"],
                "uncontested_pct": share(c["uncontested"], c["races"]),
                "close_pct": share(c["close"], c["measured"]), "measured": c["measured"],
                "median_margin": round(median(margins[g]), 1) if margins[g] else None}
               for g, c in stats.items()]
    contest.sort(key=lambda x: -(x["uncontested_pct"] or 0))
    bins = list(range(0, 105, 5))
    hist = []
    for g, ms in margins.items():
        cnt = Counter(min(int(m // 5) * 5, 95) for m in ms)
        hist += [{"office": g, "bin": b, "races": cnt.get(b, 0)} for b in bins[:-1]]
    leg = [{"state": st, "state_name": STATE_NAMES[st], "chamber": ch, "seats": c["seats"], "dem": c["D"], "rep": c["R"],
            "other": c["O"], "races_called": c["called"], "races_leading": c["leading"]}
           for (st, ch), c in sorted(legis.items())]
    return contest, hist, leg


def main() -> None:
    attrs, p24 = county_attrs(), pres24()
    p24s = pres24_state(p24)
    fed = federal_rows()
    write("races_federal", fed)
    write("turnout_state", turnout(fed))  # also fills SUSPECT_COUNTS
    write("headline", headline(fed, SUSPECT_COUNTS))
    sw = county_swing(fed, attrs, p24)
    write("county_swing", sw)
    write("swing_by_type", swing_by_type(sw) if sw else [])
    write("statewide_vs_pres", statewide_vs_pres(fed, p24s))
    ms = statewide_measures(p24s)
    write("measures_statewide", ms)
    write("measures_local", local_measures())
    contest, hist, leg = local_offices()
    write("office_contest", contest)
    write("office_margins", hist)
    write("state_legislatures", leg)
    feat, rows, r = featured_measure(ms, p24)
    if feat:
        lean = f"{'Harris' if feat['pres24'] > 0 else 'Trump'} carried by {abs(feat['pres24']):.0f} points in 2024"
        follows = "Trump" if r > 0 else "Harris"
        write("measure_featured", [{
            "id": feat["id"], "name": feat["name"], "title": feat["title"], "state": feat["state"],
            "yes_pct": feat["yes_pct"], "pres24": feat["pres24"], "county_corr": round(r, 2),
            "summary": f"{feat['title']}. Passing with {feat['yes_pct']:.1f}% Yes in a state {lean}, "
                       f"though its support across counties tracks the {follows} vote "
                       f"(correlation {r:+.2f} with Trump's 2024 share)."}])
        write("measure_counties", rows)


def featured_measure(ms, p24) -> tuple[dict | None, list[dict], float]:
    """A passing measure that crossed party lines: its county support follows the party that lost the
    state in 2024 (|correlation with Trump share| >= 0.5, at least 8 counties, a known title).
    Among those, the one in the most lopsided state."""
    import numpy as np
    best = None
    for m in ms:
        if m["kind"] != "Ballot measure" or not m["passed"] or not m["title"] or m["pres24"] is None:
            continue
        rows = measure_counties(m, p24)
        if len(rows) < 8:
            continue
        r = float(np.corrcoef([x["trump24"] for x in rows], [x["yes_pct"] for x in rows])[0, 1])
        crossed = (m["pres24"] < 0 and r <= -0.5) or (m["pres24"] > 0 and r >= 0.5)
        if crossed and (best is None or abs(m["pres24"]) > abs(best[0]["pres24"])):
            best = (m, rows, r)
    return best if best else (None, [], 0.0)


if __name__ == "__main__":
    main()
