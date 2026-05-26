#!/bin/bash
# GitHub release zip → /app/katago (FUSE 없이 AppImage extract 또는 raw ELF 복사)
set -euxo pipefail

ZIP_PATH="${1:?zip path required}"
DEST_BIN="${2:-/app/katago}"
LIB_DIR="${3:-/app/katago-lib}"

WORKDIR="/tmp/kg-install"
rm -rf "${WORKDIR}"
mkdir -p "${WORKDIR}"
unzip -q "${ZIP_PATH}" -d "${WORKDIR}"

KATAGO_CANDIDATE="$(find "${WORKDIR}" -type f -name katago | head -1)"
if [ -z "${KATAGO_CANDIDATE}" ]; then
  echo "ERROR: katago not found inside zip"
  find "${WORKDIR}" -type f | head -30
  exit 1
fi

chmod +x "${KATAGO_CANDIDATE}"
echo "candidate: ${KATAGO_CANDIDATE}"
file "${KATAGO_CANDIDATE}" || true

EXTRACT_DIR="$(dirname "${KATAGO_CANDIDATE}")"
cd "${EXTRACT_DIR}"

rm -rf squashfs-root
if file "${KATAGO_CANDIDATE}" | grep -qi AppImage; then
  echo "AppImage detected — extracting (no FUSE required)"
  "${KATAGO_CANDIDATE}" --appimage-extract
  if [ ! -d squashfs-root ]; then
    echo "ERROR: --appimage-extract did not create squashfs-root"
    exit 1
  fi
  REAL_BIN="$(find squashfs-root -type f -name katago | head -1)"
  if [ -z "${REAL_BIN}" ]; then
    echo "ERROR: extracted katago binary not found"
    find squashfs-root -type f | head -30
    exit 1
  fi
  cp "${REAL_BIN}" "${DEST_BIN}"
  chmod +x "${DEST_BIN}"
  mkdir -p "${LIB_DIR}"
  for sub in usr/lib lib usr/lib/x86_64-linux-gnu; do
    if [ -d "squashfs-root/${sub}" ]; then
      cp -a "squashfs-root/${sub}/." "${LIB_DIR}/"
    fi
  done
else
  echo "Plain ELF — copy without extract"
  cp "${KATAGO_CANDIDATE}" "${DEST_BIN}"
  chmod +x "${DEST_BIN}"
fi

echo "installed: ${DEST_BIN}"
ldd "${DEST_BIN}" || true

export LD_LIBRARY_PATH="${LIB_DIR}:${LD_LIBRARY_PATH:-}"
"${DEST_BIN}" version

rm -rf "${WORKDIR}"
