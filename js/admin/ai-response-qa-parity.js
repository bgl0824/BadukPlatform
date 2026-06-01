/**
 * AI 응수 QA — 실제 학생 풀이 경로와 동일한 resolveWhiteResponse 컨텍스트
 * (engine.js playKatagoWhiteOnWrong 정렬)
 */

import { formatCoordLabel } from "../solve/ai-response-solve/answer-sequence.js";
import {
  computeAllowedRegion,
  DEFAULT_REGION_MARGIN,
} from "../solve/ai-response-solve/problem-region.js";
import { logWrongRevealRequestContext } from "../solve/ai-response-solve/respond-diagnostics.js";

function getRegionMargin() {
  const configured = Number(window.BadukConfig?.katagoRespondRegionMargin);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return DEFAULT_REGION_MARGIN;
}

/**
 * engine.js handleStudentBlackMove → advancePlyAfterBlack → playKatagoWhiteOnWrong
 * 와 동일한 인자를 만든다.
 *
 * @param {object} params
 */
export function buildWrongRevealResolveContext({
  problem,
  scenario,
  wrongPoint,
  applied,
  boardSize,
  stoneColors,
  initialStones,
}) {
  const lastBlackMove = {
    x: wrongPoint.x,
    y: wrongPoint.y,
    color: stoneColors.black,
  };
  const playedMoves = [...scenario.playedMoves, lastBlackMove];

  // session.advancePlyAfterBlack() 직후 currentPly
  const currentPly = scenario.currentPlyAfterBlack ?? scenario.currentPly + 1;
  const blackAnswerIndex = scenario.blackAnswerIndex ?? scenario.blackPlyIndex ?? 0;
  const resolvedInitialStones = initialStones ?? problem?.stones ?? [];

  const margin = getRegionMargin();
  const allowedRegion = computeAllowedRegion({
    boardSize,
    stones: applied.stones,
    initialStones: resolvedInitialStones,
    lastMove: lastBlackMove,
    margin,
  });

  const resolveWhiteResponseParams = {
    problem,
    boardSize,
    stones: applied.stones,
    playedMoves,
    initialStones: resolvedInitialStones,
    lastBlackMove,
    stoneColors,
    studentMoveResult: "wrong",
    currentPly,
    blackAnswerIndex,
  };

  return {
    blackAnswerIndex,
    currentPlyBeforeBlack: scenario.currentPly,
    currentPly,
    lastBlackMove,
    playedMoves,
    stonesBeforeWrong: scenario.stones,
    stonesAfterWrong: applied.stones,
    stonesBeforeCount: scenario.stones.length,
    stonesAfterCount: applied.stones.length,
    initialStonesCount: resolvedInitialStones.length,
    allowedRegion,
    margin,
    resolveWhiteResponseParams,
  };
}

/**
 * @param {string} stage
 * @param {object} context
 * @param {object} [response]
 */
export function logQaWrongRevealParity(stage, context, response = null) {
  const params = context?.resolveWhiteResponseParams;
  if (!params) {
    return;
  }

  logWrongRevealRequestContext(`qa:${stage}`, {
    ...params,
    blackAnswerIndex: context.blackAnswerIndex,
    stonesBeforeCount: context.stonesBeforeCount,
    stonesAfterCount: context.stonesAfterCount,
    currentPlyBeforeBlack: context.currentPlyBeforeBlack,
  });

  console.log("[AI_QA_PARITY]", {
    stage,
    blackAnswerIndex: context.blackAnswerIndex,
    currentPlyBeforeBlack: context.currentPlyBeforeBlack,
    currentPly: context.currentPly,
    stonesBeforeCount: context.stonesBeforeCount,
    stonesAfterCount: context.stonesAfterCount,
    initialStonesCount: context.initialStonesCount,
    playedMovesCount: params.playedMoves?.length ?? 0,
    lastBlackMove: formatCoordLabel(context.lastBlackMove),
    allowedRegion: context.allowedRegion,
    response: response
      ? {
          ok: response.ok,
          source: response.source,
          selectedMove: response.move ?? (response.point ? formatCoordLabel(response.point) : null),
          selectedReason: response.selectedReason ?? null,
          usedLocalFallback: Boolean(response.usedLocalFallback),
        }
      : null,
  });
}

/**
 * @param {object} context
 * @param {object} response
 */
export function rememberQaParitySample(context, response) {
  if (typeof window === "undefined") {
    return;
  }
  window.__AI_QA_LAST_PARITY_SAMPLE = {
    at: new Date().toISOString(),
    context,
    response: response
      ? {
          ok: response.ok,
          source: response.source,
          point: response.point ?? null,
          selectedReason: response.selectedReason ?? null,
          usedLocalFallback: Boolean(response.usedLocalFallback),
        }
      : null,
  };
}
