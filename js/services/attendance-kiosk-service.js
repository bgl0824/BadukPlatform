const KIOSK_STORAGE_KEY = "BADUK_ATTENDANCE_KIOSK";

/** @typedef {{ academyId: string, academyName: string, connectedAt?: string }} AttendanceKioskBinding */

function normalizeBinding(raw) {
  const academyId = String(raw?.academyId ?? "").trim();
  if (!academyId) {
    return null;
  }

  return {
    academyId,
    academyName: String(raw?.academyName ?? "").trim(),
    connectedAt: raw?.connectedAt ? String(raw.connectedAt) : undefined,
  };
}

export function readKioskBinding() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KIOSK_STORAGE_KEY));
    return normalizeBinding(parsed);
  } catch {
    return null;
  }
}

export function saveKioskBinding({ academyId, academyName = "" }) {
  const binding = /** @type {AttendanceKioskBinding} */ ({
    academyId: String(academyId ?? "").trim(),
    academyName: String(academyName ?? "").trim(),
    connectedAt: new Date().toISOString(),
  });

  if (!binding.academyId) {
    return null;
  }

  localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(binding));
  return binding;
}

export function clearKioskBinding() {
  localStorage.removeItem(KIOSK_STORAGE_KEY);
}

export function parseKioskConnectParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  const academyId = String(params.get("academy") ?? "").trim();
  if (!academyId) {
    return null;
  }

  return {
    academyId,
    academyName: String(params.get("name") ?? "").trim(),
  };
}

export function resolveKioskPagePath() {
  if (typeof window === "undefined") {
    return "/attendance-check";
  }

  const hostname = String(window.location.hostname ?? "").toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "/attendance-check.html";
  }

  return "/attendance-check";
}

export function buildKioskConnectUrl(academyId, academyName = "", options = {}) {
  const params = new URLSearchParams();
  params.set("academy", String(academyId ?? "").trim());

  const normalizedName = String(academyName ?? "").trim();
  if (normalizedName) {
    params.set("name", normalizedName);
  }

  const basePath = options.basePath ?? resolveKioskPagePath();
  return `${basePath}?${params.toString()}`;
}

export function buildKioskConnectUrlForCurrentOrigin(academyId, academyName = "") {
  const origin = window.location.origin;
  return `${origin}${buildKioskConnectUrl(academyId, academyName)}`;
}

export function applyKioskConnectFromUrl(search = window.location.search) {
  const params = parseKioskConnectParams(search);
  if (!params) {
    return null;
  }

  const saved = saveKioskBinding(params);
  if (saved && window.history.replaceState) {
    window.history.replaceState({}, "", window.location.pathname);
  }

  return saved;
}

export function isKioskBoundToAcademy(academyId) {
  const binding = readKioskBinding();
  return Boolean(binding && binding.academyId === String(academyId ?? "").trim());
}
