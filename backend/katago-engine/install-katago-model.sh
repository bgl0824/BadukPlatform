#!/bin/bash
# KataGo neural net — katagotraining.org API에서 model_file URL 조회 후 다운로드
# (.bin.gz 경로는 403/404 — 공식 배포는 .txt.gz)
set -euxo pipefail

NETWORK_ID="${KATAGO_NETWORK_ID:-kata1-b10c128-s1141046784-d204142634}"
API_URL="https://katagotraining.org/api/networks/${NETWORK_ID}/"
DEST_DIR="${KATAGO_MODEL_DIR:-/app}"
MARKER_FILE="${DEST_DIR}/.katago-model-filename"

echo "=== [3/5] neural net: network id=${NETWORK_ID} ==="
echo "=== API: ${API_URL} ==="

JSON="$(curl -fsSL "${API_URL}")"
MODEL_URL="$(printf '%s\n' "${JSON}" | grep -o '"model_file"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\(https[^"]*\)".*/\1/')"

if [ -z "${MODEL_URL}" ]; then
  echo "ERROR: could not parse model_file from API response"
  printf '%s\n' "${JSON}" | head -c 500
  exit 1
fi

MODEL_FILE="$(basename "${MODEL_URL}")"
DEST="${DEST_DIR}/${MODEL_FILE}"

echo "=== resolved model_file URL ==="
echo "${MODEL_URL}"
echo "=== dest: ${DEST} ==="

echo "=== wget --spider (existence check) ==="
wget --spider --user-agent="BadukPlatform-Docker-Build/1.0" "${MODEL_URL}"

echo "=== wget download ==="
wget --progress=dot:giga --user-agent="BadukPlatform-Docker-Build/1.0" \
  -O "${DEST}" "${MODEL_URL}"

test -s "${DEST}"
ls -lh "${DEST}"

printf '%s' "${MODEL_FILE}" > "${MARKER_FILE}"
echo "=== model ready: ${MODEL_FILE} ($(wc -c < "${DEST}") bytes) ==="
