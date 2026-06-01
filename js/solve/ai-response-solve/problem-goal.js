import { resolveAiResponseStyle } from "./tactical-response-styles.js";

export const PROBLEM_GOALS = [
  "auto",
  "target_survival",
  "capture_black",
  "connect_groups",
  "sacrifice_exchange",
  "encirclement_block",
];

const GOAL_SET = new Set(PROBLEM_GOALS);
const PHASE1_ACTIVE_GOALS = new Set(["target_survival"]);

const STYLE_TO_GOAL = {
  default: "target_survival",
  escape: "target_survival",
  connect: "target_survival",
  liberty_fight: "target_survival",
  capture: "capture_black",
  sacrifice: "sacrifice_exchange",
};

const CATEGORY_TO_GOAL = {
  촉촉수: "target_survival",
  축: "target_survival",
  장문: "target_survival",
  수상전: "target_survival",
  단수치기: "capture_black",
  환격: "sacrifice_exchange",
  먹여치기: "sacrifice_exchange",
};

/**
 * @param {object} problem
 * @returns {string}
 */
export function readProblemGoalField(problem) {
  const raw = String(
    problem?.problem_goal ?? problem?.problemGoal ?? "auto",
  ).trim();
  return GOAL_SET.has(raw) ? raw : "auto";
}

/**
 * @param {object} problem
 * @returns {string}
 */
export function resolveProblemGoal(problem) {
  const explicit = readProblemGoalField(problem);
  if (explicit !== "auto") {
    return explicit;
  }

  const style = resolveAiResponseStyle(problem);
  if (STYLE_TO_GOAL[style]) {
    return STYLE_TO_GOAL[style];
  }

  const category = String(problem?.category ?? "").trim();
  if (CATEGORY_TO_GOAL[category]) {
    return CATEGORY_TO_GOAL[category];
  }

  return "target_survival";
}

/**
 * @param {object} problem
 * @returns {boolean}
 */
export function isPhase1GoalFirstEligible(problem) {
  return PHASE1_ACTIVE_GOALS.has(resolveProblemGoal(problem));
}

