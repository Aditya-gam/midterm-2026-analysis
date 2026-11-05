import pytest

from app.charts import DEM, REP, ChartError, ChartSpec, build

COLS = ["state", "party", "margin", "turnout_pct", "fips"]
ROWS = [["CA", "Democratic", 20.1, 51.2, "06037"], ["TX", "Republican", -12.3, 44.0, "48201"],
        ["GA", "Democratic", 1.4, 55.5, "13121"]]


def test_bar_builds_vega_lite_with_margin_colors():
    out = build(ChartSpec(type="bar", title="t", x="state", y="margin", value_format="margin"), COLS, ROWS)
    assert out["kind"] == "vega-lite"
    spec = out["spec"]
    assert spec["encoding"]["y"]["field"] == "state" and spec["encoding"]["x"]["field"] == "margin"
    assert spec["encoding"]["y"]["sort"] == "-x"
    assert spec["encoding"]["color"]["scale"]["domain"][3] == 0
    assert len(spec["data"]["values"]) == 3


def test_party_colors_follow_the_party_not_the_order():
    out = build(ChartSpec(type="scatter", title="t", x="margin", y="turnout_pct", color="party"), COLS, ROWS)
    scale = out["spec"]["encoding"]["color"]["scale"]
    assert dict(zip(scale["domain"], scale["range"])) == {"Democratic": DEM, "Republican": REP}


def test_unknown_column_is_rejected_with_the_real_columns():
    with pytest.raises(ChartError, match="Columns: state, party"):
        build(ChartSpec(type="bar", title="t", x="st", y="margin"), COLS, ROWS)


def test_non_numeric_value_rejected():
    with pytest.raises(ChartError):
        build(ChartSpec(type="bar", title="t", x="margin", y="state"), COLS, ROWS)


def test_maps_validate_keys():
    out = build(ChartSpec(type="county_map", title="t", geo="fips", y="margin", value_format="margin"), COLS, ROWS)
    assert out["kind"] == "county_map" and out["scheme"] == "margin" and out["values"][0]["key"] == "06037"
    out = build(ChartSpec(type="state_map", title="t", geo="state", y="turnout_pct"), COLS, ROWS)
    assert out["kind"] == "state_map" and out["scheme"] == "sequential"
    with pytest.raises(ChartError):
        build(ChartSpec(type="county_map", title="t", geo="state", y="margin"), COLS, ROWS)


def test_dotted_column_names_are_escaped():
    out = build(ChartSpec(type="bar", title="t", x="a.b", y="v"), ["a.b", "v"], [["x", 1], ["y", 2]])
    assert out["spec"]["encoding"]["y"]["field"] == "a\\.b"


def test_empty_result_rejected():
    with pytest.raises(ChartError):
        build(ChartSpec(type="table", title="t"), COLS, [])


def test_spec_forbids_extra_fields():
    with pytest.raises(ValueError):
        ChartSpec.model_validate({"type": "bar", "title": "t", "vega": {"evil": True}})


def test_histogram_tooltip_does_not_split_bins():
    out = build(ChartSpec(type="histogram", title="t", x="margin"), COLS, ROWS)
    assert all(t.get("bin") or t.get("aggregate") for t in out["spec"]["encoding"]["tooltip"])
