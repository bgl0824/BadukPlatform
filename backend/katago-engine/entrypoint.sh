#!/bin/sh
set -eux

cd /app

if [ -d /app/katago-lib ]; then
  export LD_LIBRARY_PATH="/app/katago-lib:${LD_LIBRARY_PATH:-}"
fi
export APPIMAGE_EXTRACT_AND_RUN=0

if [ -f /app/.katago-model-filename ]; then
  KATAGO_MODEL="$(cat /app/.katago-model-filename)"
  export KATAGO_MODEL
fi

echo "[katago-engine] startup pwd=$(pwd)"
ls -la /app/katago "/app/${KATAGO_MODEL:-}" /app/analysis_config.cfg 2>/dev/null || true

KATAGO_CONFIG_PATH="${KATAGO_CONFIG_PATH:-./analysis_config.cfg}"

# config.toml 경로 정리 (minimal 베이스 이미지 호환)
if [ -f config.toml ]; then
  if [ -n "${KATAGO_MODEL:-}" ] && [ -f "./${KATAGO_MODEL}" ]; then
    sed -i "s|^model_path = .*|model_path = \"./${KATAGO_MODEL}\"|" config.toml
  fi
  sed -i 's|^katago_path = .*|katago_path = "./katago"|' config.toml
  sed -i 's|^config_path = .*|config_path = "./analysis_config.cfg"|' config.toml
fi

# Render 등 env 미설정 시 기본 analysis_config.cfg 사용 (복사는 override 일 때만)
if [ "$KATAGO_CONFIG_PATH" != "./analysis_config.cfg" ] && [ -f "$KATAGO_CONFIG_PATH" ]; then
  cp "$KATAGO_CONFIG_PATH" ./analysis_config.cfg
fi

echo "[katago-engine] model=${KATAGO_MODEL:-unknown} maxVisits=8 maxTime=0.18 cache=2^11 threads=1"
exec ./katago-server
