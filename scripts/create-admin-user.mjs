/**
 * 기본 관리자 계정 생성 (Supabase Auth Admin API)
 *
 * 아이디: admin / 비밀번호: 000000
 * auth email: user_{해시}@baduk.app
 *
 * PowerShell:
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
 *   npm run create-admin
 *
 * 미리보기:
 *   npm run create-admin:dry-run
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { usernameToAuthEmail } from "./auth-email-slug.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "000000";
const ADMIN_METADATA = {
  role: "admin",
  userType: "admin",
  username: ADMIN_USERNAME,
};

function logInfo(message) {
  console.log(`[INFO] ${message}`);
}

function logSuccess(message) {
  console.log(`[SUCCESS] ${message}`);
}

function logError(message) {
  console.error(`[ERROR] ${message}`);
}

function logWarn(message) {
  console.warn(`[WARN] ${message}`);
}

function loadSupabaseUrl() {
  if (process.env.SUPABASE_URL?.trim()) {
    return process.env.SUPABASE_URL.trim().replace(/\/$/, "");
  }

  const configPath = join(__dirname, "../js/runtime-config.js");
  if (!existsSync(configPath)) {
    return "";
  }

  const content = readFileSync(configPath, "utf8");
  const match = content.match(/supabaseUrl:\s*"([^"]+)"/);
  return match?.[1]?.replace(/\/$/, "") ?? "";
}

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    ""
  );
}

function maskKey(key) {
  if (!key || key.length < 12) {
    return "(empty or too short)";
  }

  return `${key.slice(0, 8)}...${key.slice(-4)} (len=${key.length})`;
}

function decodeJwtRole(key) {
  try {
    const parts = key.split(".");
    if (parts.length < 2) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function validateEnvironment() {
  const supabaseUrl = loadSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  const errors = [];

  logInfo("환경 확인");
  logInfo(`SUPABASE_URL: ${supabaseUrl || "(missing)"}`);
  logInfo(`SERVICE_ROLE_KEY: ${maskKey(serviceKey)}`);

  if (!supabaseUrl) {
    errors.push("SUPABASE_URL이 없습니다. js/runtime-config.js 또는 SUPABASE_URL 환경변수를 설정하세요.");
  }

  if (!serviceKey) {
    errors.push(
      "SUPABASE_SERVICE_ROLE_KEY가 없습니다. Dashboard → Project Settings → API → service_role 키를 설정하세요.",
    );
  }

  if (serviceKey.startsWith("sb_publishable_")) {
    errors.push(
      "입력된 키가 publishable(anon) 키입니다. service_role 키가 필요합니다.",
    );
  }

  const jwtRole = serviceKey ? decodeJwtRole(serviceKey) : null;
  if (jwtRole && jwtRole !== "service_role") {
    errors.push(`JWT role이 service_role이 아닙니다 (현재: ${jwtRole}).`);
  } else if (serviceKey && !jwtRole) {
    logWarn("JWT role을 확인하지 못했습니다. service_role 키인지 Dashboard에서 다시 확인하세요.");
  }

  if (errors.length > 0) {
    errors.forEach((message) => logError(message));
    logError("실행 중단");
    process.exit(1);
  }

  logSuccess("환경 변수 검증 통과 (service_role)");
  return { supabaseUrl, serviceKey };
}

async function adminFetch(path, { method = "GET", body, serviceKey, supabaseUrl }) {
  const url = `${supabaseUrl}/auth/v1/admin${path}`;
  logInfo(`${method} ${url.replace(supabaseUrl, "{SUPABASE_URL}")}`);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    logError(`네트워크 오류: ${networkError.message}`);
    return { response: null, payload: null, networkError };
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  logInfo(`HTTP ${response.status} ${response.statusText || ""}`.trim());

  if (!response.ok) {
    logError(`API 응답 실패 (${response.status})`);
    console.error(JSON.stringify(payload, null, 2));
  }

  return { response, payload, networkError: null };
}

async function listAllUsers({ serviceKey, supabaseUrl, targetEmail }) {
  const normalizedTarget = targetEmail.toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    const { response, payload, networkError } = await adminFetch(`/users?${query}`, {
      serviceKey,
      supabaseUrl,
    });

    if (networkError) {
      return { user: null, error: networkError.message };
    }

    if (!response.ok) {
      return { user: null, error: `list users failed: ${response.status}` };
    }

    const users = payload?.users ?? [];
    const matched = users.find((user) => user.email?.toLowerCase() === normalizedTarget);
    if (matched) {
      return { user: matched, error: null };
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return { user: null, error: null };
}

async function findUserByEmail(authEmail, credentials) {
  const filterAttempts = [
    `/users?filter=${encodeURIComponent(authEmail)}`,
    `/users?email=${encodeURIComponent(authEmail)}`,
  ];

  for (const path of filterAttempts) {
    const { response, payload } = await adminFetch(path, credentials);
    if (!response?.ok) {
      continue;
    }

    const users = payload?.users ?? (payload?.id ? [payload] : []);
    const matched = users.find((user) => user.email?.toLowerCase() === authEmail.toLowerCase());
    if (matched) {
      logInfo(`기존 사용자 조회 성공 (${path})`);
      return matched;
    }
  }

  logInfo("필터 조회로 못 찾음 — 전체 목록 페이지 검색");
  const listed = await listAllUsers({ ...credentials, targetEmail: authEmail });
  if (listed.error) {
    logWarn(`목록 검색 실패: ${listed.error}`);
    return null;
  }

  return listed.user;
}

async function createAdminUser(authEmail, credentials) {
  return adminFetch("/users", {
    method: "POST",
    body: {
      email: authEmail,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: ADMIN_METADATA,
    },
    ...credentials,
  });
}

async function updateAdminUser(userId, authEmail, credentials) {
  return adminFetch(`/users/${userId}`, {
    method: "PUT",
    body: {
      email: authEmail,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: ADMIN_METADATA,
    },
    ...credentials,
  });
}

function printUserSummary(user, authEmail) {
  const metadata = user?.user_metadata ?? user?.raw_user_meta_data ?? {};
  logSuccess("admin user ready");
  console.log("---");
  console.log(`auth email: ${user?.email ?? authEmail}`);
  console.log(`user id:    ${user?.id ?? "(unknown)"}`);
  console.log(`username:   ${metadata.username ?? ADMIN_USERNAME}`);
  console.log(`role:       ${metadata.role ?? "(missing)"}`);
  console.log(`userType:   ${metadata.userType ?? "(missing)"}`);
  console.log("---");
  console.log("로그인: auth.html → 아이디 admin / 비밀번호 000000");
  console.log("확인: Supabase Dashboard → Authentication → Users");
}

async function verifyUserInAuth(authEmail, credentials) {
  const user = await findUserByEmail(authEmail, credentials);
  if (!user?.id) {
    logError("생성 API는 성공했으나 Authentication > Users 에서 계정을 찾지 못했습니다.");
    return null;
  }

  logSuccess("Authentication > Users 에서 계정 확인됨");
  return user;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const authEmail = usernameToAuthEmail(ADMIN_USERNAME);

  console.log("");
  logInfo("=== Baduk 기본 관리자 계정 ===");
  logInfo(`화면 아이디: ${ADMIN_USERNAME}`);
  logInfo(`비밀번호: ${ADMIN_PASSWORD}`);
  logInfo(`내부 auth email: ${authEmail}`);
  logInfo(`metadata: ${JSON.stringify(ADMIN_METADATA)}`);
  console.log("");

  if (isDryRun) {
    logSuccess("dry-run complete (API 호출 없음)");
    return;
  }

  const credentials = validateEnvironment();

  let existing = await findUserByEmail(authEmail, credentials);
  let result;
  let action = "create";

  if (existing?.id) {
    logInfo(`기존 계정 발견 — id: ${existing.id}, 갱신합니다.`);
    action = "update";
    result = await updateAdminUser(existing.id, authEmail, credentials);
  } else {
    logInfo("신규 관리자 계정 생성 요청");
    result = await createAdminUser(authEmail, credentials);

    if (
      result.response &&
      !result.response.ok &&
      (result.response.status === 422 || result.response.status === 400)
    ) {
      const message = JSON.stringify(result.payload ?? {}).toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        logWarn("이미 존재하는 계정으로 보입니다. 조회 후 갱신을 시도합니다.");
        existing = await findUserByEmail(authEmail, credentials);
        if (existing?.id) {
          action = "update";
          result = await updateAdminUser(existing.id, authEmail, credentials);
        }
      }
    }
  }

  if (result.networkError) {
    process.exit(1);
  }

  if (!result.response?.ok) {
    if (result.response?.status === 401 || result.response?.status === 403) {
      logError("invalid service role key (401/403)");
    } else {
      logError("user create failed");
    }
    process.exit(1);
  }

  const user = result.payload?.user ?? result.payload;
  const verified = await verifyUserInAuth(authEmail, credentials);
  const finalUser = verified ?? user;

  if (!finalUser?.id) {
    logError("user create failed — user id 없음");
    process.exit(1);
  }

  logSuccess(action === "update" ? "admin user updated" : "admin user created");
  printUserSummary(finalUser, authEmail);
}

main().catch((error) => {
  logError(error.message ?? String(error));
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
