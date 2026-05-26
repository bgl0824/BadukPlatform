# BadukPlatform — lightweight KataGo engine for Render Free (512MB)
#
# ghcr.io/stubbi/katago-server:latest 는 b28 + nnCache 2^20 → 512MB 초과
# 이 이미지: b10(또는 b6) + 경량 analysis_config.cfg
#
# Build (Render / local):
#   docker build -t baduk-katago-engine ./backend/katago-engine
#
# Smaller model (optional build-arg):
#   docker build --build-arg KATAGO_MODEL=kata1-b6c96-s175395328-d26788732.bin.gz .

# katago-server 바이너리만 (Rust, ~수 MB)
FROM ghcr.io/stubbi/katago-server:latest-minimal AS server

# KataGo CPU 바이너리만 복사 (b28 가중치 파일은 복사하지 않음)
FROM ghcr.io/stubbi/katago-server:latest AS katago-donor

FROM server

COPY --from=katago-donor /app/katago /app/katago
COPY analysis_config.cfg /app/analysis_config.cfg
COPY entrypoint.sh /app/entrypoint.sh

# b10: ~11MB gzip, 응수용으로 충분. b6는 더 작고 약함.
ARG KATAGO_MODEL=kata1-b10c128-s1141046784-d204142634.bin.gz
ENV KATAGO_MODEL=${KATAGO_MODEL}

RUN set -ex \
  && chmod +x /app/katago /app/entrypoint.sh \
  && wget -q -O "/app/${KATAGO_MODEL}" \
    "https://media.katagotraining.org/uploaded/networks/models/kata1/${KATAGO_MODEL}" \
  && test -s "/app/${KATAGO_MODEL}" \
  && if [ -f /app/config.toml ]; then \
    sed -i 's|^katago_path = .*|katago_path = "./katago"|' /app/config.toml; \
    sed -i "s|^model_path = .*|model_path = \"./${KATAGO_MODEL}\"|" /app/config.toml; \
    sed -i 's|^config_path = .*|config_path = "./analysis_config.cfg"|' /app/config.toml; \
  fi \
  && mkdir -p /app/analysis_logs && chown 1000:1000 /app/analysis_logs

ENV RUST_LOG=info
ENV MALLOC_ARENA_MAX=2
ENV KATAGO_MOVE_TIMEOUT_SECS=45

EXPOSE 2718

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2718/api/v1/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
