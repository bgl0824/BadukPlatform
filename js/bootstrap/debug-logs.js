/**
 * 데이터 흐름 추적용 debug 로그 (localStorage ↔ Supabase ↔ UI)
 *
 * 활성화: window.BadukConfig.debugLogs = true
 * (하위 호환: debugAuth 도 켜짐)
 */

export const DEBUG_CHANNELS = {
  auth: "Auth",
  invite: "Invite",
  academy: "Academy",
  category: "Category",
  progress: "Progress",
  problem: "Problem",
  cache: "Cache",
  sync: "Sync",
  ui: "UI",
};

export const DEBUG_SOURCES = {
  supabase: "supabase",
  localCache: "local-cache",
  fallback: "fallback",
  local: "local",
};

export function isDebugLogsEnabled() {
  const config = typeof window !== "undefined" ? window.BadukConfig : null;
  if (!config) {
    return false;
  }
  return Boolean(config.debugLogs ?? config.debugAuth);
}

function normalizeChannel(channel) {
  if (!channel) {
    return "App";
  }
  const key = String(channel).toLowerCase();
  return DEBUG_CHANNELS[key] ?? String(channel);
}

function compactMeta(meta = {}) {
  if (!meta || typeof meta !== "object") {
    return meta;
  }

  const entries = Object.entries(meta).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function emit(level, channel, message, meta) {
  if (!isDebugLogsEnabled()) {
    return;
  }

  const label = normalizeChannel(channel);
  const payload = compactMeta(meta);
  const prefix = `[${label}] ${message}`;

  if (level === "error") {
    if (payload) {
      console.error(prefix, payload);
    } else {
      console.error(prefix);
    }
    return;
  }

  if (level === "warn") {
    if (payload) {
      console.warn(prefix, payload);
    } else {
      console.warn(prefix);
    }
    return;
  }

  if (payload) {
    console.info(prefix, payload);
  } else {
    console.info(prefix);
  }
}

export function debugLog(channel, message, meta) {
  emit("info", channel, message, meta);
}

export function debugWarn(channel, message, meta) {
  emit("warn", channel, message, meta);
}

export function debugError(channel, message, meta) {
  emit("error", channel, message, meta);
}

/** fetch/load 결과 — source 필수 */
export function debugFetch(channel, message, { source, before, after, ...meta } = {}) {
  const payload = { source, ...meta };
  if (before !== undefined) {
    payload.before = before;
  }
  if (after !== undefined) {
    payload.after = after;
  }

  if (source === DEBUG_SOURCES.fallback) {
    debugWarn(channel, message, payload);
    return;
  }

  debugLog(channel, message, payload);
}

/** hydrate / cache 교체 */
export function debugSync(channel, message, { source, before, after, ...meta } = {}) {
  const payload = { source, ...meta };
  if (before !== undefined) {
    payload.before = before;
  }
  if (after !== undefined) {
    payload.after = after;
  }

  const staleOverwrite =
    before !== undefined && after !== undefined && after < before && before > 0;

  if (source === DEBUG_SOURCES.fallback || staleOverwrite) {
    debugWarn(channel, staleOverwrite ? `${message} (overwrite stale cache)` : message, payload);
    return;
  }

  debugLog(channel, message, payload);
}

export function debugRpc(channel, functionName, { payload, error, ok = !error } = {}) {
  if (!isDebugLogsEnabled() && !error) {
    return;
  }

  const safePayload = payload ? { ...payload } : {};
  if ("password" in safePayload) {
    safePayload.password = "[redacted]";
  }
  if ("new_password" in safePayload) {
    safePayload.new_password = "[redacted]";
  }

  if (error) {
    debugError(channel, `RPC failed: ${functionName}`, {
      payload: safePayload,
      message: error?.message ?? String(error),
      code: error?.code,
    });
    return;
  }

  if (ok) {
    debugLog(channel, `RPC ok: ${functionName}`, { payload: safePayload });
  }
}

export function debugCache(channel, message, meta) {
  debugLog(DEBUG_CHANNELS.cache, message, { channel: normalizeChannel(channel), ...meta });
}

if (typeof window !== "undefined") {
  window.BadukDebug = {
    isDebugLogsEnabled,
    debugLog,
    debugWarn,
    debugError,
    debugFetch,
    debugSync,
    debugRpc,
    debugCache,
    DEBUG_CHANNELS,
    DEBUG_SOURCES,
  };
}
