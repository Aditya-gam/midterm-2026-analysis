"""Turn the chart designer's small, validated spec into something the browser can draw.

The model never writes Vega-Lite directly: it picks a chart type and names result columns, and this module builds
the spec in the site's colors. That keeps every chart on-brand and means a bad column name is caught here, not as a
blank chart in the browser. Maps are not Vega-Lite: they go to the site's own county and state-tile components.
"""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Site tokens (web/src/app/globals.css)
FG, MUTED, DIM, LINE, LINE2 = "#d9e0e3", "#8b969c", "#58636a", "#222a2e", "#303a40"
ACCENT, AMBER, DEM, REP, OTH, NEUTRAL = "#34e0a1", "#f2b84b", "#4d8eff", "#ff5d61", "#b48cff", "#2fb9a0"
DIVERGING = ["#ffabae", "#ff5d61", "#8a2c31", "#2c3337", "#1f4a90", "#4d8eff", "#a9c8ff"]  # R extreme -> D extreme
CATEGORICAL = [ACCENT, AMBER, OTH, "#5ec8f2", "#e07ad6", "#9fd36a", "#f28b4b", MUTED]
MONO = "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"

ChartType = Literal[
    "bar", "grouped_bar", "stacked_bar", "line", "scatter", "histogram", "strip", "boxplot", "heatmap",
    "county_map", "state_map", "table",
]


class ChartSpec(BaseModel):
    """What the chart designer returns. Every column field must name a column of the query result."""

    model_config = ConfigDict(extra="forbid")
    type: ChartType
    title: str = Field(description="Short headline that states the finding, not the chart type.")
    subtitle: str | None = Field(default=None, description="Units, filters, and what the colors mean.")
    x: str | None = Field(default=None, description="Column for the x axis (bars: the category; maps: unused).")
    y: str | None = Field(default=None, description="Column for the y axis (bars: the value; maps: the value).")
    color: str | None = Field(default=None, description="Column for color (series, party, or a margin).")
    size: str | None = Field(default=None, description="Column for point size (scatter only).")
    label: str | None = Field(default=None, description="Column for tooltips' first line and scatter labels.")
    geo: str | None = Field(default=None, description="county_map: 5-digit FIPS column; state_map: 2-letter state column.")
    color_scheme: Literal["auto", "margin", "party", "sequential", "categorical"] = "auto"
    value_format: Literal["number", "percent", "margin", "votes"] = "number"
    sort: Literal["desc", "asc", "none"] = "desc"
    horizontal: bool = Field(default=True, description="Bars: horizontal when categories are names.")
    x_title: str | None = None
    y_title: str | None = None


class ChartError(ValueError):
    """The spec does not fit the data; the message is safe to show the model."""


def _field(name: str) -> str:
    # Vega-Lite reads dots and brackets in a field name as nested access
    return name.replace("\\", "\\\\").replace(".", "\\.").replace("[", "\\[").replace("]", "\\]")


def _is_numeric(rows: list[list], i: int) -> bool:
    vals = [r[i] for r in rows if r[i] is not None]
    return bool(vals) and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals)


# Same convention as the site's tick labels: D+5, R+5, EVEN
MARGIN_LABEL = ("datum.value > 0 ? 'D+' + format(datum.value, '~g') : "
                "datum.value < 0 ? 'R+' + format(-datum.value, '~g') : 'EVEN'")


def _axis(value_format: str) -> dict:
    return {"labelExpr": MARGIN_LABEL} if value_format == "margin" else {"format": _fmt(value_format)}


def _is_margin_col(name: str) -> bool:
    low = name.lower()
    return "margin" in low or "shift" in low or "swing" in low


def _points_visible(enc: dict) -> None:
    """The diverging midpoint is near-black so maps read on the dark ground; small points in it would vanish."""
    scale = enc.get("color", {}).get("scale", {})
    if scale.get("range") == DIVERGING:
        scale["range"] = DIVERGING[:3] + [DIM] + DIVERGING[4:]


def _fmt(value_format: str) -> str:
    return {"percent": ".1f", "margin": "+.1f", "votes": ",.0f"}.get(value_format, ",.4~g")


def _party_scale(values: list) -> dict:
    domain, rng = [], []
    for v in sorted({str(v) for v in values if v is not None}):
        low = v.lower()
        domain.append(v)
        rng.append(DEM if low in ("d", "dem") or low.startswith("democrat") else
                   REP if low in ("r", "rep") or low.startswith("republican") else
                   OTH if low not in ("other", "o", "") else MUTED)
    return {"domain": domain, "range": rng}


def _margin_scale(values: list) -> dict:
    nums = [abs(v) for v in values if isinstance(v, (int, float))]
    m = max(nums) if nums else 1
    m = min(max(m, 5), 100)
    step = m / 3
    return {"domain": [-m, -2 * step, -step, 0, step, 2 * step, m], "range": DIVERGING, "type": "linear", "clamp": True}


THEME = {
    "background": None,
    "font": MONO,
    "padding": {"left": 4, "right": 12, "top": 8, "bottom": 4},
    "view": {"stroke": None},
    "title": {"color": FG, "subtitleColor": MUTED, "anchor": "start", "fontSize": 14, "fontWeight": 500,
              "subtitleFontSize": 11, "offset": 12, "font": MONO, "subtitleFont": MONO},
    "axisQuantitative": {"tickCount": 8},
    "axis": {"domainColor": LINE2, "gridColor": LINE, "tickColor": LINE2, "labelColor": MUTED, "titleColor": MUTED,
             "labelFontSize": 11, "titleFontSize": 11, "titleFontWeight": 400, "labelFont": MONO, "titleFont": MONO,
             "labelLimit": 220},
    "legend": {"labelColor": MUTED, "titleColor": MUTED, "labelFontSize": 11, "titleFontSize": 11,
               "titleFontWeight": 400, "labelFont": MONO, "titleFont": MONO, "orient": "top", "direction": "horizontal"},
    "range": {"category": CATEGORICAL},
    "mark": {"color": ACCENT},
    "bar": {"cornerRadiusEnd": 2},
    "point": {"filled": True, "size": 40, "opacity": 0.8},
    "line": {"strokeWidth": 2},
}


def build(spec: ChartSpec, columns: list[str], rows: list[list]) -> dict:
    """Return {"kind": "vega-lite" | "county_map" | "state_map" | "table", ...} or raise ChartError."""
    if not rows:
        raise ChartError("The query returned no rows, so there is nothing to chart.")
    idx = {c: i for i, c in enumerate(columns)}
    for role in ("x", "y", "color", "size", "label", "geo"):
        col = getattr(spec, role)
        if col is not None and col not in idx:
            raise ChartError(f"{role}='{col}' is not a result column. Columns: {', '.join(columns)}.")

    head = {"title": spec.title, "subtitle": spec.subtitle}
    if spec.type == "table":
        return {"kind": "table", **head, "columns": columns, "rows": rows}

    if spec.type in ("county_map", "state_map"):
        if not spec.geo or not spec.y:
            raise ChartError("Maps need geo (the FIPS or state column) and y (the value column).")
        if not _is_numeric(rows, idx[spec.y]):
            raise ChartError(f"Map value column '{spec.y}' must be numeric.")
        gi, vi, li = idx[spec.geo], idx[spec.y], idx.get(spec.label) if spec.label else None
        if spec.type == "county_map":
            keys = [str(r[gi]).zfill(5) if r[gi] is not None else None for r in rows]
            if sum(1 for k in keys if k and k.isdigit() and len(k) == 5) < len(rows) * 0.8:
                raise ChartError(f"'{spec.geo}' does not look like 5-digit county FIPS codes.")
        else:
            keys = [str(r[gi]).upper() if r[gi] is not None else None for r in rows]
            if sum(1 for k in keys if k and len(k) == 2) < len(rows) * 0.8:
                raise ChartError(f"'{spec.geo}' does not look like 2-letter state codes.")
        scheme = spec.color_scheme if spec.color_scheme != "auto" else ("margin" if spec.value_format == "margin" else "sequential")
        values = [{"key": k, "value": r[vi], "label": (r[li] if li is not None else None)} for k, r in zip(keys, rows) if k]
        return {"kind": spec.type, **head, "scheme": scheme, "format": spec.value_format,
                "value_title": spec.y_title or spec.y, "values": values}

    data = [{c: r[i] for c, i in idx.items()} for r in rows]
    enc: dict = {}
    tooltip = [{"field": _field(c), "type": "quantitative" if _is_numeric(rows, i) else "nominal",
                **({"format": ",.4~g"} if _is_numeric(rows, i) else {})} for c, i in idx.items()][:8]
    if spec.label:
        first = _field(spec.label)
        tooltip.sort(key=lambda t: t["field"] != first)

    def qn(col: str) -> str:
        return "quantitative" if _is_numeric(rows, idx[col]) else "nominal"

    def color_enc(col: str) -> dict:
        values = [r[idx[col]] for r in rows]
        scheme = spec.color_scheme
        if scheme == "auto":
            low = col.lower()
            scheme = ("party" if "party" in low else
                      "margin" if qn(col) == "quantitative" and ("margin" in low or "shift" in low or spec.value_format == "margin") else
                      "sequential" if qn(col) == "quantitative" else "categorical")
        if scheme == "party":
            return {"field": _field(col), "type": "nominal", "scale": _party_scale(values), "title": col}
        if scheme == "margin":
            return {"field": _field(col), "type": "quantitative", "scale": _margin_scale(values), "title": col,
                    "legend": {"labelExpr": MARGIN_LABEL}}
        if scheme == "sequential":
            return {"field": _field(col), "type": "quantitative", "scale": {"range": ["#12322a", ACCENT]}, "title": col}
        if len({str(v) for v in values}) > len(CATEGORICAL):
            raise ChartError(f"'{col}' has too many distinct values to color by; filter or group first.")
        return {"field": _field(col), "type": "nominal", "title": col}

    t = spec.type
    if t in ("bar", "grouped_bar", "stacked_bar"):
        if not spec.x or not spec.y:
            raise ChartError("Bar charts need x (category) and y (value).")
        if qn(spec.y) != "quantitative":
            raise ChartError(f"Bar value column '{spec.y}' must be numeric.")
        val_ch = "x" if spec.horizontal else "y"  # sort categories by the value channel
        sort = None if spec.sort == "none" else (f"-{val_ch}" if spec.sort == "desc" else val_ch)
        cat = {"field": _field(spec.x), "type": "nominal", "sort": sort, "title": spec.x_title or None,
               "axis": {"labelLimit": 220}}
        val = {"field": _field(spec.y), "type": "quantitative", "title": spec.y_title or spec.y,
               "axis": _axis(spec.value_format), **({"stack": None} if t != "stacked_bar" else {})}
        if spec.horizontal:
            enc["y"], enc["x"] = cat, val
        else:
            enc["x"], enc["y"] = cat, val
        mark: dict = {"type": "bar"}
        if spec.color:
            enc["color"] = color_enc(spec.color)
            if t == "grouped_bar":
                enc["yOffset" if spec.horizontal else "xOffset"] = {"field": _field(spec.color)}
        elif spec.value_format == "margin":
            enc["color"] = {"field": _field(spec.y), "type": "quantitative", "scale": _margin_scale([r[idx[spec.y]] for r in rows]), "legend": None}
        n_cats = len({r[idx[spec.x]] for r in rows})
        if n_cats > 60:
            raise ChartError(f"{n_cats} categories is too many for a bar chart; limit to the top 40 or use a histogram.")
        height = {"step": 18} if spec.horizontal else 320
    elif t == "line":
        if not spec.x or not spec.y:
            raise ChartError("Line charts need x and y.")
        enc["x"] = {"field": _field(spec.x), "type": "ordinal" if qn(spec.x) == "quantitative" else "nominal",
                    "title": spec.x_title or spec.x, "sort": None}
        enc["y"] = {"field": _field(spec.y), "type": "quantitative", "title": spec.y_title or spec.y, "axis": _axis(spec.value_format)}
        if spec.color:
            enc["color"] = color_enc(spec.color)
        mark, height = {"type": "line", "point": True}, 320
    elif t == "scatter":
        if not spec.x or not spec.y or qn(spec.x) != "quantitative" or qn(spec.y) != "quantitative":
            raise ChartError("Scatter needs numeric x and y columns.")
        enc["x"] = {"field": _field(spec.x), "type": "quantitative", "title": spec.x_title or spec.x, "scale": {"zero": False},
                    **({"axis": {"labelExpr": MARGIN_LABEL}} if _is_margin_col(spec.x) else {})}
        enc["y"] = {"field": _field(spec.y), "type": "quantitative", "title": spec.y_title or spec.y, "scale": {"zero": False},
                    **({"axis": {"labelExpr": MARGIN_LABEL}} if spec.value_format == "margin" or _is_margin_col(spec.y) else {})}
        if spec.color:
            enc["color"] = color_enc(spec.color)
            _points_visible(enc)
        if spec.size and qn(spec.size) == "quantitative":
            enc["size"] = {"field": _field(spec.size), "type": "quantitative", "scale": {"range": [8, 400]}, "title": spec.size}
        mark, height = {"type": "point"}, 380
    elif t == "histogram":
        col = spec.x or spec.y
        if not col or qn(col) != "quantitative":
            raise ChartError("Histogram needs one numeric column in x.")
        enc["x"] = {"field": _field(col), "bin": {"maxbins": 40}, "type": "quantitative", "title": spec.x_title or col}
        enc["y"] = {"aggregate": "count", "type": "quantitative", "title": spec.y_title or "count"}
        # a raw field in the tooltip would split every bin by distinct value, so show only the bin and its count
        enc["tooltip"] = [{"field": _field(col), "bin": {"maxbins": 40}, "type": "quantitative", "title": col},
                          {"aggregate": "count", "type": "quantitative", "title": "count"}]
        if spec.color:
            enc["color"] = color_enc(spec.color)
            enc["tooltip"].append({"field": _field(spec.color), "type": enc["color"]["type"], "title": spec.color})
        mark, height = {"type": "bar"}, 300
    elif t in ("strip", "boxplot"):
        if not spec.x or not spec.y or qn(spec.y) != "quantitative":
            raise ChartError(f"{t} needs x (group) and numeric y (value).")
        enc["y"] = {"field": _field(spec.x), "type": "nominal", "title": spec.x_title or None}
        enc["x"] = {"field": _field(spec.y), "type": "quantitative", "title": spec.y_title or spec.y, "axis": _axis(spec.value_format)}
        if t == "strip":
            enc["yOffset"] = {"field": "__jitter", "type": "quantitative", "scale": {"domain": [-1, 1]}}
            for i, d in enumerate(data):  # deterministic jitter so the same answer draws the same chart
                d["__jitter"] = math.sin(i * 12.9898) % 1 * 2 - 1
            if spec.color:
                enc["color"] = color_enc(spec.color)
                _points_visible(enc)
            mark = {"type": "point", "size": 14, "opacity": 0.6}
        else:
            mark = {"type": "boxplot", "extent": 1.5, "color": ACCENT, "median": {"color": FG}}
        height = {"step": 46}
    elif t == "heatmap":
        if not spec.x or not spec.y or not spec.color:
            raise ChartError("Heatmap needs x, y (categories) and color (value).")
        enc["x"] = {"field": _field(spec.x), "type": "nominal", "title": spec.x_title or spec.x}
        enc["y"] = {"field": _field(spec.y), "type": "nominal", "title": spec.y_title or spec.y}
        enc["color"] = color_enc(spec.color)
        mark, height = {"type": "rect"}, {"step": 18}
    else:  # pragma: no cover - Literal keeps this unreachable
        raise ChartError(f"Unknown chart type {t}.")

    enc.setdefault("tooltip", tooltip)
    vl = {
        "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
        "title": {"text": spec.title, **({"subtitle": spec.subtitle} if spec.subtitle else {})},
        "width": "container",
        "height": height,
        "data": {"values": data},
        "mark": {**mark, "tooltip": True} if mark.get("type") not in ("boxplot",) else mark,
        "encoding": enc,
        "config": THEME,
    }
    return {"kind": "vega-lite", **head, "spec": vl}
