import { normalizeRole } from "../permissions/permission-service.js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

export { isSupabaseConfigured, getSupabaseClient };

export const USERNAME_MIN_LENGTH = 2;
export const PASSWORD_MIN_LENGTH = 6;
export const DEFAULT_RESET_PASSWORD = "0000";

export function validateAuthUsername(username) {
  const value = normalizeAuthUsername(username);
  if (value.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      message: `아이디는 ${USERNAME_MIN_LENGTH}자 이상 입력해 주세요.`,
    };
  }

  return { ok: true, value };
}

export function validateAuthPassword(password) {
  const value = String(password ?? "");
  if (value.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자리 이상 입력해 주세요.`,
    };
  }

  return { ok: true, value };
}

/** Supabase Auth 전용 가상 도메인 (.local 은 Auth에서 거부됨) */
const INVITE_EMAIL_DOMAIN = "invite.baduk.app";
export const USERNAME_AUTH_EMAIL_DOMAIN = "baduk.app";
const AUTH_EMAIL_SLUG_LENGTH = 12;

export function normalizeAuthEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** 화면에 입력한 아이디 (앞뒤 공백만 제거, 대소문자·한글 유지) */
export function normalizeAuthUsername(value) {
  return String(value ?? "").trim();
}

async function hashSeedToAuthSlug(seed) {
  const normalizedSeed = String(seed ?? "").trim();
  if (!normalizedSeed) {
    return "";
  }

  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(normalizedSeed);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, AUTH_EMAIL_SLUG_LENGTH);
  }

  let hash = 0;
  for (const char of normalizedSeed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(16).padStart(AUTH_EMAIL_SLUG_LENGTH, "0").slice(0, AUTH_EMAIL_SLUG_LENGTH);
}

/** Supabase Auth용 안전 이메일 (한글 아이디 → `user_a1b2c3d4e5f6@baduk.app`) */
export async function usernameToAuthEmail(username) {
  const normalizedUsername = normalizeAuthUsername(username);
  if (!normalizedUsername) {
    return "";
  }

  const slug = await hashSeedToAuthSlug(`user:${normalizedUsername.toLowerCase()}`);
  return `user_${slug}@${USERNAME_AUTH_EMAIL_DOMAIN}`;
}

export function isUsernameAuthEmail(email) {
  const normalizedEmail = String(email ?? "").toLowerCase();
  return (
    normalizedEmail.endsWith(`@${USERNAME_AUTH_EMAIL_DOMAIN}`) &&
    /^user_[a-f0-9]+@/.test(normalizedEmail)
  );
}

export function isInviteAuthEmail(email) {
  const normalizedEmail = String(email ?? "").toLowerCase();
  return (
    normalizedEmail.endsWith(`@${INVITE_EMAIL_DOMAIN}`) &&
    /^invite_[a-f0-9]+@/.test(normalizedEmail)
  );
}

/** 초대 가입용 안전 이메일 (`invite_...@invite.baduk.app`) */
export async function buildInviteSignupEmail(inviteCode, username) {
  const normalizedCode = String(inviteCode ?? "").trim().toLowerCase();
  const normalizedUsername = normalizeAuthUsername(username);
  const slug = await hashSeedToAuthSlug(`invite:${normalizedCode}:${normalizedUsername.toLowerCase()}`);

  return `invite_${slug || "000000000000"}@${INVITE_EMAIL_DOMAIN}`;
}

function resolveUsernameFromSupabaseUser(supabaseUser, metadata) {
  const metadataUsername = normalizeAuthUsername(metadata.username);
  if (metadataUsername) {
    return metadataUsername;
  }

  return normalizeAuthUsername(metadata.name) || "";
}

export function mapSupabaseUserToAppUser(supabaseUser) {
  const metadata = supabaseUser?.user_metadata ?? {};
  const role = normalizeRole(metadata.role ?? metadata.userType ?? "student");
  const username = resolveUsernameFromSupabaseUser(supabaseUser, metadata);

  return {
    id: supabaseUser.id,
    username,
    name: metadata.name ?? username,
    role,
    academyId: metadata.academyId ?? "",
    academyName: metadata.academyName ?? "",
    phone: metadata.phone ?? "",
    loggedInAt: new Date().toISOString(),
  };
}

export function isSupabaseAuthUser(user) {
  if (!user?.id) {
    return false;
  }

  return !String(user.id).startsWith("local-");
}

export async function getSupabaseAuthSession() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session;
}

export function subscribeSupabaseAuthStateChange(callback) {
  const client = getSupabaseClient();
  return client.auth.onAuthStateChange((event, session) => {
    callback({
      event,
      session,
      user: session?.user ?? null,
    });
  });
}

export async function resolveSignupAuthEmail({
  username,
  inviteCode = "",
  inviteSignupEntry = false,
}) {
  const normalizedUsername = normalizeAuthUsername(username);
  if (!normalizedUsername) {
    return "";
  }

  if (inviteSignupEntry && inviteCode) {
    return buildInviteSignupEmail(inviteCode, normalizedUsername);
  }

  return usernameToAuthEmail(normalizedUsername);
}

/** user_metadata.username 기준 중복 확인 — RPC `is_auth_username_available` */
export async function checkAuthUsernameAvailable(username) {
  const normalizedUsername = normalizeAuthUsername(username);
  if (!normalizedUsername) {
    return { ok: false, message: "아이디를 입력해 주세요." };
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("is_auth_username_available", {
    check_username: normalizedUsername,
  });

  if (error) {
    console.error("is_auth_username_available RPC failed.", error);
    const isNotFound =
      error.code === "PGRST202" ||
      String(error.message ?? "").toLowerCase().includes("not found");
    return {
      ok: false,
      message: isNotFound
        ? "아이디 중복확인 함수가 없습니다. Supabase SQL Editor에서 scripts/supabase-is-auth-email-available.sql 전체를 실행해 주세요."
        : "아이디 중복확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      error,
    };
  }

  return {
    ok: true,
    available: data === true,
    username: normalizedUsername,
  };
}

/** auth.users.email 슬롯 사용 가능 여부 — RPC `is_auth_email_available` */
export async function checkAuthEmailAvailable(email) {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) {
    return { ok: false, message: "아이디를 입력해 주세요." };
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("is_auth_email_available", {
    check_email: normalizedEmail,
  });

  if (error) {
    console.error("is_auth_email_available RPC failed.", error);
    const isNotFound =
      error.code === "PGRST202" ||
      String(error.message ?? "").toLowerCase().includes("not found");
    return {
      ok: false,
      message: isNotFound
        ? "이메일 슬롯 확인 함수가 없습니다. Supabase SQL Editor에서 scripts/supabase-is-auth-email-available.sql 전체를 실행해 주세요."
        : "아이디 중복확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      error,
    };
  }

  return {
    ok: true,
    available: data === true,
    email: normalizedEmail,
  };
}

export async function checkSignupUsernameAvailability({
  username,
  inviteCode = "",
  inviteSignupEntry = false,
}) {
  const usernameValidation = validateAuthUsername(username);
  if (!usernameValidation.ok) {
    return usernameValidation;
  }

  const usernameAvailability = await checkAuthUsernameAvailable(usernameValidation.value);
  if (!usernameAvailability.ok) {
    return usernameAvailability;
  }

  const authEmail = await resolveSignupAuthEmail({
    username: usernameValidation.value,
    inviteCode,
    inviteSignupEntry,
  });

  const emailAvailability = await checkAuthEmailAvailable(authEmail);
  if (!emailAvailability.ok) {
    return emailAvailability;
  }

  const available = usernameAvailability.available && emailAvailability.available;

  return {
    ok: true,
    available,
    email: emailAvailability.email,
    username: usernameAvailability.username,
    message: available ? "사용 가능한 아이디입니다." : "이미 사용 중인 아이디입니다.",
  };
}

function isAuthDebugEnabled() {
  return Boolean(window.BadukConfig?.debugAuth);
}

/** signUp 요청 구조 로그 (debugAuth=true 일 때만, 비밀번호 미포함) */
export function logAuthSignUpRequest(request) {
  if (!isAuthDebugEnabled()) {
    return;
  }

  console.info("[Auth] signUp request", {
    email: request.email,
    metadata: request.metadata,
    optionKeys: Object.keys(request.options ?? {}),
    timestamp: new Date().toISOString(),
  });
}

/**
 * username/password 가입 — OTP·magic link 미사용.
 * 확인 메일 발송 여부는 Supabase Dashboard "Confirm email" 설정에 따름(클라이언트에서 끌 수 없음).
 */
export async function signUpWithEmail({ email, password, metadata = {} }) {
  const client = getSupabaseClient();
  const normalizedEmail = normalizeAuthEmail(email);
  const signUpOptions = {
    data: metadata,
  };

  logAuthSignUpRequest({
    email: normalizedEmail,
    metadata,
    options: signUpOptions,
  });

  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    options: signUpOptions,
  });

  if (error) {
    const isRateLimited =
      error.status === 429 ||
      String(error.message ?? "").toLowerCase().includes("rate limit");

    if (isAuthDebugEnabled()) {
      console.warn("[Auth] signUp error", {
        status: error.status,
        message: error.message,
        email: normalizedEmail,
      });
    }

    return {
      ok: false,
      message: error.message,
      error,
      status: error.status,
      isRateLimited,
    };
  }

  const requiresEmailConfirmation = Boolean(data.user && !data.session);

  if (isAuthDebugEnabled()) {
    console.info("[Auth] signUp success", {
      userId: data.user?.id,
      hasSession: Boolean(data.session),
      requiresEmailConfirmation,
      email: normalizedEmail,
    });
  }

  return {
    ok: true,
    user: data.user,
    session: data.session,
    requiresEmailConfirmation,
  };
}

export async function signInWithEmailPassword({ email, password }) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeAuthEmail(email),
    password,
  });

  if (error) {
    return { ok: false, message: error.message, error };
  }

  return {
    ok: true,
    user: data.user,
    session: data.session,
  };
}

export async function signOutSupabase() {
  const client = getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function updateSupabasePassword(newPassword) {
  const client = getSupabaseClient();
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export function formatSupabaseAuthError(message = "") {
  const normalized = String(message).toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "아이디 또는 비밀번호가 올바르지 않습니다.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already been registered")) {
    return "이미 사용 중인 아이디입니다.";
  }

  if (normalized.includes("email not confirmed")) {
    return "가입 확인이 필요합니다. 선생님에게 문의해 주세요.";
  }

  if (
    normalized.includes("password should be at least") ||
    normalized.includes("password is too short") ||
    normalized.includes("weak password")
  ) {
    return `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자리 이상 입력해 주세요.`;
  }

  if (normalized.includes("unable to validate email")) {
    return "아이디를 다시 확인해 주세요.";
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("email rate limit") ||
    normalized.includes("too many requests")
  ) {
    return "회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (같은 아이디로 연속 가입하지 마세요.)";
  }

  return message || "인증 처리 중 오류가 발생했습니다.";
}

export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, message: "모든 비밀번호 항목을 입력해 주세요." };
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `새 비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자리 이상 입력해 주세요.`,
    };
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, message: "새 비밀번호 확인이 일치하지 않습니다." };
  }

  return { ok: true };
}

export function findUserById(users, userId) {
  return users.find((user) => user.id === userId) ?? null;
}

export async function updateUserPasswordHash({
  users,
  userId,
  username,
  currentPassword,
  newPassword,
  hashPassword,
}) {
  const user = findUserById(users, userId);
  if (!user) {
    return { ok: false, message: "계정 정보를 찾을 수 없습니다." };
  }

  const currentHash = await hashPassword(username, currentPassword);
  if (user.passwordHash !== currentHash) {
    return { ok: false, message: "현재 비밀번호가 올바르지 않습니다." };
  }

  const nextHash = await hashPassword(username, newPassword);
  const nextUsers = users.map((entry) => {
    if (entry.id !== userId) {
      return entry;
    }

    return {
      ...entry,
      passwordHash: nextHash,
    };
  });

  return { ok: true, users: nextUsers };
}

export function deleteUserById({ users, userId }) {
  const user = findUserById(users, userId);
  if (!user) {
    return { ok: false, message: "계정 정보를 찾을 수 없습니다." };
  }

  return {
    ok: true,
    users: users.filter((entry) => entry.id !== userId),
    removedUser: user,
  };
}

export function isUsernameTaken(users, username, excludeUserId = null) {
  const normalizedUsername = String(username ?? "").trim().toLowerCase();
  return users.some((entry) => {
    return entry.id !== excludeUserId && entry.username === normalizedUsername;
  });
}

export async function updateUserProfile({
  users,
  userId,
  name,
  username,
  hashPassword,
  resetPasswordOnUsernameChange = true,
  defaultPassword = DEFAULT_RESET_PASSWORD,
}) {
  const user = findUserById(users, userId);
  if (!user) {
    return { ok: false, message: "계정 정보를 찾을 수 없습니다." };
  }

  const nextName = String(name ?? user.name ?? user.username ?? "").trim();
  if (!nextName) {
    return { ok: false, message: "이름을 입력해 주세요." };
  }

  const normalizedUsername = String(username ?? user.username ?? "").trim().toLowerCase();
  if (!normalizedUsername) {
    return { ok: false, message: "아이디를 입력해 주세요." };
  }

  if (isUsernameTaken(users, normalizedUsername, userId)) {
    return { ok: false, message: "이미 사용 중인 아이디입니다." };
  }

  const usernameChanged = normalizedUsername !== user.username;
  let nextUsers = users.map((entry) => {
    if (entry.id !== userId) {
      return entry;
    }

    return {
      ...entry,
      name: nextName,
      username: normalizedUsername,
    };
  });

  if (usernameChanged && resetPasswordOnUsernameChange) {
    const resetResult = await resetUserPassword({
      users: nextUsers,
      userId,
      password: defaultPassword,
      hashPassword,
      mustChangePassword: true,
    });
    if (!resetResult.ok) {
      return resetResult;
    }
    nextUsers = resetResult.users;
  }

  return {
    ok: true,
    users: nextUsers,
    usernameChanged,
    passwordReset: usernameChanged && resetPasswordOnUsernameChange,
    defaultPassword,
  };
}

export async function resetUserPassword({
  users,
  userId,
  password = DEFAULT_RESET_PASSWORD,
  hashPassword,
  mustChangePassword = true,
}) {
  const user = findUserById(users, userId);
  if (!user) {
    return { ok: false, message: "계정 정보를 찾을 수 없습니다." };
  }

  const passwordHash = await hashPassword(user.username, password);
  const nextUsers = users.map((entry) => {
    if (entry.id !== userId) {
      return entry;
    }

    return {
      ...entry,
      passwordHash,
      mustChangePassword,
      passwordResetAt: new Date().toISOString(),
    };
  });

  return {
    ok: true,
    users: nextUsers,
    password,
  };
}
