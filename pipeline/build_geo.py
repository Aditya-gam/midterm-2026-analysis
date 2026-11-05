"""Turn us-atlas' pre-projected county TopoJSON into SVG path strings.

Input: data/raw/baselines/counties-albers-10m.json (us-atlas 3.0.1, Albers USA, 975x610 frame)
Output: data/processed/geo_counties.json  [{fips, d}]
        data/processed/geo_states.json    [{fips, d}]
The dashboard's d3 has no geo projections, so the page draws these paths as-is.
Arcs are decoded and thinned once (points closer than TOL px dropped), so
neighbouring shapes keep sharing identical edges.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "baselines" / "counties-albers-10m.json"
OUT = ROOT / "data" / "processed"
TOL = 0.5  # px in the 975x610 frame


def decode_arcs(topo: dict) -> list[list[tuple[float, float]]]:
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(thin(pts))
    return arcs


def thin(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(pts) <= 2:
        return pts
    out = [pts[0]]
    for p in pts[1:-1]:
        q = out[-1]
        if abs(p[0] - q[0]) + abs(p[1] - q[1]) >= TOL:
            out.append(p)
    out.append(pts[-1])
    return out


def ring_points(ring: list[int], arcs) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in ring:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(a if not pts else a[1:])
    return pts


def path_d(geom: dict, arcs) -> str:
    polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]] if geom["type"] == "Polygon" else []
    parts = []
    for poly in polys:
        for ring in poly:
            pts = ring_points(ring, arcs)
            if len(pts) < 3:
                continue
            parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
    return "".join(parts)


def main() -> None:
    topo = json.loads(SRC.read_text())
    arcs = decode_arcs(topo)
    OUT.mkdir(parents=True, exist_ok=True)
    for obj, name in (("counties", "geo_counties.json"), ("states", "geo_states.json")):
        rows = [{"fips": g["id"], "name": g.get("properties", {}).get("name", ""), "d": path_d(g, arcs)}
                for g in topo["objects"][obj]["geometries"]]
        rows = [r for r in rows if r["d"]]
        (OUT / name).write_text(json.dumps(rows, separators=(",", ":")))
        print(f"{name}: {len(rows)} shapes, {(OUT / name).stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
