/**
 * AI 응수 QA — 카테고리별 판정 프로필 (QA 전용)
 */

/** @typedef {"target_survival"|"capture_pressure"|"encirclement"} QaRevealGoal */

/**
 * @param {object} problem
 */
export function resolveQaCategoryProfile(problem) {
  const category = String(problem?.category ?? "").trim();
  if (category === "장문") {
    return JANGMUN_QA_PROFILE;
  }
  if (category === "먹여치기") {
    return MUKYEOCHIGI_QA_PROFILE;
  }
  return DEFAULT_QA_PROFILE;
}

/** @type {ReadonlySet<string>} */
const DEFAULT_STRONG_POSITIVES = new Set([
  "liberty_increase",
  "atari_resolved",
  "extend_atari",
  "connect_target",
  "escape_line",
  "on_target_liberty",
  "capture_threat",
]);

/** @type {ReadonlySet<string>} */
const JANGMUN_STRONG_POSITIVES = new Set([
  "in_problem_region",
  "near_target_response",
  "escape_block_candidate",
  "adjacent_target",
  "on_target_liberty",
  "capture_threat",
  "escape_line",
  "connect_target",
  "extend_atari",
  "liberty_increase",
  "katago_consensus",
]);

/** @type {ReadonlySet<string>} */
const DEFAULT_SEVERE_ALONE = new Set([
  "liberty_decreased",
  "author_sequence_leak",
  "unrelated_to_target",
]);

/** @type {ReadonlySet<string>} */
const JANGMUN_SEVERE_ALONE = new Set([
  "liberty_decreased",
  "author_sequence_leak",
]);

/** @type {ReadonlySet<string>} */
const JANGMUN_SOFT_SINGLES = new Set([
  "fallback_dependent",
  "no_liberty_change",
  "target_unprotected",
]);

const TACTICAL_OVERLAP_KEYS = [
  "no_liberty_change",
  "target_unprotected",
  "fallback_dependent",
  "unrelated_to_target",
  "meaningless_region",
  "sacrifice_off_goal",
  "style_reason_mismatch",
];

export const DEFAULT_QA_PROFILE = {
  id: "default",
  goal: /** @type {QaRevealGoal} */ ("target_survival"),
  minProblemOverlap: 2,
  goodScoreThreshold: 55,
  softSingles: /** @type {ReadonlySet<string>} */ (new Set()),
  severeAlone: DEFAULT_SEVERE_ALONE,
  strongPositives: DEFAULT_STRONG_POSITIVES,
  tacticalOverlapKeys: TACTICAL_OVERLAP_KEYS,
  penalizeNoLibertyWithTargetUnprotected: true,
  addTargetUnprotectedOnFlatLiberty: true,
  regionCandidateIsNegative: true,
  strictStyleReasonMatch: true,
  positiveWeights: {
    liberty_increase: 22,
    atari_resolved: 18,
    extend_atari: 16,
    connect_target: 14,
    escape_line: 12,
    on_target_liberty: 14,
    adjacent_target: 6,
    capture_threat: 16,
    katago_consensus: 4,
  },
  negativeWeights: {
    no_liberty_change: 22,
    liberty_decreased: 35,
    target_unprotected: 28,
    unrelated_to_target: 30,
    meaningless_region: 18,
    fallback_dependent: 12,
    style_reason_mismatch: 16,
    sacrifice_off_goal: 20,
    author_sequence_leak: 45,
    no_response: 50,
    infrastructure: 10,
  },
  qualifyProblem: qualifyDefaultProblem,
  qualifyGood: qualifyDefaultGood,
};

export const JANGMUN_QA_PROFILE = {
  id: "장문",
  goal: /** @type {QaRevealGoal} */ ("encirclement"),
  minProblemOverlap: 3,
  goodScoreThreshold: 48,
  softSingles: JANGMUN_SOFT_SINGLES,
  severeAlone: JANGMUN_SEVERE_ALONE,
  strongPositives: JANGMUN_STRONG_POSITIVES,
  tacticalOverlapKeys: TACTICAL_OVERLAP_KEYS,
  penalizeNoLibertyWithTargetUnprotected: false,
  addTargetUnprotectedOnFlatLiberty: false,
  regionCandidateIsNegative: false,
  strictStyleReasonMatch: false,
  positiveWeights: {
    in_problem_region: 18,
    near_target_response: 16,
    escape_block_candidate: 20,
    adjacent_target: 14,
    on_target_liberty: 12,
    capture_threat: 18,
    escape_line: 14,
    connect_target: 10,
    extend_atari: 10,
    liberty_increase: 6,
    atari_resolved: 8,
    katago_consensus: 6,
  },
  negativeWeights: {
    no_liberty_change: 8,
    liberty_decreased: 35,
    target_unprotected: 10,
    unrelated_to_target: 22,
    meaningless_region: 10,
    fallback_dependent: 6,
    style_reason_mismatch: 6,
    sacrifice_off_goal: 14,
    author_sequence_leak: 45,
    no_response: 50,
    infrastructure: 10,
  },
  qualifyProblem: qualifyJangmunProblem,
  qualifyGood: qualifyJangmunGood,
};

/** 먹여치기 — 장문과 유사하게 영역·압박 중심 (활로 단일 지표 과민 완화) */
export const MUKYEOCHIGI_QA_PROFILE = {
  ...JANGMUN_QA_PROFILE,
  id: "먹여치기",
  goal: /** @type {QaRevealGoal} */ ("capture_pressure"),
  minProblemOverlap: 3,
  goodScoreThreshold: 50,
};

/**
 * @param {number} score
 * @param {string[]} uniqueNeg
 */
function qualifyDefaultProblem(score, uniqueNeg) {
  if (score < 1) {
    return false;
  }

  if (uniqueNeg.some((key) => DEFAULT_SEVERE_ALONE.has(key))) {
    return true;
  }

  const tacticalCore = [
    "no_liberty_change",
    "target_unprotected",
    "fallback_dependent",
    "meaningless_region",
  ];
  const tacticalHits = uniqueNeg.filter((key) => tacticalCore.includes(key));

  if (tacticalHits.length >= 2) {
    return true;
  }

  if (
    uniqueNeg.includes("fallback_dependent") &&
    (uniqueNeg.includes("no_liberty_change") ||
      uniqueNeg.includes("target_unprotected") ||
      uniqueNeg.includes("unrelated_to_target"))
  ) {
    return true;
  }

  if (
    uniqueNeg.includes("target_unprotected") &&
    uniqueNeg.includes("no_liberty_change")
  ) {
    return true;
  }

  if (uniqueNeg.includes("target_unprotected") && score < 35) {
    return true;
  }

  if (uniqueNeg.includes("sacrifice_off_goal") && score < 40) {
    return true;
  }

  return false;
}

/**
 * @param {number} score
 * @param {string[]} uniqueNeg
 */
function qualifyJangmunProblem(score, uniqueNeg) {
  if (score < 1) {
    return false;
  }

  if (uniqueNeg.some((key) => JANGMUN_SEVERE_ALONE.has(key))) {
    return true;
  }

  const overlapHits = uniqueNeg.filter((key) => TACTICAL_OVERLAP_KEYS.includes(key));
  if (overlapHits.length >= JANGMUN_QA_PROFILE.minProblemOverlap) {
    return true;
  }

  if (
    uniqueNeg.includes("unrelated_to_target") &&
    (uniqueNeg.includes("no_liberty_change") ||
      uniqueNeg.includes("target_unprotected") ||
      uniqueNeg.includes("fallback_dependent") ||
      uniqueNeg.includes("meaningless_region"))
  ) {
    return true;
  }

  return false;
}

/**
 * @param {number} score
 * @param {string[]} uniquePos
 * @param {string[]} uniqueNeg
 * @param {typeof DEFAULT_QA_PROFILE} profile
 */
function qualifyDefaultGood(score, uniquePos, uniqueNeg, profile) {
  const hasStrongPositive = uniquePos.some((key) => profile.strongPositives.has(key));
  const highRisk = new Set([
    "no_liberty_change",
    "liberty_decreased",
    "target_unprotected",
    "unrelated_to_target",
    "fallback_dependent",
    "meaningless_region",
    "author_sequence_leak",
    "sacrifice_off_goal",
    "style_reason_mismatch",
  ]);
  const hasHighRisk = uniqueNeg.some((key) => highRisk.has(key));

  if (!hasStrongPositive || hasHighRisk) {
    return false;
  }

  return score >= profile.goodScoreThreshold;
}

/**
 * @param {number} score
 * @param {string[]} uniquePos
 * @param {string[]} uniqueNeg
 * @param {typeof JANGMUN_QA_PROFILE} profile
 */
function qualifyJangmunGood(score, uniquePos, uniqueNeg, profile) {
  const hasStrongPositive = uniquePos.some((key) => profile.strongPositives.has(key));
  if (!hasStrongPositive) {
    return false;
  }

  const blockingNegs = uniqueNeg.filter(
    (key) => !profile.softSingles.has(key) && key !== "infrastructure" && key !== "no_response",
  );
  if (blockingNegs.length === 0) {
    return score >= profile.goodScoreThreshold;
  }

  return qualifyDefaultGood(score, uniquePos, uniqueNeg, profile);
}
