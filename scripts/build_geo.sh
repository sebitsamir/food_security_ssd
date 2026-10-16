#!/usr/bin/env bash
# Builds the web boundary files from an official admin-2 (county) dataset.
#
#   GEO_SOURCE="OCHA COD-AB South Sudan, <release/date>" \
#   GEO_ATTRIBUTION="Boundaries: OCHA / UNOCHA via HDX" \
#   GEO_LICENSE="CC BY-IGO" \
#   ./scripts/build_geo.sh path/to/admin2.shp
#
# Provenance variables are required on purpose: someone must read the dataset's
# licence page and write down where the boundaries came from.
#
# Field names differ between releases. Inspect yours first:
#   npx mapshaper path/to/admin2.shp -info
# then override: PCODE2=ADM2_PCODE NAME2=ADM2_EN PCODE1=ADM1_PCODE NAME1=ADM1_EN
set -euo pipefail

SRC="${1:?usage: build_geo.sh path/to/admin2.shp}"
: "${GEO_SOURCE:?set GEO_SOURCE}" "${GEO_ATTRIBUTION:?set GEO_ATTRIBUTION}" "${GEO_LICENSE:?set GEO_LICENSE}"
PCODE2="${PCODE2:-ADM2_PCODE}"; NAME2="${NAME2:-ADM2_EN}"
PCODE1="${PCODE1:-ADM1_PCODE}"; NAME1="${NAME1:-ADM1_EN}"
SIMPLIFY="${SIMPLIFY:-8%}"   # raise for smaller files, lower for more detail
OUT="$(cd "$(dirname "$0")/.." && pwd)/backend/data/geo"
MS="npx --yes mapshaper@0.6"

mkdir -p "$OUT"

# Counties. Mapshaper simplifies with shared-border topology, so neighbouring
# counties never develop gaps or overlaps (per-feature simplification would).
$MS "$SRC" \
  -proj wgs84 \
  -simplify "$SIMPLIFY" keep-shapes \
  -rename-fields "pcode=$PCODE2,name=$NAME2,parent=$PCODE1" \
  -filter-fields pcode,name,parent \
  -o "$OUT/counties.geojson" format=geojson precision=0.001 force

# States: dissolve counties by their parent.
$MS "$SRC" \
  -proj wgs84 \
  -simplify "$SIMPLIFY" keep-shapes \
  -dissolve "$PCODE1" copy-fields="$NAME1" \
  -rename-fields "pcode=$PCODE1,name=$NAME1" \
  -filter-fields pcode,name \
  -o "$OUT/states.geojson" format=geojson precision=0.001 force

python3 - "$OUT/meta.json" <<PY
import json, os, sys, datetime
json.dump({
  "synthetic": False,
  "source": os.environ["GEO_SOURCE"],
  "attribution": os.environ["GEO_ATTRIBUTION"],
  "license": os.environ["GEO_LICENSE"],
  "built_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
}, open(sys.argv[1], "w"), indent=2)
PY

ls -lh "$OUT"
echo "Validating with the same rules the API applies at startup..."
( cd "$(dirname "$0")/../backend" && python3 -m scripts.validate_geo )
