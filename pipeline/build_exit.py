"""Exit-poll tables from NBC News' national exit polls (2022 House, 2024 president, 2026 House).

Reads data/raw/exit/nbc_national_<year>.json (written by fetch_baselines.py) and writes:
  exit_shift.json      Democratic margin by voter group, per year (2024 = Harris vs Trump)
  exit_flow.json       2026 House vote by 2024 presidential vote
  exit_issue.json      2026 most important issue: share of voters and vote
  exit_approval.json   2026 Trump job approval: share and vote
  exit_age_mix.json    share of the electorate by age, 2022 vs 2026
Numbers are NBC's published percentages; nothing is re-weighted here.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "exit"
OUT = ROOT / "data" / "processed"
YEARS = (2022, 2024, 2026)
CONTEST = {2022: "House", 2024: "President", 2026: "House"}


def load(year: int) -> dict:
    return json.loads((RAW / f"nbc_national_{year}.json").read_text())


def questions(group: dict) -> list[dict]:
    return group["polls"]["polls"]


def pct(s: str) -> float:
    return float(str(s).strip().rstrip("%"))


def find_answer(qs, question_prefix: str, match) -> dict | None:
    """First answer, in questions starting with question_prefix, whose label satisfies match()."""
    for q in qs:
        if q["question"].strip().lower().startswith(question_prefix.lower()):
            for a in q["answers"]:
                if match(a["label"].strip().lower()):
                    return a
    return None


def dr(a: dict) -> tuple[float, float]:
    v = [x["value"] for x in a["values"]]
    return float(v[0]), float(v[1])


def group_vote(group: dict) -> tuple[float, float] | None:
    """A whole group's D/R vote: the share-weighted average over the Gender question's answers."""
    for q in questions(group):
        if q["question"] == "Gender":
            tot = d = r = 0.0
            for a in q["answers"]:
                w = pct(a["percent"])
                ad, ar = dr(a)
                tot, d, r = tot + w, d + w * ad, r + w * ar
            return (round(d / tot, 1), round(r / tot, 1)) if tot else None
    return None


# (category, group label, question prefix, label matcher); None question = whole subgroup tab
def L(*words, without=()):
    return lambda s: all(w in s for w in words) and not any(w in s for w in without)


GROUPS = [
    ("All voters", "All voters", "Gender", None),
    ("Gender", "Men", "Gender", lambda s: s in ("male", "men")),
    ("Gender", "Women", "Gender", lambda s: s in ("female", "women")),
    ("Age", "18–29", "Age", lambda s: s == "18-29"),
    ("Age", "30–44", "Age", lambda s: s == "30-44"),
    ("Age", "45–64", "Age", lambda s: s == "45-64"),
    ("Age", "65 and over", "Age", lambda s: s == "65 or over"),
    ("Race", "White", "Race", lambda s: s in ("white", "white voters")),
    ("Race", "Black", "tab", ("black", "blacks", "black voters")),
    ("Race", "Hispanic/Latino", "tab", ("latino", "hispanics", "hispanic voters")),
    # labels: "White college graduates" / "White non-college graduates" (2022, 2024),
    # "White voters, college graduates" / "White voters, no college degree" (2026)
    ("Education", "White, college degree",
     "Education by race", lambda s: s.startswith("white") and "college grad" in s and "non-college" not in s),
    ("Education", "White, no degree",
     "Education by race", lambda s: s.startswith("white") and ("non-college" in s or "no college" in s)),
    ("Party and ideology", "Independents", "No matter how you voted today", L("independent")),
    ("Party and ideology", "Moderates", "On most political matters", L("moderate")),
    ("Income", "Under $50,000", "Income", lambda s: s == "under $50,000"),
    ("Income", "$100,000 or more", "Income", lambda s: s == "$100,000 or more"),
]


def build_shift() -> list[dict]:
    rows = []
    for year in YEARS:
        polls = load(year)["groups"]
        allq = questions(polls[0])
        for order, (cat, label, qp, m) in enumerate(GROUPS):
            share = d = r = None
            if m is None:  # all voters
                v = group_vote(polls[0])
                if v:
                    d, r = v
                    share = 100.0
            elif qp == "tab":
                tab = next((g for g in polls if g["title"].strip().lower() in m), None)
                v = group_vote(tab) if tab else None
                if v:
                    d, r = v
            else:
                a = find_answer(allq, qp, m)
                if a:
                    share = pct(a["percent"])
                    d, r = dr(a)
            if d is None or r is None:
                continue
            rows.append({"category": cat, "group": label, "order": order, "year": year,
                         "contest": CONTEST[year], "share": share, "dem": d, "rep": r,
                         "margin": round(d - r, 1)})
    return rows


def answers_of(year: int, prefix: str) -> list[dict]:
    allq = questions(load(year)["groups"][0])
    q = next(q for q in allq if q["question"].lower().startswith(prefix.lower()))
    out = []
    for i, a in enumerate(q["answers"]):
        d, r = dr(a)
        out.append({"answer": a["label"].strip(), "order": i, "share": pct(a["percent"]), "dem": d, "rep": r,
                    "margin": round(d - r, 1)})
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tables = {
        "exit_shift": build_shift(),
        "exit_flow": answers_of(2026, "In the 2024 election for president"),
        "exit_issue": answers_of(2026, "Which ONE of these six issues"),
        "exit_approval": [a for a in answers_of(2026, "Overall, do you approve or disapprove of the way Donald Trump")
                          if a["answer"].lower() not in ("approve", "disapprove")],
        "exit_age_mix": [dict(a, year=y) for y in (2022, 2026) for a in answers_of(y, "Age")
                         if a["answer"] in ("18-29", "30-44", "45-64", "65 or over")],
    }
    for name, rows in tables.items():
        (OUT / f"{name}.json").write_text(json.dumps(rows, indent=0))
        print(f"{name}: {len(rows)} rows")


if __name__ == "__main__":
    main()
