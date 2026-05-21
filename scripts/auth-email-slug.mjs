/**
 * 브라우저 auth-service.js 와 동일한 가상 이메일 해시 (Node 스크립트용)
 */
import crypto from "node:crypto";

export const USERNAME_AUTH_EMAIL_DOMAIN = "baduk.app";
export const INVITE_EMAIL_DOMAIN = "invite.baduk.app";
const AUTH_EMAIL_SLUG_LENGTH = 12;

export function normalizeAuthUsername(value) {
  return String(value ?? "").trim();
}

export function hashSeedToAuthSlug(seed) {
  const normalizedSeed = String(seed ?? "").trim();
  if (!normalizedSeed) {
    return "";
  }

  return crypto.createHash("sha256").update(normalizedSeed).digest("hex").slice(0, AUTH_EMAIL_SLUG_LENGTH);
}

export function usernameToAuthEmail(username) {
  const normalizedUsername = normalizeAuthUsername(username).toLowerCase();
  if (!normalizedUsername) {
    return "";
  }

  const slug = hashSeedToAuthSlug(`user:${normalizedUsername}`);
  return `user_${slug}@${USERNAME_AUTH_EMAIL_DOMAIN}`;
}
