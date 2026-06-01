/**
 * AI 응수 QA — 응수 품질 점수·자동 판정 (QA 전용, 엔진 미수정)
 */

import { collectConnectedGroup, countGroupLiberties } from "../game/capture.js";
import { getNeighborPoints, getStoneAtPoint, pointKey } from "../game/rules.js";
import { resolveAiResponseStyle } from "../solve/ai-response-solve/tactical-response-styles.js";
import { TACTICAL_FALLBACK_SOURCE } from "../solve/ai-response-solve/wrong-response-fallback.js";
import { isSurvivalSelectedReason } from "./ai-response-qa-labels.js";
import {
  DEFAULT_QA_PROFILE,
  resolveQaCategoryProfile,
} from "./ai-response-qa-quality-profiles.js";

/** @typedef {"good"|"review"|"problem"} QaQualityVerdict */

export const POSITIVE_FACTOR_LABELS = {
  liberty_increase: "활로 증가",
  atari_resolved: "단수 해소",
  extend_atari: "활로 연장 (단수 대응)",
  connect_target: "타깃 그룹 연결",
  escape_line: "도망·활로 확보",
  on_target_liberty: "타깃 활로 착点",
  adjacent_target: "타깃 인접 응수",
  capture_threat: "흑 압박·포획 위협",
  katago_consensus: "KataGo 선택",
  in_problem_region: "문제 영역 내부 응수",
  near_target_response: "target 주변 응수",
  escape_block_candidate: "도망로 차단 후보",
};

export const NEGATIVE_FACTOR_LABELS = {
  no_liberty_change: "활로 변화 없음",
  liberty_decreased: "타깃 활로 감소",
  target_unprotected: "target 그룹 보호 실패",
  unrelated_to_target: "target과 무관",
  meaningless_region: "의미 없는 지역 응수",
  fallback_dependent: "fallback 의존",
  style_reason_mismatch: "스타일·reason 불일치",
  sacrifice_off_goal: "희생·교환 (목표와 불일치)",
  author_sequence_leak: "정답 수순 백 수 노출",
  no_response: "AI 응수 없음",
  infrastructure: "API/타임아웃/영역 이탈",
};

const SURVIVAL_STYLES = new Set(["escape", "connect", "liberty_fight", "default"]);
const CAPTURE_STYLES = new Set(["capture"]);

/** 문제 있음 판정에 쓰는 전술·품질 감점 (infrastructure/no_response 제외) */
const HIGH_RISK_NEGATIVES = new Set([
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

function minBlackLiberties(stones, boardSize, stoneColors) {
  const groups = [];
  const visited = new Set();
  for (const stone of stones) {
    if (stone.color !== stoneColors.black) {
      continue;
    }
    const key = pointKey(stone);
    if (visited.has(key)) {
      continue;
    }
    const group = collectConnectedGroup(stones, stone, boardSize);
    group.forEach((s) => visited.add(pointKey(s)));
    groups.push(group);
  }
  if (groups.length === 0) {
    return 99;
  }
  return Math.min(...groups.map((g) => countGroupLiberties(stones, g, boardSize)));
}

function countCapturesBetween(beforeStones, afterStones, stoneColors) {
  const before = beforeStones.filter((s) => s.color === stoneColors.black).length;
  const after = afterStones.filter((s) => s.color === stoneColors.black).length;
  return Math.max(0, before - after);
}

function inferWrongRevealGoal(problem, profile) {
  if (profile?.goal) {
    return profile.goal;
  }
  const style = resolveAiResponseStyle(problem);
  if (CAPTURE_STYLES.has(style)) {
    return "capture_pressure";
  }
  if (SURVIVAL_STYLES.has(style) || style === "sacrifice") {
    return "target_survival";
  }
  return "target_survival";
}

/**
 * @param {object} params
 * @returns {{
 *   score: number,
 *   verdict: QaQualityVerdict,
 *   positives: string[],
 *   negatives: string[],
 *   problemReasons: string[],
 *   positiveLabels: string[],
 *   negativeLabels: string[],
 *   goal: string,
 * }}
 */
export function evaluateResponseQuality({
  problem,
  response,
  selectedReason,
  targetDiagnostics,
  classification,
  stonesBeforeWhite,
  stonesAfterWhite,
  whiteApplied,
  boardSize,
  stoneColors,
}) {
  const profile = resolveQaCategoryProfile(problem);
  const goal = inferWrongRevealGoal(problem, profile);
  const style = response?.aiResponseStyle ?? resolveAiResponseStyle(problem);
  const positives = [];
  const negatives = [];

  const issues = classification?.issues ?? [];
  if (issues.includes("author_white_match")) {
    negatives.push("author_sequence_leak");
  }
  if (issues.includes("no_response")) {
    negatives.push("no_response");
  }
  if (
    issues.includes("api_disabled") ||
    issues.includes("timeout") ||
    issues.includes("out_of_region")
  ) {
    negatives.push("infrastructure");
  }
  if (issues.includes("used_fallback") || response?.source === TACTICAL_FALLBACK_SOURCE) {
    negatives.push("fallback_dependent");
  }
  if (issues.includes("far_from_target")) {
    negatives.push("unrelated_to_target");
  }

  if (!response?.ok || !response?.point) {
    const score = 0;
    return finalizeQuality(score, positives, negatives, goal, profile);
  }

  if (profile.id === "장문" && !issues.includes("out_of_region")) {
    positives.push("in_problem_region");
  }

  const gain = targetDiagnostics?.libertyGain;
  const hasTarget = targetDiagnostics?.hasTarget;
  const libertiesBefore = targetDiagnostics?.libertiesBefore;
  const libertiesAfter = targetDiagnostics?.libertiesAfter;
  const onTargetLiberty = targetDiagnostics?.selectedOnTargetLiberty;
  const matchedAs = onTargetLiberty?.matchedAs;

  if (hasTarget && gain != null) {
    if (gain > 0) {
      positives.push("liberty_increase");
      if (libertiesBefore != null && libertiesBefore <= 1 && libertiesAfter != null && libertiesAfter >= 2) {
        positives.push("atari_resolved");
      }
    } else if (gain === 0) {
      negatives.push("no_liberty_change");
      if (profile.addTargetUnprotectedOnFlatLiberty && goal === "target_survival") {
        negatives.push("target_unprotected");
      }
    } else if (gain < 0) {
      negatives.push("liberty_decreased");
      negatives.push("target_unprotected");
    }
  }

  if (selectedReason === "forced_extend_atari") {
    if (matchedAs === "sole_liberty_of_group" || matchedAs === "one_of_liberties") {
      positives.push("extend_atari");
      positives.push("on_target_liberty");
    }
  } else if (
    selectedReason === "connect_target_group" ||
    selectedReason === "connect_target_groups" ||
    selectedReason === "merge_target_groups"
  ) {
    positives.push("connect_target");
  } else if (
    selectedReason === "capture_to_survive" ||
    selectedReason === "capture_adjacent_black" ||
    selectedReason === "create_liberty_by_capture"
  ) {
    positives.push("capture_threat");
    if (selectedReason === "capture_to_survive") {
      positives.push("liberty_increase");
    }
  } else if (
    selectedReason === "continuous_escape" ||
    selectedReason === "future_liberty_gain"
  ) {
    positives.push("escape_line");
  } else if (selectedReason === "region_candidate" || selectedReason === "near_last_black") {
    const katagoOk = response?.source === "katago" && !response?.usedLocalFallback;
    const nearTarget =
      positives.includes("adjacent_target") ||
      positives.includes("on_target_liberty") ||
      positives.includes("capture_threat");
    if (profile.regionCandidateIsNegative && !(katagoOk && nearTarget)) {
      negatives.push("meaningless_region");
    } else {
      positives.push("escape_block_candidate");
    }
  } else if (selectedReason === "sacrifice_play") {
    negatives.push("sacrifice_off_goal");
  }

  if (onTargetLiberty && !positives.includes("on_target_liberty")) {
    if (matchedAs === "sole_liberty_of_group" || matchedAs === "one_of_liberties") {
      positives.push("on_target_liberty");
    }
  } else if (
    hasTarget &&
    response?.point &&
    !issues.includes("far_from_target") &&
    !positives.includes("on_target_liberty")
  ) {
    positives.push("adjacent_target");
    if (profile.id === "장문") {
      positives.push("near_target_response");
    }
  }

  if (profile.strictStyleReasonMatch && goal === "target_survival" && SURVIVAL_STYLES.has(style)) {
    if (
      !isSurvivalSelectedReason(selectedReason) &&
      selectedReason !== "forced_extend_atari" &&
      selectedReason !== "capture_black" &&
      selectedReason !== "capture_black_group" &&
      !isSurvivalSelectedReason(selectedReason)
    ) {
      negatives.push("style_reason_mismatch");
    }
  }

  if (whiteApplied?.stones) {
    const blackCaptured = countCapturesBetween(
      stonesBeforeWhite,
      stonesAfterWhite,
      stoneColors,
    );
    const blackLibDrop =
      minBlackLiberties(stonesBeforeWhite, boardSize, stoneColors) -
      minBlackLiberties(stonesAfterWhite, boardSize, stoneColors);

    if (
      blackCaptured > 0 ||
      blackLibDrop > 0 ||
      selectedReason === "capture_black" ||
      selectedReason === "capture_black_group"
    ) {
      positives.push("capture_threat");
    }
  }

  if (response?.source === "katago" && !response?.usedLocalFallback) {
    positives.push("katago_consensus");
  }

  let score = 50;
  const positiveWeights = profile.positiveWeights;
  const negativeWeights = profile.negativeWeights;

  for (const key of positives) {
    score += positiveWeights[key] ?? 8;
  }
  for (const key of negatives) {
    score -= negativeWeights[key] ?? 10;
  }

  if (
    profile.penalizeNoLibertyWithTargetUnprotected &&
    goal === "target_survival" &&
    hasTarget &&
    gain != null &&
    gain <= 0 &&
    !positives.includes("extend_atari") &&
    !positives.includes("on_target_liberty") &&
    !positives.includes("capture_threat")
  ) {
    score -= 15;
    if (!negatives.includes("target_unprotected")) {
      negatives.push("target_unprotected");
    }
  }

  return finalizeQuality(Math.max(0, Math.min(100, score)), positives, negatives, goal, profile);
}

function finalizeQuality(score, positives, negatives, goal, profile = DEFAULT_QA_PROFILE) {
  const uniquePos = [...new Set(positives)];
  const uniqueNeg = [...new Set(negatives)];

  let verdict = /** @type {QaQualityVerdict} */ ("review");

  if (score === 0) {
    verdict = "review";
  } else if (profile.qualifyProblem(score, uniqueNeg)) {
    verdict = "problem";
  } else if (profile.qualifyGood(score, uniquePos, uniqueNeg, profile)) {
    verdict = "good";
  } else if (uniqueNeg.length > 0 || score < 65) {
    verdict = "review";
  } else {
    verdict = "good";
  }

  const actionableNegatives = uniqueNeg.filter((key) => HIGH_RISK_NEGATIVES.has(key));
  const problemReasons = (verdict === "problem" ? actionableNegatives : uniqueNeg).map(
    (key) => NEGATIVE_FACTOR_LABELS[key] ?? key,
  );

  return {
    score,
    verdict,
    positives: uniquePos,
    negatives: uniqueNeg,
    problemReasons,
    positiveLabels: uniquePos.map((key) => POSITIVE_FACTOR_LABELS[key] ?? key),
    negativeLabels: uniqueNeg.map((key) => NEGATIVE_FACTOR_LABELS[key] ?? key),
    goal,
    qaProfile: profile.id,
  };
}

export function isProblemVerdict(row) {
  return row?.verdict === "problem";
}

export function isReviewOrProblemVerdict(row) {
  return row?.verdict === "review" || isProblemVerdict(row);
}
