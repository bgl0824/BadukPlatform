import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugFetch,
  debugWarn,
} from "../bootstrap/debug-logs.js";

const UI = DEBUG_CHANNELS.ui;
const POSTCODE_SCRIPT_URL =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
const DEFAULT_TIMEOUT_MS = 12_000;
const SCRIPT_SELECTOR = 'script[data-baduk-postcode="true"]';

let loadPromise = null;

export function isPostcodeReady() {
  return Boolean(window.daum?.Postcode);
}

function waitForExistingScript(timeoutMs) {
  return new Promise((resolve) => {
    const existing = document.querySelector(SCRIPT_SELECTOR);
    if (!existing) {
      resolve({ ok: false, source: "missing" });
      return;
    }

    if (isPostcodeReady()) {
      resolve({ ok: true, source: "existing" });
      return;
    }

    const timer = window.setTimeout(() => {
      resolve({ ok: false, source: "timeout", message: "postcode_v2.js timeout (existing tag)" });
    }, timeoutMs);

    const finish = (result) => {
      window.clearTimeout(timer);
      resolve(result);
    };

    existing.addEventListener(
      "load",
      () => {
        finish(
          isPostcodeReady()
            ? { ok: true, source: "existing" }
            : { ok: false, source: "loaded-missing-api" },
        );
      },
      { once: true },
    );

    existing.addEventListener(
      "error",
      () => {
        finish({ ok: false, source: "error", message: "postcode_v2.js load error" });
      },
      { once: true },
    );
  });
}

function injectPostcodeScript(timeoutMs) {
  return new Promise((resolve) => {
    const existing = document.querySelector(SCRIPT_SELECTOR);
    if (existing) {
      waitForExistingScript(timeoutMs).then(resolve);
      return;
    }

    debugFetch(UI, "postcode script lazy load start", { url: POSTCODE_SCRIPT_URL });

    const script = document.createElement("script");
    script.src = POSTCODE_SCRIPT_URL;
    script.async = true;
    script.dataset.badukPostcode = "true";

    const timer = window.setTimeout(() => {
      script.onload = null;
      script.onerror = null;
      debugWarn(UI, "postcode script load timeout", {
        source: DEBUG_SOURCES.fallback,
        timeoutMs,
      });
      resolve({ ok: false, source: "timeout", message: "postcode_v2.js timeout" });
    }, timeoutMs);

    script.onload = () => {
      window.clearTimeout(timer);
      if (isPostcodeReady()) {
        debugFetch(UI, "postcode script loaded", { url: POSTCODE_SCRIPT_URL });
        resolve({ ok: true, source: "loaded" });
        return;
      }

      debugWarn(UI, "postcode script loaded but API missing", { source: DEBUG_SOURCES.fallback });
      resolve({ ok: false, source: "loaded-missing-api" });
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      debugWarn(UI, "postcode script load error", { source: DEBUG_SOURCES.fallback });
      resolve({ ok: false, source: "error", message: "postcode_v2.js failed to load" });
    };

    document.head.appendChild(script);
  });
}

/**
 * 주소 검색 UI 열 때만 호출 — 앱 부트와 분리, timeout 시 ok:false (블로킹 없음)
 */
export async function loadPostcodeScript({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (isPostcodeReady()) {
    return { ok: true, source: "ready" };
  }

  if (!loadPromise) {
    loadPromise = injectPostcodeScript(timeoutMs).finally(() => {
      loadPromise = null;
    });
  }

  return loadPromise;
}
