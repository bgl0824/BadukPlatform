import { normalizeRole, ROLES } from "../permissions/permission-service.js";

const STUDENT_PROGRESS_STORAGE_KEY = "BADUK_STUDENT_PROGRESS";

export const PROGRESS_STATUS = {
  notStarted: "NOT_STARTED",
  inProgress: "IN_PROGRESS",
  solved: "SOLVED",
};

export function readStudentProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem(STUDENT_PROGRESS_STORAGE_KEY));
    return Array.isArray(progress) ? progress.map(normalizeProgress) : [];
  } catch {
    return [];
  }
}

export function saveStudentProgress(progress) {
  localStorage.setItem(STUDENT_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function recordWrongMove({ user, problem, move, moveNumber }) {
  if (!canRecordStudentProgress(user) || !problem?.id || !move) {
    return null;
  }

  const now = new Date().toISOString();
  return upsertStudentProgress(user, problem, (progress) => {
    const withAttempt = ensureCurrentAttempt(progress, now);
    const attempts = [...withAttempt.attempts];
    const currentIndex = attempts.length - 1;

    if (currentIndex < 0) {
      return withAttempt;
    }

    const currentAttempt = attempts[currentIndex];
    const wrongMove = {
      x: move.x,
      y: move.y,
      moveNumber,
      playedAt: now,
    };

    attempts[currentIndex] = {
      ...currentAttempt,
      wrongCount: (currentAttempt.wrongCount ?? 0) + 1,
      wrongMoves: [...(currentAttempt.wrongMoves ?? []), wrongMove],
    };

    return syncSummaryFromLatestAttempt({
      ...withAttempt,
      attempts,
      updatedAt: now,
      reviewResolved: false,
      reviewDeleted: false,
    });
  });
}

export function markReviewResolved({ user, problem }) {
  if (!canRecordStudentProgress(user) || !problem?.id) {
    return null;
  }

  const now = new Date().toISOString();
  return upsertStudentProgress(user, problem, (progress) => ({
    ...progress,
    reviewResolved: true,
    reviewCompletedAt: now,
    updatedAt: now,
  }));
}

export function isReviewResolved(progress) {
  return Boolean(progress?.reviewResolved);
}

export function isReviewArchived(progress) {
  return Boolean(progress?.reviewArchived);
}

export function isReviewDeleted(progress) {
  return Boolean(progress?.reviewDeleted);
}

export function updateStudentProgressRecord(studentUserId, problemId, updater) {
  if (!studentUserId || !problemId || typeof updater !== "function") {
    return null;
  }

  const progressId = createProgressId(studentUserId, problemId);
  const allProgress = readStudentProgress();
  const existingProgress = allProgress.find((progress) => progress.id === progressId);

  if (!existingProgress) {
    return null;
  }

  const nextProgress = updater(normalizeProgress(existingProgress));
  const nextProgressList = [
    nextProgress,
    ...allProgress.filter((progress) => progress.id !== progressId),
  ];

  saveStudentProgress(nextProgressList);
  return nextProgress;
}

export function setReviewArchivedForStudent({ studentUserId, problemId, archived = true }) {
  const now = new Date().toISOString();
  return updateStudentProgressRecord(studentUserId, problemId, (progress) => ({
    ...progress,
    reviewArchived: archived,
    reviewArchivedAt: archived ? now : null,
    updatedAt: now,
  }));
}

export function setReviewDeletedForStudent({ studentUserId, problemId }) {
  const now = new Date().toISOString();
  return updateStudentProgressRecord(studentUserId, problemId, (progress) => ({
    ...progress,
    reviewDeleted: true,
    reviewDeletedAt: now,
    updatedAt: now,
  }));
}

export function markProblemInProgress({ user, problem }) {
  if (!canRecordStudentProgress(user) || !problem?.id) {
    return null;
  }

  const now = new Date().toISOString();
  return upsertStudentProgress(user, problem, (progress) => {
    const withAttempt = ensureCurrentAttempt(progress, now);
    return syncSummaryFromLatestAttempt({
      ...withAttempt,
      updatedAt: now,
    });
  });
}

export function markProblemSolved({ user, problem }) {
  if (!canRecordStudentProgress(user) || !problem?.id) {
    return null;
  }

  const now = new Date().toISOString();
  return upsertStudentProgress(user, problem, (progress) => {
    const withAttempt = ensureCurrentAttempt(progress, now);
    const attempts = [...withAttempt.attempts];
    const currentIndex = attempts.length - 1;

    if (currentIndex < 0) {
      return withAttempt;
    }

    attempts[currentIndex] = {
      ...attempts[currentIndex],
      solvedAt: now,
    };

    return syncSummaryFromLatestAttempt({
      ...withAttempt,
      attempts,
      updatedAt: now,
    });
  });
}

export function getStudentProgressByUserId(userId) {
  return readStudentProgress()
    .filter((progress) => progress.userId === userId)
    .sort((left, right) => {
      return new Date(right.updatedAt ?? right.solvedAt ?? 0).getTime() -
        new Date(left.updatedAt ?? left.solvedAt ?? 0).getTime();
    });
}

export function deleteStudentProgressByUserId(userId) {
  if (!userId) {
    return { removedCount: 0 };
  }

  const allProgress = readStudentProgress();
  const nextProgress = allProgress.filter((progress) => progress.userId !== userId);
  const removedCount = allProgress.length - nextProgress.length;
  saveStudentProgress(nextProgress);
  return { removedCount };
}

export function getStudentProgressSummary(userId, totalProblemCount = 0) {
  const progressList = getStudentProgressByUserId(userId);
  const solvedProblemCount = progressList.filter((progress) => {
    return getProgressStatus(progress) === PROGRESS_STATUS.solved;
  }).length;
  const inProgressProblemCount = progressList.filter((progress) => {
    return getProgressStatus(progress) === PROGRESS_STATUS.inProgress;
  }).length;
  const progressRate = totalProblemCount > 0
    ? Math.round((solvedProblemCount / totalProblemCount) * 100)
    : 0;
  const recentProgress = progressList[0];

  return {
    level: "급수 미정",
    progressRate,
    totalProblemCount,
    solvedProblemCount,
    inProgressProblemCount,
    notStartedProblemCount: Math.max(0, totalProblemCount - progressList.length),
    recentCategory: recentProgress?.category || "기록 없음",
  };
}

export function getProgressStatus(progress) {
  if (progress?.status) {
    return progress.status;
  }

  return progress?.solved ? PROGRESS_STATUS.solved : PROGRESS_STATUS.inProgress;
}

export function getAttempts(progress) {
  if (!progress) {
    return [];
  }

  if (Array.isArray(progress.attempts)) {
    return progress.attempts;
  }

  return normalizeProgress(progress)?.attempts ?? [];
}

export function getLatestAttempt(progress) {
  const attempts = progress?.attempts;
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return null;
  }

  return attempts[attempts.length - 1];
}

export function getCurrentAttempt(progress) {
  const latestAttempt = getLatestAttempt(progress);
  return latestAttempt?.solvedAt ? null : latestAttempt;
}

function upsertStudentProgress(user, problem, updateProgress) {
  const allProgress = readStudentProgress();
  const progressId = createProgressId(user.id, problem.id);
  const existingProgress = allProgress.find((progress) => progress.id === progressId);
  const baseProgress = existingProgress
    ? normalizeProgress(existingProgress)
    : createStudentProgress(user, problem, progressId);
  const nextProgress = updateProgress(baseProgress);
  const nextProgressList = [
    nextProgress,
    ...allProgress.filter((progress) => progress.id !== progressId),
  ];

  saveStudentProgress(nextProgressList);
  return nextProgress;
}

function createStudentProgress(user, problem, progressId) {
  const now = new Date().toISOString();
  const progress = {
    id: progressId,
    userId: user.id,
    academyId: user.academyId,
    problemId: problem.id,
    problemTitle: problem.title ?? "",
    category: problem.category ?? "",
    status: PROGRESS_STATUS.inProgress,
    solved: false,
    wrongCount: 0,
    wrongMoves: [],
    solvedAt: null,
    attempts: [],
    reviewResolved: false,
    reviewCompletedAt: null,
    reviewArchived: false,
    reviewArchivedAt: null,
    reviewDeleted: false,
    reviewDeletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  return syncSummaryFromLatestAttempt(progress);
}

function ensureCurrentAttempt(progress, now) {
  const attempts = Array.isArray(progress.attempts) ? [...progress.attempts] : [];
  const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

  if (latestAttempt && !latestAttempt.solvedAt) {
    return progress;
  }

  return {
    ...progress,
    attempts: [...attempts, createAttempt(now)],
  };
}

function createAttempt(startedAt) {
  return {
    startedAt,
    solvedAt: null,
    wrongCount: 0,
    wrongMoves: [],
  };
}

function syncSummaryFromLatestAttempt(progress) {
  const latestAttempt = getLatestAttempt(progress);

  if (!latestAttempt) {
    return {
      ...progress,
      status: PROGRESS_STATUS.notStarted,
      solved: false,
      wrongCount: 0,
      wrongMoves: [],
      solvedAt: null,
    };
  }

  const isSolved = Boolean(latestAttempt.solvedAt);

  return {
    ...progress,
    status: isSolved ? PROGRESS_STATUS.solved : PROGRESS_STATUS.inProgress,
    solved: isSolved,
    wrongCount: latestAttempt.wrongCount ?? 0,
    wrongMoves: [...(latestAttempt.wrongMoves ?? [])],
    solvedAt: latestAttempt.solvedAt ?? null,
  };
}

function normalizeProgress(progress) {
  if (!progress) {
    return progress;
  }

  if (Array.isArray(progress.attempts)) {
    return syncSummaryFromLatestAttempt({
      ...progress,
      attempts: progress.attempts.filter((attempt) => Boolean(attempt?.startedAt)),
      reviewResolved: Boolean(progress.reviewResolved),
      reviewCompletedAt: progress.reviewCompletedAt ?? null,
      reviewArchived: Boolean(progress.reviewArchived),
      reviewArchivedAt: progress.reviewArchivedAt ?? null,
      reviewDeleted: Boolean(progress.reviewDeleted),
      reviewDeletedAt: progress.reviewDeletedAt ?? null,
    });
  }

  const legacyStartedAt = progress.createdAt ?? progress.updatedAt ?? new Date().toISOString();
  const legacyAttempt = {
    startedAt: legacyStartedAt,
    solvedAt: progress.solvedAt ?? null,
    wrongCount: progress.wrongCount ?? 0,
    wrongMoves: (progress.wrongMoves ?? []).map((move) => ({
      x: move.x,
      y: move.y,
      moveNumber: move.moveNumber,
      playedAt: move.playedAt ?? legacyStartedAt,
    })),
  };

  return syncSummaryFromLatestAttempt({
    ...progress,
    attempts: [legacyAttempt],
    reviewResolved: Boolean(progress.reviewResolved),
    reviewCompletedAt: progress.reviewCompletedAt ?? null,
    reviewArchived: Boolean(progress.reviewArchived),
    reviewArchivedAt: progress.reviewArchivedAt ?? null,
    reviewDeleted: Boolean(progress.reviewDeleted),
    reviewDeletedAt: progress.reviewDeletedAt ?? null,
  });
}

function canRecordStudentProgress(user) {
  if (!user?.id || normalizeRole(user.role) !== ROLES.student) {
    return false;
  }

  if (String(user.academyId ?? "").trim()) {
    return true;
  }

  try {
    const members = JSON.parse(localStorage.getItem("BADUK_ACADEMY_MEMBERS"));
    return (
      Array.isArray(members) &&
      members.some((member) => member.userId === user.id && member.academyId)
    );
  } catch {
    return false;
  }
}

function createProgressId(userId, problemId) {
  return `student-progress-${userId}-${problemId}`;
}

export const studentProgressService = {
  readStudentProgress,
  saveStudentProgress,
  markProblemInProgress,
  recordWrongMove,
  markProblemSolved,
  markReviewResolved,
  isReviewResolved,
  isReviewArchived,
  isReviewDeleted,
  updateStudentProgressRecord,
  setReviewArchivedForStudent,
  setReviewDeletedForStudent,
  getStudentProgressByUserId,
  getStudentProgressSummary,
  getProgressStatus,
  getAttempts,
  getLatestAttempt,
  getCurrentAttempt,
};
