#!/usr/bin/env python3
"""Build an auditable school research bundle from the US Department of Education API.

The existing preview list remains the source of the app's IDs. This script adds the
latest College Scorecard institution payload, a normalized match, and provenance for
each school without deleting the existing preview data.
"""
from __future__ import annotations

import json
import csv
import re
import ssl
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = ROOT / "data" / "preview"
OUT = ROOT / "data" / "research"
OUT.mkdir(parents=True, exist_ok=True)
SCORECARD_CSV = ROOT / "data" / "research" / "raw" / "scorecard" / "Most-Recent-Cohorts-Institution.csv"


def norm(value: str) -> str:
    value = value.lower().replace("&", " and ").replace("—", "-")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"^the ", "", value)
    value = value.replace("university of illinois at urbana champaign", "university of illinois urbana champaign")
    value = value.replace("university of illinois at chicago", "university of illinois chicago")
    return value


def choose(name: str, results: list[dict]) -> dict | None:
    target = norm(name)
    scored = []
    for row in results:
        candidate = norm(row.get("INSTNM", ""))
        score = 0
        if candidate == target:
            score += 100
        if target in candidate or candidate in target:
            score += 30
        scored.append((score, row))
    if not scored or max(scored, key=lambda item: item[0])[0] == 0:
        return None
    return max(scored, key=lambda item: item[0])[1]


def main() -> None:
    schools = json.loads((PREVIEW / "universities.json").read_text())
    if not SCORECARD_CSV.exists():
        raise SystemExit(f"missing official data file: {SCORECARD_CSV}")
    with SCORECARD_CSV.open(encoding="utf-8-sig", newline="") as handle:
        all_results = list(csv.DictReader(handle))
    print(f"loaded official institutions: {len(all_results)}")

    records = []
    missing = []
    for index, school in enumerate(schools, start=1):
        name = school["name"]
        match = choose(name, all_results)
        if match:
            official_name = match.get("INSTNM")
            records.append({
                "universityId": school["id"],
                "previewName": name,
                "unitId": match.get("UNITID"),
                "officialName": official_name,
                "operating": match.get("CURROPER") == "1",
                "payload": match,
                "source": {
                    "provider": "US Department of Education College Scorecard",
                    "url": "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip",
                    "retrievedOn": date.today().isoformat(),
                    "apiQuery": name,
                },
            })
        else:
            missing.append({"id": school["id"], "name": name})
        if index % 10 == 0:
            print(f"matched {index}/{len(schools)}")

    bundle = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "recordCount": len(records),
        "previewCount": len(schools),
        "missingCount": len(missing),
        "source": {
            "provider": "US Department of Education College Scorecard",
            "documentation": "https://collegescorecard.ed.gov/files/InstitutionDataDocumentation.pdf",
            "dataEndpoint": "https://collegescorecard.ed.gov/data/",
        },
        "records": records,
        "missing": missing,
    }
    (OUT / "school-records.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n")
    (OUT / "school-data-manifest.json").write_text(json.dumps({
        "generatedOn": bundle["generatedOn"],
        "previewCount": len(schools),
        "matchedCount": len(records),
        "missingCount": len(missing),
        "matchedUnitIds": sorted(str(record["unitId"]) for record in records),
        "missing": missing,
        "sources": [bundle["source"]],
    }, ensure_ascii=False, indent=2) + "\n")
    print(f"done: {len(records)} matched, {len(missing)} missing")


if __name__ == "__main__":
    main()
