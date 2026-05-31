/**
 * AI 응수형 문제 목표 — category와 분리된 교육용 의미 필드.
 * 오답 응수는 problem_goal의 반대 결과를 보여줍니다.
 */

export const PROBLEM_GOALS = [
  "capture_white_group",
  "save_black_group",
  "capture_black_group",
  "save_white_group",
];

/** @typedef {(typeof PROBLEM_GOALS)[number]} ProblemGoal */

export const PROBLEM_GOAL_LABELS = {
  capture_white_group: "백을 잡으세요",
  save_black_group: "흑을 살리세요",
  capture_black_group: "흑을 잡으세요",
  save_white_group: "백을 살리세요",
};

/** @typedef {"target_survival"|"target_capture"|"default"} WrongRevealStrategy */

/**
 * @param {unknown} value
 * @returns {value is ProblemGoal}
 */
export function isProblemGoal(value) {
  return PROBLEM_GOALS.includes(value);
}

/**
 * @param {ProblemGoal} goal
 * @returns {"white"|"black"}
 */
export function getTargetColorForGoal(goal) {
  switch (goal) {
    case "capture_white_group":
    case "save_white_group":
      return "white";
    case "save_black_group":
    case "capture_black_group":
      return "black";
    default:
      return "white";
  }
}

/**
 * DB 필드명 (target_white_group / target_black_group)
 * @param {ProblemGoal} goal
 */
export function getTargetGroupFieldForGoal(goal) {
  return getTargetColorForGoal(goal) === "black"
    ? "target_black_group"
    : "target_white_group";
}

/**
 * 오답 응수 전략 — 목표 달성 실패를 보여주는 방향
 * @param {ProblemGoal|null|undefined} goal
 * @returns {WrongRevealStrategy}
 */
export function getWrongRevealStrategy(goal) {
  switch (goal) {
    case "capture_white_group":
    case "capture_black_group":
      return "target_survival";
    case "save_black_group":
    case "save_white_group":
      return "target_capture";
    default:
      return "default";
  }
}

/**
 * problem_goal → ai_response_style (전술 가중치 프로필)
 * @param {ProblemGoal|null|undefined} goal
 * @param {string} [category]
 */
export function deriveAiResponseStyleFromGoal(goal, category = "") {
  const cat = String(category ?? "").trim();
  switch (goal) {
    case "capture_white_group":
    case "capture_black_group":
      return "escape";
    case "save_black_group":
      if (cat === "환격" || cat === "먹여치기") {
        return "snapback";
      }
      return "capture";
    case "save_white_group":
      return "capture";
    default:
      return "default";
  }
}

/**
 * @param {unknown} raw
 * @returns {ProblemGoal|null}
 */
function normalizeProblemGoalField(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value === "auto" || value === "infer") {
    return null;
  }
  return isProblemGoal(value) ? value : null;
}

/**
 * 레거시 ai_response_style + 타깃 그룹 → problem_goal 추론
 * @param {object} problem
 * @returns {ProblemGoal|null}
 */
function inferProblemGoalFromLegacy(problem) {
  const style = String(
    problem?.ai_response_style ?? problem?.aiResponseStyle ?? "",
  ).trim();

  const hasWhiteTarget =
    Array.isArray(problem?.target_white_group ?? problem?.targetWhiteGroup) &&
    (problem?.target_white_group ?? problem?.targetWhiteGroup).length > 0;
  const hasBlackTarget =
    Array.isArray(problem?.target_black_group ?? problem?.targetBlackGroup) &&
    (problem?.target_black_group ?? problem?.targetBlackGroup).length > 0;

  if (style === "escape" || style === "connect" || style === "liberty_fight") {
    if (hasBlackTarget) {
      return "capture_black_group";
    }
    return "capture_white_group";
  }

  if (style === "capture" || style === "snapback") {
    if (hasWhiteTarget && !hasBlackTarget) {
      return "save_white_group";
    }
    return "save_black_group";
  }

  if (hasWhiteTarget && !hasBlackTarget) {
    return "capture_white_group";
  }
  if (hasBlackTarget && !hasWhiteTarget) {
    return "save_black_group";
  }

  return null;
}

/**
 * @param {object} problem
 * @returns {ProblemGoal|null}
 */
export function resolveProblemGoal(problem) {
  const explicit = normalizeProblemGoalField(
    problem?.problem_goal ?? problem?.problemGoal,
  );
  if (explicit) {
    return explicit;
  }

  return inferProblemGoalFromLegacy(problem);
}

/**
 * 학생 풀이 화면에서 △ 타깃 표시 노출 여부 (기본: 표시)
 * @param {object} problem
 */
export function shouldShowTargetMarker(problem) {
  const raw = problem?.show_target_marker ?? problem?.showTargetMarker;
  if (raw === false || raw === "false" || raw === 0 || raw === "0") {
    return false;
  }
  return true;
}

/**
 * show_target_marker=false 일 때 타깃 △만 렌더에서 제거 (DB stones 유지)
 * @param {object[]} stones
 * @param {object} problem
 * @param {number} boardSize
 */
export function applyTargetMarkerVisibility(stones, problem, boardSize = 13) {
  if (shouldShowTargetMarker(problem)) {
    return stones;
  }

  const mark =
    problem?.targetWhiteMark ??
    problem?.target_white_mark ??
    problem?.targetBlackMark ??
    problem?.target_black_mark ??
    "triangle";

  const targetKeys = new Set();
  for (const field of [
    problem?.target_white_group,
    problem?.targetWhiteGroup,
    problem?.target_black_group,
    problem?.targetBlackGroup,
  ]) {
    if (!Array.isArray(field)) {
      continue;
    }
    field.forEach((entry) => {
      if (entry && Number.isInteger(entry.x) && Number.isInteger(entry.y)) {
        targetKeys.add(`${entry.x}:${entry.y}`);
      }
    });
  }

  return stones.map((stone) => {
    if (stone.mark !== mark) {
      return stone;
    }
    const key = `${stone.x}:${stone.y}`;
    if (targetKeys.size > 0 && !targetKeys.has(key)) {
      return stone;
    }
    const { mark: _removed, ...rest } = stone;
    return rest;
  });
}
