(function () {
const AUTH_STORAGE_KEY = "BADUK_AUTH_USER";
const USERS_STORAGE_KEY = "BADUK_AUTH_USERS";
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,24}$/;
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
  signupUsernameMessage: document.querySelector("#signup-username-message"),
  signupPassword: document.querySelector("#signup-password"),
  signupName: document.querySelector("#signup-name"),
  signupPhone: document.querySelector("#signup-phone"),
  signupEmail: document.querySelector("#signup-email"),
  signupAcademyName: document.querySelector("#signup-academy-name"),
  signupPostcode: document.querySelector("#signup-postcode"),
  signupAddress: document.querySelector("#signup-address"),
  signupAddressDetail: document.querySelector("#signup-address-detail"),
  signupDuplicateButton: document.querySelector("#check-username-duplicate"),
  signupAddressButton: document.querySelector("#search-address"),
  signupUserTypes: document.querySelectorAll('[name="user_type"]'),
  academyField: document.querySelector("#academy-name-field"),
  loginMessage: document.querySelector("#login-message"),
  signupMessage: document.querySelector("#signup-message"),
  adminEntry: document.querySelector("#admin-entry"),
  adminModeToggle: document.querySelector("#admin-mode-toggle"),
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

function bindAuthEvents() {
  elements.loginForm?.addEventListener("submit", handleLoginSubmit);
  elements.signupForm?.addEventListener("submit", handleSignupSubmit);
  elements.adminEntry?.addEventListener("click", enterAsAdmin);
  elements.signupDuplicateButton?.addEventListener("click", checkSignupUsername);
  elements.signupAddressButton?.addEventListener("click", openAddressSearch);
  elements.signupUsername?.addEventListener("input", resetUsernameCheck);
  elements.signupUserTypes.forEach((field) => {
    field.addEventListener("change", updateAcademyFieldVisibility);
  });
  updateAcademyFieldVisibility();

  document.querySelectorAll("[data-auth-close]").forEach((button) => {
    button.addEventListener("click", closeAuthModals);
  });

  [elements.loginModal, elements.signupModal].forEach((modal) => {
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
    welcome.textContent = `${currentUser.username}님 환영합니다`;

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

    elements.statusBar.append(welcome, logoutButton);
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

  const canUseAdminMode = currentUser?.role === "admin";
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

    storeUser(getSessionUser(user));
    elements.loginPassword.value = "";
    completeAuthFlow();
  });
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  const payload = getSignupPayload();

  if (!USERNAME_PATTERN.test(payload.username)) {
    setAuthMessage(
      elements.signupMessage,
      "아이디는 영문, 숫자, 밑줄만 사용해 2~24자로 입력해 주세요.",
      "error",
    );
    return;
  }

  if (!isCheckedUsernameAvailable || checkedUsername !== payload.username) {
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

  if (!payload.name || !payload.phone || !payload.email) {
    setAuthMessage(elements.signupMessage, "이름, 연락처, 이메일을 모두 입력해 주세요.", "error");
    return;
  }

  if (payload.userType === "academy" && !payload.academyName) {
    setAuthMessage(elements.signupMessage, "학원명을 입력해 주세요.", "error");
    return;
  }

  await runAuthRequest(elements.signupForm, elements.signupMessage, async () => {
    if (findUserByUsername(payload.username)) {
      throw new Error("username already exists");
    }

    const user = {
      id: createUserId(),
      username: payload.username,
      passwordHash: await hashPassword(payload.username, payload.password),
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      userType: payload.userType,
      academyName: payload.academyName,
      postcode: payload.postcode,
      address: payload.address,
      addressDetail: payload.addressDetail,
      createdAt: new Date().toISOString(),
    };

    saveUsers([...readUsers(), user]);
    storeUser(getSessionUser(user));
    elements.signupPassword.value = "";
    resetUsernameCheck();
    completeAuthFlow();
  });
}

async function checkSignupUsername() {
  const username = normalizeUsername(elements.signupUsername.value);

  if (!USERNAME_PATTERN.test(username)) {
    resetUsernameCheck();
    setAuthMessage(
      elements.signupUsernameMessage,
      "아이디는 영문, 숫자, 밑줄만 사용해 2~24자로 입력해 주세요.",
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

  new window.daum.Postcode({
    oncomplete(data) {
      elements.signupPostcode.value = data.zonecode;
      elements.signupAddress.value = data.roadAddress || data.jibunAddress;
      elements.signupAddressDetail?.focus();
    },
  }).open();
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
    role: user.userType ?? user.role ?? "user",
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

  return message || "인증 처리 중 오류가 발생했습니다.";
}

window.BadukAuth = {
  getCurrentUser: () => currentUser,
  getStoredUsers: () => readUsers().map(({ passwordHash, ...user }) => user),
};
})();
