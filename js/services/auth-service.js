export const PASSWORD_MIN_LENGTH = 4;
export const DEFAULT_RESET_PASSWORD = "0000";

export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, message: "모든 비밀번호 항목을 입력해 주세요." };
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상 입력해 주세요.`,
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
