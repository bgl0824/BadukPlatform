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
  DEFAULT_RESET_PASSWORD,
  deleteUserById,
  findUserById,
  resetUserPassword,
  updateUserPasswordHash,
  updateUserProfile,
  validatePasswordChange,
} from "./services/auth-service.js";
import { deleteStudentProgressByUserId } from "./services/student-progress-service.js";

(function () {
const AUTH_STORAGE_KEY = "BADUK_AUTH_USER";
const USERS_STORAGE_KEY = "BADUK_AUTH_USERS";
const PASSWORD_PATTERN = /^.{4,}$/;

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
  signupPassword: document.querySelector("#signup-password"),
  signupName: document.querySelector("#signup-name"),
  signupPhone: document.querySelector("#signup-phone"),
  signupEmail: document.querySelector("#signup-email"),
  signupAcademyName: document.querySelector("#signup-academy-name"),
  signupInviteCode: document.querySelector("#signup-invite-code"),
  signupInviteHelp: document.querySelector("#signup-invite-help"),
  signupInviteOptionalFields: document.querySelectorAll(".invite-optional-field"),
  signupPostcode: document.querySelector("#signup-postcode"),
  signupAddress: document.querySelector("#signup-address"),
  signupAddressDetail: document.querySelector("#signup-address-detail"),
  signupDuplicateButton: document.querySelector("#check-username-duplicate"),
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

let currentUser = readStoredUser();
const isAuthPage = document.body.dataset.page === "auth";
const isSignupPage = document.body.dataset.page === "signup";
const requiresAuth = document.body.dataset.requireAuth === "true";
let checkedUsername = "";
let isCheckedUsernameAvailable = false;

if (requiresAuth && !currentUser) {
  window.location.replace("./auth.html");
  return;
}

if ((isAuthPage || isSignupPage) && currentUser) {
  window.location.replace("./index.html");
  return;
}

renderAuthStatus();
updateAdminModeVisibility();
bindAuthEvents();
prefillInviteCodeFromUrl();

function bindAuthEvents() {
  elements.loginForm?.addEventListener("submit", handleLoginSubmit);
  elements.signupForm?.addEventListener("submit", handleSignupSubmit);
  elements.accountSettingsForm?.addEventListener("submit", handleAccountSettingsSubmit);
  elements.adminEntry?.addEventListener("click", enterAsAdmin);
  elements.signupDuplicateButton?.addEventListener("click", checkSignupUsername);
  elements.signupAddressButton?.addEventListener("click", openAddressSearch);
  elements.postcodeLayerClose?.addEventListener("click", closeAddressSearch);
  elements.postcodePopupButton?.addEventListener("click", openAddressSearchPopup);
  elements.postcodeLayer?.addEventListener("click", (event) => {
    if (event.target === elements.postcodeLayer) {
      closeAddressSearch();
    }
  });
  elements.signupUsername?.addEventListener("input", resetUsernameCheck);
  elements.signupInviteCode?.addEventListener("input", updateInviteSignupMode);
  elements.signupUserTypes.forEach((field) => {
    field.addEventListener("change", updateAcademyFieldVisibility);
  });
  updateAcademyFieldVisibility();
  updateInviteSignupMode();

  document.querySelectorAll("[data-auth-close]").forEach((button) => {
    button.addEventListener("click", closeAuthModals);
  });

  [elements.loginModal, elements.signupModal, elements.accountSettingsModal].forEach((modal) => {
    if (!modal) {
      return;
    }

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeAuthModals();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAuthModals();
      closeAddressSearch();
    }
  });
}

function enterAsAdmin() {
  storeUser({
    id: "local-admin",
    username: "관리자",
    role: "admin",
  });
  window.location.href = "./index.html";
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

    const settingsButton = createAuthButton("계정 설정", () => {
      openAccountSettingsModal();
    });

    const logoutButton = createAuthButton("로그아웃", () => {
      currentUser = null;
      localStorage.removeItem(AUTH_STORAGE_KEY);
      updateAdminModeVisibility();
      if (requiresAuth) {
        window.location.href = "./auth.html";
      } else {
        renderAuthStatus();
      }
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

  const isAcademyOwner = normalizeRole(currentUser.role) === ROLES.academyOwner;
  elements.accountSettingsAcademyRow?.classList.toggle("is-hidden", !isAcademyOwner);
  if (elements.accountSettingsAcademy && isAcademyOwner) {
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

  const users = readUsers();
  const storedUser = findUserById(users, currentUser.id);
  if (!storedUser) {
    setAuthMessage(
      elements.accountSettingsMessage,
      "이 계정은 비밀번호 변경을 지원하지 않습니다.",
      "error",
    );
    return;
  }

  await runAuthRequest(
    elements.accountSettingsForm,
    elements.accountSettingsMessage,
    async () => {
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
  const username = normalizeUsername(elements.loginUsername.value);
  const password = elements.loginPassword.value;

  if (!username || !password) {
    setAuthMessage(elements.loginMessage, "아이디와 비밀번호를 입력해 주세요.", "error");
    return;
  }

  await runAuthRequest(elements.loginForm, elements.loginMessage, async () => {
    const user = findUserByUsername(username);
    if (!user) {
      throw new Error("invalid credentials");
    }

    const passwordHash = await hashPassword(username, password);
    if (user.passwordHash !== passwordHash) {
      throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
    }

    const academyMember = readAcademyMembers().find((member) => member.userId === user.id);
    if (academyMember && !isActiveMember(academyMember)) {
      throw new Error("inactive account");
    }

    storeUser(getSessionUser(user));
    elements.loginPassword.value = "";
    completeAuthFlow();
  });
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  const payload = getSignupPayload();

  if (!isValidUsername(payload.username)) {
    const usernameLabel = payload.inviteCode ? "이름" : "아이디";
    setAuthMessage(
      elements.signupMessage,
      `${usernameLabel}은 공백 없이 2~24자로 입력해 주세요.`,
      "error",
    );
    return;
  }

  const invite = payload.inviteCode ? findInviteCode(payload.inviteCode) : null;
  if (payload.inviteCode && !invite) {
    setAuthMessage(elements.signupMessage, "유효하지 않은 가입 코드입니다.", "error");
    return;
  }

  if (!invite && (!isCheckedUsernameAvailable || checkedUsername !== payload.username)) {
    setAuthMessage(elements.signupMessage, "아이디 중복확인을 먼저 진행해 주세요.", "error");
    return;
  }

  if (!PASSWORD_PATTERN.test(payload.password)) {
    setAuthMessage(
      elements.signupMessage,
      "비밀번호는 4자 이상 입력해 주세요.",
      "error",
    );
    return;
  }

  if (!invite && (!payload.name || !payload.phone || !payload.email)) {
    setAuthMessage(elements.signupMessage, "이름, 연락처, 이메일을 모두 입력해 주세요.", "error");
    return;
  }

  if (!invite && payload.userType === "academy" && !payload.academyName) {
    setAuthMessage(elements.signupMessage, "학원명을 입력해 주세요.", "error");
    return;
  }

  await runAuthRequest(elements.signupForm, elements.signupMessage, async () => {
    if (findUserByUsername(payload.username)) {
      throw new Error("username already exists");
    }

    const userRole = invite?.role ?? normalizeRole(payload.userType);
    const user = {
      id: createUserId(),
      username: payload.username,
      passwordHash: await hashPassword(payload.username, payload.password),
      name: payload.name || payload.username,
      phone: payload.phone,
      email: payload.email,
      userType: userRole,
      role: userRole,
      academyId: invite?.academyId ?? "",
      academyName: invite?.academyName ?? payload.academyName,
      invitedBy: invite?.createdBy ?? "",
      inviteCode: invite?.code ?? "",
      postcode: payload.postcode,
      address: payload.address,
      addressDetail: payload.addressDetail,
      createdAt: new Date().toISOString(),
    };

    saveUsers([...readUsers(), user]);
    if (invite) {
      createAcademyMember({ user, invite });
    }
    storeUser(getSessionUser(user));
    elements.signupPassword.value = "";
    resetUsernameCheck();
    completeAuthFlow();
  });
}

async function checkSignupUsername() {
  const username = normalizeUsername(elements.signupUsername.value);

  if (!isValidUsername(username)) {
    resetUsernameCheck();
    setAuthMessage(
      elements.signupUsernameMessage,
      "아이디는 공백 없이 2~24자로 입력해 주세요.",
      "error",
    );
    return;
  }

  await runAuthRequest(elements.signupForm, elements.signupMessage, async () => {
    const isTaken = Boolean(findUserByUsername(username));
    checkedUsername = username;
    isCheckedUsernameAvailable = !isTaken;
    setAuthMessage(
      elements.signupUsernameMessage,
      isTaken ? "이미 사용 중인 아이디입니다." : "사용 가능한 아이디입니다.",
      isTaken ? "error" : "success",
    );
  });
}

function resetUsernameCheck() {
  checkedUsername = "";
  isCheckedUsernameAvailable = false;
  setAuthMessage(elements.signupUsernameMessage, "");
}

function prefillInviteCodeFromUrl() {
  if (!isSignupPage || !elements.signupInviteCode) {
    return;
  }

  const inviteCode = normalizeInviteCode(new URLSearchParams(window.location.search).get("invite") ?? "");
  if (!inviteCode) {
    return;
  }

  elements.signupInviteCode.value = inviteCode;
  updateInviteSignupMode();
  setAuthMessage(elements.signupMessage, "가입 코드가 자동 입력되었습니다. 회원 정보를 입력해 주세요.", "success");
}

function updateInviteSignupMode() {
  const isInviteSignup = Boolean(normalizeInviteCode(elements.signupInviteCode?.value ?? ""));
  updateInviteSignupCopy(isInviteSignup);
  elements.signupInviteOptionalFields.forEach((field) => {
    field.classList.toggle("invite-signup-hidden", isInviteSignup);
    field.querySelectorAll("[required]").forEach((input) => {
      if (isInviteSignup) {
        input.dataset.wasRequired = "true";
        input.required = false;
      } else if (input.dataset.wasRequired === "true") {
        input.required = true;
        delete input.dataset.wasRequired;
      }
    });
  });

  elements.signupDuplicateButton?.classList.toggle("invite-signup-hidden", isInviteSignup);
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

  if (elements.signupInviteHelp) {
    elements.signupInviteHelp.textContent = isInviteSignup
      ? "초대코드 가입자는 이름과 비밀번호만 입력하면 학원 소속으로 연결됩니다."
      : "초대 링크로 들어온 경우 아이디와 비밀번호만 입력하면 가입됩니다.";
  }
}

function getSignupPayload() {
  const selectedType = document.querySelector('[name="user_type"]:checked');
  return {
    username: normalizeUsername(elements.signupUsername.value),
    password: elements.signupPassword.value,
    name: elements.signupName?.value.trim() ?? "",
    phone: elements.signupPhone?.value.trim() ?? "",
    email: elements.signupEmail?.value.trim() ?? "",
    userType: selectedType?.value ?? "individual",
    academyName: elements.signupAcademyName?.value.trim() ?? "",
    inviteCode: normalizeInviteCode(elements.signupInviteCode?.value ?? ""),
    postcode: elements.signupPostcode?.value.trim() ?? "",
    address: elements.signupAddress?.value.trim() ?? "",
    addressDetail: elements.signupAddressDetail?.value.trim() ?? "",
  };
}

function updateAcademyFieldVisibility() {
  if (!elements.academyField) {
    return;
  }

  const selectedType = document.querySelector('[name="user_type"]:checked')?.value;
  const shouldShow = selectedType === "academy";
  elements.academyField.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow && elements.signupAcademyName) {
    elements.signupAcademyName.value = "";
  }
}

function openAddressSearch() {
  if (!window.daum?.Postcode) {
    setAuthMessage(
      elements.signupMessage,
      "주소 검색 스크립트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
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

function openAddressSearchPopup() {
  if (!window.daum?.Postcode) {
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
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setAuthMessage(messageElement, "처리 중입니다...");

  try {
    await request();
  } catch (error) {
    setAuthMessage(messageElement, getFriendlyAuthError(error), "error");
  } finally {
    submitButton.disabled = false;
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

function findUserByUsername(username) {
  return readUsers().find((user) => user.username === normalizeUsername(username));
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
  currentUser = {
    ...user,
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
  return username.trim().toLowerCase();
}

function isValidUsername(username) {
  return username.length >= 2 && username.length <= 24 && !/\s/.test(username);
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

  if (message.includes("already exists") || message.includes("duplicate")) {
    return "이미 사용 중인 아이디입니다.";
  }

  if (message.includes("invalid password")) {
    return "비밀번호는 4자 이상 입력해 주세요.";
  }

  if (message.includes("invalid credentials")) {
    return "아이디 또는 비밀번호가 올바르지 않습니다.";
  }

  if (message.includes("inactive account")) {
    return "비활성화된 계정입니다. 학원에 문의해 주세요.";
  }

  return message || "인증 처리 중 오류가 발생했습니다.";
}

async function resetUserPasswordForMember(userId) {
  if (!canResetMemberPassword(currentUser)) {
    return { ok: false, message: "비밀번호 초기화 권한이 없습니다." };
  }

  const users = readUsers();
  const result = await resetUserPassword({
    users,
    userId,
    hashPassword,
  });

  if (result.ok) {
    saveUsers(result.users);
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

async function deleteMemberAccountForAcademy({ userId, academyId }) {
  if (!canManageMemberLifecycle(currentUser)) {
    return { ok: false, message: "계정 삭제 권한이 없습니다." };
  }

  const users = readUsers();
  const authResult = deleteUserById({ users, userId });
  if (!authResult.ok) {
    return authResult;
  }

  saveUsers(authResult.users);
  const progressResult = deleteStudentProgressByUserId(userId);
  return {
    ok: true,
    removedProgressCount: progressResult.removedCount,
    academyId,
  };
}

window.BadukAuth = {
  getCurrentUser: () => currentUser,
  getStoredUsers: () => readUsers().map(({ passwordHash, ...user }) => user),
  openAccountSettings: openAccountSettingsModal,
  DEFAULT_RESET_PASSWORD,
  resetUserPassword: resetUserPasswordForMember,
  updateMemberAccount: updateMemberAccountForAcademy,
  deleteMemberAccount: deleteMemberAccountForAcademy,
};
})();
