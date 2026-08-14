import { getSupabaseClient } from "./supabase-client.js";

const REFRESH_TIMEOUT_MS = 12_000;

/** @type {Promise<import("@supabase/supabase-js").Session | null> | null} */
let refreshPromise = null;

export function isSupabaseAuthError(error) {
  if (!error) {
    return false;
  }

  const message = String(error.message ?? error.msg ?? "").toLowerCase();
  const code = String(error.code ?? "");
  const status = Number(error.status ?? error.statusCode ?? 0);

  return (
    status === 401 ||
    code === "401" ||
    message.includes("jwt expired") ||
    message.includes("invalid jwt") ||
    message.includes("token expired") ||
    message.includes("not authenticated") ||
    (message.includes("jwt") && message.includes("expired")) ||
    message.includes("unauthorized")
  );
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

async function performRefreshSession() {
  const client = getSupabaseClient();
  const refreshTask = client.auth.refreshSession();
  const { data, error } = await withTimeout(
    refreshTask,
    REFRESH_TIMEOUT_MS,
    "Supabase session refresh timed out.",
  );

  if (error) {
    throw error;
  }

  return data.session ?? null;
}

export function refreshSupabaseSession() {
  if (!refreshPromise) {
    refreshPromise = performRefreshSession().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function ensureSupabaseSessionReady() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session ?? null;
}

export async function withSupabaseQueryRetry(operation) {
  try {
    return await operation();
  } catch (error) {
    if (!isSupabaseAuthError(error)) {
      throw error;
    }

    const session = await refreshSupabaseSession().catch(() => null);
    if (!session) {
      throw error;
    }

    return operation();
  }
}

export async function runSupabaseQueryWithAuthRetry(queryFn) {
  const firstResult = await queryFn();
  if (!firstResult?.error || !isSupabaseAuthError(firstResult.error)) {
    return firstResult;
  }

  const session = await refreshSupabaseSession().catch(() => null);
  if (!session) {
    return firstResult;
  }

  return queryFn();
}
