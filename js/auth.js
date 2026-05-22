import {
  canManageMemberLifecycle,
  canManageProblems,
  canResetMemberPassword,
  getDisplayUserName,
  normalizeRole,
  ROLES,
} from "./permissions/permission-service.js";
import {
  createAcademyMember,
  findInviteCode,
  isActiveMember,
  normalizeInviteCode,
  readAcademyMembers,
  updateAcademyMemberProfile,
} from "./services/academy-service.js";
import {
  checkSignupUsernameAvailability,
  DEFAULT_RESET_PASSWORD,
  findUserById,
  formatSupabaseAuthError,
  getAuthEmailForPasswordChange,
  getSupabaseAuthSession,
  isSupabaseAuthUser,
  isSupabaseConfigured,
  mapSupabaseUserToAppUser,
  normalizeAuthUsername,
  resetSupabaseUserPassword,
  resetUserPassword,
  usernameToAuthEmail,
  signInWithEmailPassword,
  signInWithUsernamePassword,
  signOutSupabase,
  signUpWithEmail,
  subscribeSupabaseAuthStateChange,
  updateSupabasePassword,
  updateUserPasswordHash,
  updateUserProfile,
  validateAuthPassword,
  validateAuthUsername,
  validatePasswordChange,
} from "./services/auth-service.js";
import {
  DEBUG_CHANNELS,
  debugLog,
} from "./bootstrap/debug-logs.js";
import { loadPostcodeScript } from "./services/postcode-loader.js";
import { deleteMemberAccountFully } from "./services/user-delete-service.js";

(function () {
const AUTH_STORAGE_KEY = "BADUK_AUTH_USER";
const USERS_STORAGE_KEY = "BADUK_AUTH_USERS";
const elements = {
  statusBar: document.querySelector("#auth-status-bar"),
  loginModal: document.querySelector("#login-modal"),
  signupModal: document.querySelector("#signup-modal"),
  loginForm: document.querySelector("#login-form"),
  signupForm: document.querySelector("#signup-form"),
  loginUsername: document.querySelector("#login-username"),
  loginPassword: document.querySelector("#login-password"),
  signupUsername: document.querySelector("#signup-username"),
  signupUsernameLabel: document.querySelector("#signup-username-label"),
  signupUsernameMessage: document.querySelector("#signup-username-message"),
  signupDuplicateButton: document.querySelector("#check-username-duplicate"),
  signupPassword: document.querySelector("#signup-password"),
  signupName: document.querySelector("#signup-name"),
  signupPhone: document.querySelector("#signup-phone"),
  signupAcademyName: document.querySelector("#signup-academy-name"),
  signupInviteCode: document.querySelector("#signup-invite-code"),
  signupInviteCodeHidden: document.querySelector("#signup-invite-code-hidden"),
  signupInviteHelp: document.querySelector("#signup-invite-help"),
  signupFullOnlyFields: document.querySelectorAll(".signup-full-only"),
  signupInviteOnlyFields: document.querySelectorAll(".signup-invite-only"),
  signupPostcode: document.querySelector("#signup-postcode"),
  signupAddress: document.querySelector("#signup-address"),
  signupAddressDetail: document.querySelector("#signup-address-detail"),
  signupAddressButton: document.querySelector("#search-address"),
  postcodeLayer: document.querySelector("#postcode-layer"),
  postcodeLayerContent: document.querySelector("#postcode-layer-content"),
  postcodeLayerClose: document.querySelector("#close-postcode-layer"),
  postcodePopupButton: document.querySelector("#open-postcode-popup"),
  signupUserTypes: document.querySelectorAll('[name="user_type"]'),
  academyField: document.querySelector("#academy-name-field"),
  loginMessage: document.querySelector("#login-message"),
  signupMessage: document.querySelector("#signup-message"),
  adminEntry: document.querySelector("#admin-entry"),
  adminModeToggle: document.querySelector("#admin-mode-toggle"),
  accountSettingsModal: document.querySelector("#account-settings-modal"),
  accountSettingsForm: document.querySelector("#account-settings-form"),
  accountSettingsName: document.querySelector("#account-settings-name"),
  accountSettingsRole: document.querySelector("#account-settings-role"),
  accountSettingsAcademyRow: document.querySelector("#account-settings-academy-row"),
  accountSettingsAcademy: document.querySelector("#account-settings-academy"),
  accountCurrentPassword: document.querySelector("#account-current-password"),
  accountNewPassword: document.querySelector("#account-new-password"),
  accountConfirmPassword: document.querySelector("#account-confirm-password"),
  accountSettingsMessage: document.querySelector("#account-settings-message"),
};

let currentUser = null;
const isAuthPage = document.body.dataset.page === "auth";
const isSignupPage = document.body.dataset.page === "signup";
const requiresAuth = document.body.dataset.requireAuth === "true";
let authStateSubscription = null;
/** 초대 링크(/signup?invite=) 진입 시에만 true — 일반 회원가입 폼과 분기 */
let inviteSignupEntry = false;
let checkedUsername = "";
let isCheckedUsernameAvailable = false;
let authEventsBound = false;
let signupSubmitInFlight = false;

const authReady = bootstrapAuth();

window.BadukAuth = {
  getCurrentUser: () => currentUser,
  getStoredUsers: () => readUsers().map(({ passwordHash, ...user }) => user),
  openAccountSettings: openAccountSettingsModal,
  authReady,
  DEFAULT_RESET_PASSWORD,
  resetUserPassword: resetUserPasswordForMember,
  updateMemberAccount: updateMemberAccountForAcademy,
  deleteMemberAccount: deleteMemberAccountForAcademy,
};

authReady
  .then((shouldContinue) => {
    if (!shouldContinue) {
      return;
    }

    renderAuthStatus();
    updateAdminModeVisibility();
    bindAuthEvents();
    prefillInviteCodeFromUrl();
  })
  .catch((error) => {
    console.error("Auth bootstrap failed.", error);
    if (requiresAuth) {
      window.location.replace("./auth.html");
    }
  });

async function bootstrapAuth() {
  hideTemporaryAdminEntry();

  if (!isSupabaseConfigured()) {
    console.warn("Supabase Auth is not configured. Login and signup are unavailable.");
    currentUser = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return handleAuthRedirects();
  }

  try {
    const session = await getSupabaseAuthSession();
    if (session?.user) {
      await applySupabaseUser(session.user);
    } else {
      currentUser = null;
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    if (!authStateSubscription) {
      authStateSubscription = subscribeSupabaseAuthStateChange(({ event, user }) => {
        if (user) {
          void applySupabaseUser(user).then(() => {
          renderAuthStatus();
          updateAdminModeVisibility();
          });
          return;
        }

        if (event === "SIGNED_OUT" || event === "USER_DELETED") {
          clearSessionUser({ redirectOnProtectedPage: true });
        }
      });
    }
  } catch (error) {
    console.error("Failed to restore Supabase session.", error);
    currentUser = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  return handleAuthRedirects();
}

function handleAuthRedirects() {
  if (requiresAuth && !currentUser) {
    window.location.replace("./auth.html");
    return false;
  }

  if ((isAuthPage || isSignupPage) && currentUser) {
    window.location.replace("./index.html");
    return false;
  }

  return true;
}

function hideTemporaryAdminEntry() {
  elements.adminEntry?.classList.add("is-hidden");
  elements.adminEntry?.setAttribute("aria-hidden", "true");
}

async function enrichAppUserFromAcademyMember(appUser) {
  if (!appUser?.id) {
    return appUser;
  }

  const role = normalizeRole(appUser.role);
  if (role === ROLES.academyOwner) {
    return {
      ...appUser,
      academyId: appUser.id,
      academyName: appUser.academyName || appUser.name || appUser.username,
    };
  }

  if (String(appUser.academyId ?? "").trim()) {
    return appUser;
  }

  const { fetchAcademyMemberByUserId } = await import("./services/academy-member-service.js");
  const member = await fetchAcademyMemberByUserId(appUser.id);
  if (!member) {
    return appUser;
  }

  return {
    ...appUser,
    academyId: member.academyId,
    academyName: member.academyName || appUser.academyName,
    inviteCode: member.inviteCode || appUser.inviteCode,
  };
}

async function applySupabaseUser(supabaseUser) {
  const appUser = await enrichAppUserFromAcademyMember(mapSupabaseUserToAppUser(supabaseUser));
  storeUser(appUser);
}

function clearSessionUser({ redirectOnProtectedPage = false } = {}) {
  currentUser = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  updateAdminModeVisibility();

  if (redirectOnProtectedPage && requiresAuth) {
    window.location.href = "./auth.html";
    return;
  }

  renderAuthStatus();
}

function bindAuthEvents() {
  if (authEventsBound) {
    return;
  }
  authEventsBound = true;

  elements.loginForm?.addEventListener("submit", handleLoginSubmit);
  elements.signupForm?.addEventListener("submit", handleSignupSubmit);
  elements.accountSettingsForm?.addEventListener("submit", handleAccountSettingsSubmit);
  elements.signupDuplicateButton?.addEventListener("click", checkSignupUsername);
  elements.signupUsername?.addEventListener("input", resetUsernameCheck);
  elements.signupAddressButton?.addEventListener("click", () => {
    void openAddressSearch();
  });
  elements.postcodeLayerClose?.addEventListener("click", closeAddressSearch);
  elements.postcodePopupButton?.addEventListener("click", () => {
    void openAddressSearchPopup();
  });
  elements.postcodeLayer?.addEventListener("click", (event) => {
    if (event.target === elements.postcodeLayer) {
      closeAddressSearch();
    }
  });
  elements.signupUserTypes.forEach((field) => {
    field.addEventListener("change", updateAcademyFieldVisibility);
  });
  updateAcademyFieldVisibility();
  applyInviteSignupEntryFromUrl();
  updateInviteSignupMode();

  document.querySelectorAll("[data-auth-close]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      closeAuthModals();
    });
  });

  [elements.loginModal, elements.signupModal, elements.accountSettingsModal].forEach((modal) => {
    bindAuthModalBackdropDismiss(modal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isAnyAuthModalOpen()) {
      closeAuthModals();
    }
    if (event.key === "Escape") {
      closeAddressSearch();
    }
  });
}

/** 배경 클릭만 닫기 — 입력란에서 드래그 후 바깥 mouseup 시 click으로 닫히지 않게 함 */
function bindAuthModalBackdropDismiss(modal) {
  if (!modal) {
    return;
  }

  let backdropPointerDown = false;
  const dialogCard = modal.querySelector(".auth-modal-card");

  modal.addEventListener(
    "pointerdown",
    (event) => {
      backdropPointerDown = event.target === modal;
    },
    true,
  );

  dialogCard?.addEventListener("pointerdown", () => {
    backdropPointerDown = false;
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal && backdropPointerDown) {
      closeAuthModals();
    }
    backdropPointerDown = false;
  });

  modal.addEventListener("pointercancel", () => {
    backdropPointerDown = false;
  });
}

function isAnyAuthModalOpen() {
  return [elements.loginModal, elements.signupModal, elements.accountSettingsModal].some(
    (modal) => modal && !modal.classList.contains("is-hidden"),
  );
}

function renderAuthStatus() {
  if (!elements.statusBar) {
    return;
  }

  elements.statusBar.innerHTML = "";

  if (currentUser) {
    const welcome = document.createElement("span");
    welcome.className = "auth-status-text";
    welcome.textContent = `${getDisplayUserName(currentUser)}님 환영합니다`;

    const settingsButton = createAuthButton("계정 관리", () => {
      openAccountSettingsModal();
    });

    const logoutButton = createAuthButton("로그아웃", () => {
      void handleLogout();
    });

    elements.statusBar.append(welcome, settingsButton, logoutButton);
    return;
  }

  elements.statusBar.append(
    createAuthButton("로그인", () => openAuthModal(elements.loginModal, elements.loginUsername)),
    createAuthButton("회원가입", () => {
      window.location.href = "./signup.html";
    }),
  );
}

function updateAdminModeVisibility() {
  if (!elements.adminModeToggle) {
    return;
  }

  const canUseAdminMode = canManageProblems(currentUser);
  elements.adminModeToggle.classList.toggle("is-hidden", !canUseAdminMode);
}

function createAuthButton(label, onClick) {
  const button = document.createElement("button");
  button.className = "auth-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function openAuthModal(modal, focusTarget) {
  if (!modal) {
    return;
  }

  closeAuthModals();
  clearAuthMessages();
  modal.classList.remove("is-hidden");
  window.setTimeout(() => focusTarget?.focus(), 0);
}

function closeAuthModals() {
  elements.loginModal?.classList.add("is-hidden");
  elements.signupModal?.classList.add("is-hidden");
  elements.accountSettingsModal?.classList.add("is-hidden");
}

function openAccountSettingsModal() {
  if (!currentUser) {
    return;
  }

  if (elements.accountSettingsName) {
    elements.accountSettingsName.textContent = getDisplayUserName(currentUser) || "-";
  }

  if (elements.accountSettingsRole) {
    elements.accountSettingsRole.textContent = getRoleLabel(currentUser.role);
  }

  const hasAcademyInfo = Boolean(currentUser.academyName || currentUser.academyId);
  elements.accountSettingsAcademyRow?.classList.toggle("is-hidden", !hasAcademyInfo);
  if (elements.accountSettingsAcademy && hasAcademyInfo) {
    elements.accountSettingsAcademy.textContent = currentUser.academyName || "-";
  }

  elements.accountSettingsForm?.reset();
  setAuthMessage(elements.accountSettingsMessage, "");
  elements.accountSettingsModal?.classList.remove("is-hidden");
  window.setTimeout(() => elements.accountCurrentPassword?.focus(), 0);
}

async function handleAccountSettingsSubmit(event) {
  event.preventDefault();

  if (!currentUser?.id) {
    setAuthMessage(elements.accountSettingsMessage, "로그인이 필요합니다.", "error");
    return;
  }

  const validation = validatePasswordChange({
    currentPassword: elements.accountCurrentPassword?.value ?? "",
    newPassword: elements.accountNewPassword?.value ?? "",
    confirmPassword: elements.accountConfirmPassword?.value ?? "",
  });

  if (!validation.ok) {
    setAuthMessage(elements.accountSettingsMessage, validation.message, "error");
    return;
  }

  await runAuthRequest(
    elements.accountSettingsForm,
    elements.accountSettingsMessage,
    async () => {
      if (isSupabaseAuthUser(currentUser)) {
        const authEmail = await getAuthEmailForPasswordChange(currentUser);
        if (!authEmail) {
          throw new Error("아이디 정보가 없어 비밀번호를 변경할 수 없습니다.");
        }

        const verifyResult = await signInWithEmailPassword({
          email: authEmail,
          password: elements.accountCurrentPassword.value,
        });
        if (!verifyResult.ok) {
          throw new Error(formatSupabaseAuthError(verifyResult.message));
        }

        const updateResult = await updateSupabasePassword(elements.accountNewPassword.value);
        if (!updateResult.ok) {
          throw new Error(formatSupabaseAuthError(updateResult.message));
        }
      } else {
        const users = readUsers();
        const storedUser = findUserById(users, currentUser.id);
        if (!storedUser) {
          throw new Error("이 계정은 비밀번호 변경을 지원하지 않습니다.");
        }

        const result = await updateUserPasswordHash({
          users,
          userId: currentUser.id,
          username: storedUser.username,
          currentPassword: elements.accountCurrentPassword.value,
          newPassword: elements.accountNewPassword.value,
          hashPassword,
        });

        if (!result.ok) {
          throw new Error(result.message);
        }

        saveUsers(result.users);
      }

      elements.accountSettingsForm.reset();
      setAuthMessage(elements.accountSettingsMessage, "비밀번호가 변경되었습니다.", "success");
    },
  );
}

function getRoleLabel(role) {
  const labels = {
    [ROLES.student]: "student",
    [ROLES.teacher]: "teacher",
    [ROLES.academyOwner]: "academy_owner",
    [ROLES.admin]: "admin",
  };

  return labels[normalizeRole(role)] ?? normalizeRole(role) ?? "-";
}

function clearAuthMessages() {
  setAuthMessage(elements.loginMessage, "");
  setAuthMessage(elements.signupMessage, "");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const username = normalizeAuthUsername(elements.loginUsername.value);
  const password = elements.loginPassword.value;

  if (!username || !password) {
    setAuthMessage(elements.loginMessage, "아이디와 비밀번호를 입력해 주세요.", "error");
    return;
  }

  const usernameValidation = validateAuthUsername(username);
  if (!usernameValidation.ok) {
    setAuthMessage(elements.loginMessage, usernameValidation.message, "error");
    return;
  }

  if (!isSupabaseConfigured()) {
    setAuthMessage(elements.loginMessage, "Supabase 인증 설정이 없습니다.", "error");
    return;
  }

  await runAuthRequest(elements.loginForm, elements.loginMessage, async () => {
    const signInResult = await signInWithUsernamePassword({
      username,
      password,
    });
    if (!signInResult.ok) {
      throw new Error(formatSupabaseAuthError(signInResult.message));
    }

    let appUser = mapSupabaseUserToAppUser(signInResult.user);
    debugLog(DEBUG_CHANNELS.auth, "login session established", {
      userId: appUser.id,
      role: appUser.role,
      academyId: appUser.academyId || null,
    });
    appUser = await enrichAppUserFromAcademyMember(appUser);
    const academyMember = readAcademyMembers().find((member) => member.userId === appUser.id);
    if (academyMember && !isActiveMember(academyMember)) {
      await signOutSupabase();
      throw new Error("inactive account");
    }

    storeUser(appUser);
    elements.loginPassword.value = "";
    completeAuthFlow();
  });
}

async function handleSignupSubmit(event) {
  event.preventDefault();

  if (signupSubmitInFlight) {
    setAuthMessage(elements.signupMessage, "가입 요청을 처리 중입니다. 잠시만 기다려 주세요.", "error");
    return;
  }

  const payload = getSignupPayload();

  const usernameValidation = validateAuthUsername(payload.username);
  if (!usernameValidation.ok) {
    setAuthMessage(elements.signupMessage, usernameValidation.message, "error");
    return;
  }

  const passwordValidation = validateAuthPassword(payload.password);
  if (!passwordValidation.ok) {
    setAuthMessage(elements.signupMessage, passwordValidation.message, "error");
    return;
  }

  if (!isCheckedUsernameAvailable || checkedUsername !== payload.username) {
    setAuthMessage(elements.signupMessage, "아이디 중복확인을 먼저 진행해 주세요.", "error");
    return;
  }

  const inviteCode = payload.inviteCode;

  if (!isInviteSignupEntry()) {
    if (!payload.name || !payload.phone) {
      setAuthMessage(elements.signupMessage, "이름과 연락처를 입력해 주세요.", "error");
      return;
    }

    if (payload.userType === "academy" && !payload.academyName) {
      setAuthMessage(elements.signupMessage, "학원명을 입력해 주세요.", "error");
      return;
    }
  }

  if (!isSupabaseConfigured()) {
    setAuthMessage(elements.signupMessage, "Supabase 인증 설정이 없습니다.", "error");
    return;
  }

  const invite = inviteCode ? await findInviteCode(inviteCode) : null;
  if (inviteCode && !invite) {
    setAuthMessage(elements.signupMessage, "유효하지 않은 가입 코드입니다.", "error");
    return;
  }

  signupSubmitInFlight = true;

  try {
    await runAuthRequest(elements.signupForm, elements.signupMessage, async () => {
    const isInviteLinkFlow = isInviteSignupEntry() && Boolean(invite);
    const userRole = invite?.role ?? normalizeRole(payload.userType);
    const authEmail = await usernameToAuthEmail(payload.username);
    const metadata = {
      username: payload.username,
      name: isInviteLinkFlow ? payload.username : payload.name || payload.username,
      role: userRole,
      userType: userRole,
      phone: payload.phone,
      academyId: invite?.academyId ?? "",
      academyName: invite?.academyName ?? payload.academyName,
      invitedBy: invite?.createdBy ?? "",
      inviteCode: invite?.code ?? "",
      postcode: payload.postcode,
      address: payload.address,
      addressDetail: payload.addressDetail,
    };

    const signUpResult = await signUpWithEmail({
      email: authEmail,
      password: payload.password,
      metadata,
    });

    if (!signUpResult.ok) {
      if (signUpResult.isRateLimited) {
        throw new Error(
          "회원가입 이메일 발송 한도에 걸렸습니다. Supabase에서 Confirm email을 끄고, 같은 아이디로 연속 가입하지 마세요.",
        );
      }
      throw new Error(formatSupabaseAuthError(signUpResult.message));
    }

    if (signUpResult.requiresEmailConfirmation) {
      throw new Error(
        "계정은 생성되었지만 이메일 확인 설정 때문에 로그인할 수 없습니다. Supabase Dashboard에서 Confirm email을 끄고, 같은 아이디로 다시 가입하지 마세요.",
      );
    }

    const appUser = mapSupabaseUserToAppUser(signUpResult.user);
    const appUserWithAcademy = invite
      ? {
          ...appUser,
          academyId: appUser.academyId || invite.academyId,
          academyName: appUser.academyName || invite.academyName,
          inviteCode: invite.code,
        }
      : appUser;

    if (invite) {
      const memberResult = await createAcademyMember({
        user: {
          id: appUserWithAcademy.id,
          username: appUserWithAcademy.username,
          name: appUserWithAcademy.name,
          role: userRole,
          academyId: invite.academyId,
          academyName: invite.academyName,
        },
        invite,
      });
      if (!memberResult) {
        console.warn("[Signup] academy member insert skipped", {
          userId: appUserWithAcademy.id,
          academyId: invite.academyId,
        });
      }
    }

    finishSignupSuccess({
      appUser: appUserWithAcademy,
      hasSession: Boolean(signUpResult.session),
    });
    });
  } finally {
    signupSubmitInFlight = false;
  }
}

function finishSignupSuccess({ appUser, hasSession }) {
  elements.signupPassword.value = "";
  resetUsernameCheck();

  if (hasSession) {
    storeUser(appUser);
    completeAuthFlow();
    return;
  }

  setAuthMessage(
    elements.signupMessage,
    "회원가입이 완료되었습니다. 로그인 화면으로 이동합니다.",
    "success",
  );
  closeAuthModals();

  window.setTimeout(() => {
    window.location.href = "./auth.html";
  }, 700);
}

async function checkSignupUsername() {
  const username = normalizeUsername(elements.signupUsername?.value ?? "");
  const usernameValidation = validateAuthUsername(username);

  if (!usernameValidation.ok) {
    resetUsernameCheck();
    setAuthMessage(elements.signupUsernameMessage, usernameValidation.message, "error");
    return;
  }

  if (!isSupabaseConfigured()) {
    setAuthMessage(elements.signupUsernameMessage, "Supabase 인증 설정이 없습니다.", "error");
    return;
  }

  const payload = getSignupPayload();
  const duplicateButton = elements.signupDuplicateButton;
  if (duplicateButton) {
    duplicateButton.disabled = true;
  }
  setAuthMessage(elements.signupUsernameMessage, "확인 중입니다...");

  try {
    const result = await checkSignupUsernameAvailability({ username });

    if (!result.ok) {
      resetUsernameCheck();
      setAuthMessage(elements.signupUsernameMessage, result.message, "error");
      return;
    }

    checkedUsername = username;
    isCheckedUsernameAvailable = result.available;
    setAuthMessage(
      elements.signupUsernameMessage,
      result.message,
      result.available ? "success" : "error",
    );
  } catch (error) {
    console.error("Username duplicate check failed.", error);
    resetUsernameCheck();
    setAuthMessage(elements.signupUsernameMessage, "아이디 중복확인 중 오류가 발생했습니다.", "error");
  } finally {
    if (duplicateButton) {
      duplicateButton.disabled = false;
    }
  }
}

function resetUsernameCheck() {
  checkedUsername = "";
  isCheckedUsernameAvailable = false;
  setAuthMessage(elements.signupUsernameMessage, "");
}

async function handleLogout() {
  if (isSupabaseConfigured()) {
    const result = await signOutSupabase();
    if (!result.ok) {
      console.error("Supabase sign out failed.", result.message);
    }
  }

  clearSessionUser({ redirectOnProtectedPage: requiresAuth });
}

function applyInviteSignupEntryFromUrl() {
  if (!isSignupPage) {
    inviteSignupEntry = false;
    return;
  }

  const inviteCode = getInviteCodeFromUrl();
  if (!inviteCode) {
    inviteSignupEntry = false;
    return;
  }

  inviteSignupEntry = true;
  if (elements.signupInviteCode) {
    elements.signupInviteCode.value = inviteCode;
  }
  if (elements.signupInviteCodeHidden) {
    elements.signupInviteCodeHidden.value = inviteCode;
  }
}

async function prefillInviteCodeFromUrl() {
  if (!isSignupPage || !inviteSignupEntry) {
    return;
  }

  updateInviteSignupMode();

  const inviteCode = getInviteCodeFromUrl();
  if (inviteCode && isSupabaseConfigured()) {
    const invite = await findInviteCode(inviteCode);
    if (!invite) {
      setAuthMessage(elements.signupMessage, "유효하지 않은 가입 코드입니다.", "error");
      return;
    }
  }

  setAuthMessage(
    elements.signupMessage,
    "학원 초대 링크가 적용되었습니다. 아이디와 비밀번호만 입력해 주세요.",
    "success",
  );
}

function getInviteCodeFromUrl() {
  return normalizeInviteCode(new URLSearchParams(window.location.search).get("invite") ?? "");
}

function isInviteSignupEntry() {
  return inviteSignupEntry;
}

function updateInviteSignupMode() {
  const isInviteSignup = isInviteSignupEntry();
  updateInviteSignupCopy(isInviteSignup);

  elements.signupFullOnlyFields.forEach((field) => {
    field.classList.toggle("invite-signup-hidden", isInviteSignup);
    if (field.matches("label, fieldset, .auth-form-grid, .auth-inline-field")) {
      field.querySelectorAll("input, select, textarea").forEach((input) => {
        if (isInviteSignup) {
          input.removeAttribute("required");
        } else if (input.id === "signup-name" || input.id === "signup-phone") {
          input.required = true;
        }
      });
    }
  });

  elements.signupInviteOnlyFields.forEach((field) => {
    field.classList.toggle("is-hidden", !isInviteSignup);
  });
}

function updateInviteSignupCopy(isInviteSignup) {
  if (elements.signupUsernameLabel) {
    elements.signupUsernameLabel.textContent = isInviteSignup ? "이름" : "아이디";
  }

  if (elements.signupUsername) {
    elements.signupUsername.placeholder = isInviteSignup
      ? "학생/선생님 이름을 입력해 주세요"
      : "아이디는 최소 2글자 이상";
    elements.signupUsername.autocomplete = isInviteSignup ? "name" : "username";
  }

  if (elements.signupInviteHelp && !isInviteSignup) {
    elements.signupInviteHelp.textContent =
      "초대 링크로 들어온 경우에는 별도 입력 없이 자동 적용됩니다.";
  }
}

function getSignupPayload() {
  const selectedType = document.querySelector('[name="user_type"]:checked');
  const inviteFromHidden = normalizeInviteCode(elements.signupInviteCodeHidden?.value ?? "");
  const inviteFromInput = normalizeInviteCode(elements.signupInviteCode?.value ?? "");

  return {
    username: normalizeUsername(elements.signupUsername.value),
    password: elements.signupPassword.value,
    name: elements.signupName?.value.trim() ?? "",
    phone: elements.signupPhone?.value.trim() ?? "",
    userType: selectedType?.value ?? "individual",
    academyName: elements.signupAcademyName?.value.trim() ?? "",
    inviteCode: inviteSignupEntry ? inviteFromHidden || getInviteCodeFromUrl() : inviteFromInput,
    postcode: elements.signupPostcode?.value.trim() ?? "",
    address: elements.signupAddress?.value.trim() ?? "",
    addressDetail: elements.signupAddressDetail?.value.trim() ?? "",
  };
}

function updateAcademyFieldVisibility() {
  if (!elements.academyField || isInviteSignupEntry()) {
    return;
  }

  const selectedType = document.querySelector('[name="user_type"]:checked')?.value;
  const shouldShow = selectedType === "academy";
  elements.academyField.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow && elements.signupAcademyName) {
    elements.signupAcademyName.value = "";
  }
}

async function openAddressSearch() {
  const loadResult = await loadPostcodeScript();
  if (!loadResult.ok) {
    setAuthMessage(
      elements.signupMessage,
      "주소 검색을 불러오지 못했습니다. 네트워크 확인 후 다시 시도해 주세요.",
      "error",
    );
    return;
  }

  const postcodeSearch = createPostcodeSearch();

  if (isLocalPostcodeHost()) {
    postcodeSearch.open({
      popupName: "badukPostcodeSearch",
    });
    return;
  }

  if (elements.postcodeLayer && elements.postcodeLayerContent) {
    elements.postcodeLayer.classList.remove("is-hidden");
    elements.postcodeLayerContent.innerHTML = "";
    postcodeSearch.embed(elements.postcodeLayerContent);
    return;
  }

  postcodeSearch.open();
}

function createPostcodeSearch() {
  return new window.daum.Postcode({
    width: "100%",
    height: "100%",
    submitMode: false,
    oncomplete(data) {
      elements.signupPostcode.value = data.zonecode;
      elements.signupAddress.value = data.roadAddress || data.jibunAddress;
      closeAddressSearch();
      elements.signupAddressDetail?.focus();
    },
  });
}

function isLocalPostcodeHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function openAddressSearchPopup() {
  const loadResult = await loadPostcodeScript();
  if (!loadResult.ok) {
    return;
  }

  closeAddressSearch();
  createPostcodeSearch().open({
    popupName: "badukPostcodeSearch",
  });
}

function closeAddressSearch() {
  elements.postcodeLayer?.classList.add("is-hidden");
  if (elements.postcodeLayerContent) {
    elements.postcodeLayerContent.innerHTML = "";
  }
}

function completeAuthFlow() {
  closeAuthModals();

  if (isAuthPage || isSignupPage) {
    window.location.href = "./index.html";
    return;
  }

  renderAuthStatus();
}

async function runAuthRequest(form, messageElement, request) {
  const submitButton = form?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
  }
  setAuthMessage(messageElement, "처리 중입니다...");

  try {
    await request();
  } catch (error) {
    setAuthMessage(messageElement, getFriendlyAuthError(error), "error");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

function readUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY));
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function getSessionUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name ?? "",
    role: normalizeRole(user.userType ?? user.role ?? "user"),
    academyId: user.academyId ?? "",
    academyName: user.academyName ?? "",
  };
}

function createUserId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function hashPassword(username, password) {
  const text = `${normalizeUsername(username)}:${password}`;
  if (!window.crypto?.subtle) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function storeUser(user) {
  const { email: _internalEmail, ...sessionUser } = user;
  currentUser = {
    ...sessionUser,
    loggedInAt: new Date().toISOString(),
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
  updateAdminModeVisibility();
}

function readStoredUser() {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
    return stored?.id && stored?.username ? stored : null;
  } catch {
    return null;
  }
}

function normalizeUsername(username) {
  return normalizeAuthUsername(username);
}

function setAuthMessage(element, message, type = "") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
}

function getFriendlyAuthError(error) {
  const message = error?.message ?? "";

  if (message.includes("inactive account")) {
    return "비활성화된 계정입니다. 학원에 문의해 주세요.";
  }

  return formatSupabaseAuthError(message);
}

async function resetUserPasswordForMember(userId) {
  if (!canResetMemberPassword(currentUser)) {
    return { ok: false, message: "비밀번호 초기화 권한이 없습니다." };
  }

  const member = readAcademyMembers().find((entry) => entry.userId === userId);
  const username = member?.username ?? "";

  if (userId && !String(userId).startsWith("local-")) {
    return resetSupabaseUserPassword({
      userId,
      username,
      inviteCode: member?.inviteCode ?? "",
      password: DEFAULT_RESET_PASSWORD,
    });
  }

  const users = readUsers();
  const result = await resetUserPassword({
    users,
    userId,
    password: DEFAULT_RESET_PASSWORD,
    hashPassword,
  });

  if (result.ok) {
    saveUsers(result.users);
    return {
      ok: true,
      password: DEFAULT_RESET_PASSWORD,
      message: `비밀번호가 ${DEFAULT_RESET_PASSWORD}으로 초기화되었습니다.`,
    };
  }

  return result;
}

async function updateMemberAccountForAcademy({ userId, academyId, name, username }) {
  if (!canManageMemberLifecycle(currentUser)) {
    return { ok: false, message: "계정 수정 권한이 없습니다." };
  }

  const users = readUsers();
  const result = await updateUserProfile({
    users,
    userId,
    name,
    username,
    hashPassword,
  });

  if (!result.ok) {
    return result;
  }

  saveUsers(result.users);
  updateAcademyMemberProfile({
    academyId,
    userId,
    name,
    username,
  });

  return result;
}

async function deleteMemberAccountForAcademy({ userId, academyId, member = null }) {
  if (!canManageMemberLifecycle(currentUser)) {
    return { ok: false, message: "계정 삭제 권한이 없습니다." };
  }

  const resolvedMember =
    member ??
    readAcademyMembers().find((entry) => entry.academyId === academyId && entry.userId === userId);

  if (!resolvedMember) {
    return { ok: false, message: "학원 멤버 정보를 찾을 수 없습니다." };
  }

  return deleteMemberAccountFully({
    userId,
    academyId,
    member: resolvedMember,
  });
}

})();
