# BadukPlatform — lightweight KataGo engine for Render Free (512MB)
#
# GitHub release zip 은 AppImage 형식 → FUSE 없이 --appimage-extract 후 raw ELF 사용
# 베이스: ghcr.io/stubbi/katago-server:latest-minimal (katago-server Rust API)
#
# Build:
#   docker build -t baduk-katago-engine ./backend/katago-engine

FROM ghcr.io/stubbi/katago-server:latest-minimal

ARG KATAGO_VERSION=v1.16.4
ARG KATAGO_RELEASE_ASSET=katago-v1.16.4-eigenavx2-linux-x64.zip
ARG KATAGO_MODEL=kata1-b10c128-s1141046784-d204142634.bin.gz

ENV KATAGO_MODEL=${KATAGO_MODEL}
ENV LD_LIBRARY_PATH=/app/katago-lib
ENV RUST_LOG=info
ENV MALLOC_ARENA_MAX=2
ENV KATAGO_MOVE_TIMEOUT_SECS=45
# AppImage 런타임 마운트 비활성 (extracted ELF만 사용)
ENV APPIMAGE_EXTRACT_AND_RUN=0

COPY analysis_config.cfg /app/analysis_config.cfg
COPY entrypoint.sh /app/entrypoint.sh
COPY install-katago-binary.sh /tmp/install-katago-binary.sh

SHELL ["/bin/bash", "-euxo", "pipefail", "-c"]

RUN echo "=== [1/5] apt: wget unzip file libzip libgomp ===" \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
    wget ca-certificates unzip file libgomp1 \
 && (apt-get install -y --no-install-recommends libzip5 \
     || apt-get install -y --no-install-recommends libzip4) \
 && rm -rf /var/lib/apt/lists/*

RUN echo "=== [2/5] KataGo: download + AppImage extract → /app/katago ===" \
 && wget --progress=dot:giga -O /tmp/katago.zip \
    "https://github.com/lightvector/KataGo/releases/download/${KATAGO_VERSION}/${KATAGO_RELEASE_ASSET}" \
 && test -s /tmp/katago.zip \
 && chmod +x /tmp/install-katago-binary.sh \
 && /tmp/install-katago-binary.sh /tmp/katago.zip /app/katago /app/katago-lib \
 && rm -f /tmp/katago.zip /tmp/install-katago-binary.sh \
 && echo "=== [2/5] verify: /app/katago version ===" \
 && /app/katago version

RUN echo "=== [3/5] neural net: ${KATAGO_MODEL} ===" \
 && wget --progress=dot:giga -O "/app/${KATAGO_MODEL}" \
    "https://media.katagotraining.org/uploaded/networks/models/kata1/${KATAGO_MODEL}" \
 && test -s "/app/${KATAGO_MODEL}" \
 && ls -lh "/app/${KATAGO_MODEL}"

RUN echo "=== [4/5] config.toml ===" \
 && if [ ! -f /app/config.toml ]; then \
      test -f /app/config.toml.example \
      && cp /app/config.toml.example /app/config.toml \
      || (echo "ERROR: missing config.toml and config.toml.example" && exit 1); \
    fi \
 && sed -i 's|^katago_path = .*|katago_path = "./katago"|' /app/config.toml \
 && sed -i "s|^model_path = .*|model_path = \"./${KATAGO_MODEL}\"|" /app/config.toml \
 && sed -i 's|^config_path = .*|config_path = "./analysis_config.cfg"|' /app/config.toml \
 && echo "--- config.toml ---" \
 && cat /app/config.toml

RUN echo "=== [5/5] entrypoint + logs dir ===" \
 && chmod +x /app/entrypoint.sh \
 && mkdir -p /app/analysis_logs \
 && ls -la /app/katago /app/katago-lib /app/entrypoint.sh "/app/${KATAGO_MODEL}" /app/analysis_config.cfg

EXPOSE 2718

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2718/api/v1/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
