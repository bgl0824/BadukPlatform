import {
  buildTeacherAssignmentMatchIds,
  isActiveMember,
  isStudentAssignedToTeacher,
  normalizeAcademyMemberRole,
  readAcademyMembers,
  resolveAcademyScopeId,
} from "./academy-service.js";
import {
  buildMonthKey,
  getActivePeriods,
  getClosestActivePeriod,
  getTodayDateKey,
  isAttendanceMarked,
} from "./attendance-service.js";
import { getStudentAcademyCardSummary } from "./student-academy-profile-service.js";
import { getStudentCurriculumOverview } from "./student-curriculum-progress-service.js";
import { getStudentProjectedGradeSummary } from "./student-growth-report-service.js";
import { getStudentLearningDiagnostics } from "./student-learning-diagnostics-service.js";
import { getStudentProgressByUserId } from "./student-progress-service.js";

function isSameLocalDate(value, target = new Date()) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  );
}

export function formatHomeRecentActivityLabel(activityAt) {
  if (!activityAt) {
    return "기록 없음";
  }

  const parsed = new Date(activityAt);
  if (Number.isNaN(parsed.getTime())) {
    return "기록 없음";
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${month}.${day} ${hours}:${minutes}`;
}

export function getTeacherAssignedStudentMembers(currentUser, members = readAcademyMembers()) {
  const academyId = resolveAcademyScopeId(currentUser);
  if (!academyId || !currentUser?.id) {
    return [];
  }

  const teacherMembers = members.filter(
    (member) => normalizeAcademyMemberRole(member.role) === "teacher" && isActiveMember(member),
  );
  const matchIds = buildTeacherAssignmentMatchIds(currentUser, teacherMembers);

  return members.filter(
    (member) =>
      normalizeAcademyMemberRole(member.role) === "student" &&
      isActiveMember(member) &&
      String(member.academyId ?? "") === String(academyId) &&
      isStudentAssignedToTeacher(member, matchIds),
  );
}

function aggregateLearningMetricsForStudents(studentIds, today = new Date()) {
  let solveAttempts = 0;
  let solvedAttempts = 0;
  const learningStudentSet = new Set();
  const wrongTodayByStudent = new Set();
  const reviewNeededByStudent = new Set();

  studentIds.forEach((studentId) => {
    const normalizedStudentId = String(studentId);
    const diagnostics = getStudentLearningDiagnostics(normalizedStudentId);
    if (Number(diagnostics.reviewNeededCount ?? 0) > 0) {
      reviewNeededByStudent.add(normalizedStudentId);
    }

    const progressList = getStudentProgressByUserId(normalizedStudentId);
    progressList.forEach((progress) => {
      const attempts = Array.isArray(progress.attempts) ? progress.attempts : [];
      attempts.forEach((attempt) => {
        if (isSameLocalDate(attempt?.startedAt, today)) {
          solveAttempts += 1;
          learningStudentSet.add(normalizedStudentId);
        }
        if (isSameLocalDate(attempt?.solvedAt, today)) {
          solvedAttempts += 1;
        }

        const wrongMoves = Array.isArray(attempt?.wrongMoves) ? attempt.wrongMoves : [];
        wrongMoves.forEach((move) => {
          if (isSameLocalDate(move?.playedAt, today)) {
            wrongTodayByStudent.add(normalizedStudentId);
          }
        });
      });
    });
  });

  return {
    solveAttempts,
    solvedAttempts,
    learningStudentCount: learningStudentSet.size,
    recentWrongStudentCount: wrongTodayByStudent.size,
    reviewNeededStudentCount: reviewNeededByStudent.size,
    learningStudentSet,
  };
}

function aggregateAttendanceMetricsForStudents(academyId, studentIds, today = new Date()) {
  const monthKey = buildMonthKey(today.getFullYear(), today.getMonth() + 1);
  const todayDateKey = getTodayDateKey(today);
  const activePeriods = getActivePeriods(academyId);
  const periodIds = activePeriods.map((period) => period.id);

  let presentStudents = 0;
  studentIds.forEach((studentId) => {
    const attended = periodIds.some((periodId) =>
      isAttendanceMarked(academyId, monthKey, studentId, todayDateKey, periodId),
    );
    if (attended) {
      presentStudents += 1;
    }
  });

  return {
    presentStudents,
    absentStudents: Math.max(0, studentIds.length - presentStudents),
    currentPeriodName: getClosestActivePeriod(academyId, today)?.name ?? "-",
  };
}

export function buildTeacherHomeMetrics({ academyId, studentMembers }) {
  const today = new Date();
  const studentIds = studentMembers.map((member) => String(member.userId ?? "")).filter(Boolean);
  const learning = aggregateLearningMetricsForStudents(studentIds, today);
  const attendance = aggregateAttendanceMetricsForStudents(academyId, studentIds, today);

  const notLearnedCount = Math.max(0, studentIds.length - learning.learningStudentCount);
  const todos = [];

  if (learning.reviewNeededStudentCount > 0) {
    todos.push(`복습 필요한 학생 ${learning.reviewNeededStudentCount}명`);
  }
  if (notLearnedCount > 0) {
    todos.push(`아직 학습하지 않은 학생 ${notLearnedCount}명`);
  }
  if (attendance.absentStudents > 0) {
    todos.push(`미출석 학생 ${attendance.absentStudents}명`);
  }

  return {
    attendance: {
      presentStudents: attendance.presentStudents,
      absentStudents: attendance.absentStudents,
      currentPeriodName: attendance.currentPeriodName,
    },
    learning: {
      activeStudents: learning.learningStudentCount,
      solveAttempts: learning.solveAttempts,
      accuracyRate:
        learning.solveAttempts > 0 ? (learning.solvedAttempts / learning.solveAttempts) * 100 : 0,
    },
    review: {
      studentCount: learning.reviewNeededStudentCount,
    },
    wrong: {
      studentCount: learning.recentWrongStudentCount,
    },
    todos,
  };
}

export function buildStudentHomeMetrics(userId, problems = []) {
  const today = new Date();
  const progressList = getStudentProgressByUserId(userId);
  let todayAttempts = 0;
  let todaySolved = 0;

  progressList.forEach((progress) => {
    const attempts = Array.isArray(progress.attempts) ? progress.attempts : [];
    attempts.forEach((attempt) => {
      if (isSameLocalDate(attempt?.startedAt, today)) {
        todayAttempts += 1;
      }
      if (isSameLocalDate(attempt?.solvedAt, today)) {
        todaySolved += 1;
      }
    });
  });

  const diagnostics = getStudentLearningDiagnostics(userId);
  const curriculum = getStudentCurriculumOverview(userId, problems);
  const projected = getStudentProjectedGradeSummary(userId, problems);
  const academySummary = getStudentAcademyCardSummary(userId, problems);

  return {
    learning: {
      assignedCount: todayAttempts,
      solvedCount: todayAttempts,
      correctCount: todaySolved,
      accuracyRate: todayAttempts > 0 ? (todaySolved / todayAttempts) * 100 : 0,
    },
    curriculum: {
      activeLevelGroup: curriculum.activeLevelGroup ?? academySummary.activeLevelGroup ?? "입문",
      statusLabel: curriculum.activeLevelGroupStatusLabel ?? academySummary.statusLabel ?? "시작 전",
      percent: curriculum.activeLevelGroupPercent ?? academySummary.activeLevelGroupPercent ?? 0,
    },
    projectedGradeLabel: projected.projectedGradeLabel ?? academySummary.projectedGradeLabel ?? "산정 중",
    recent: {
      category: diagnostics.recentCategory ?? "기록 없음",
      activityAtLabel: formatHomeRecentActivityLabel(diagnostics.recentActivityAt),
    },
    wrongNotes: {
      wrongNoteCount: Number(diagnostics.wrongNoteCount ?? 0),
      reviewNeededCount: Number(diagnostics.reviewNeededCount ?? 0),
    },
  };
}
