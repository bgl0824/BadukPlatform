import { formatCoordLabel } from "./answer-sequence.js";
import { evaluatePlacement, PLACEMENT_STATUS } from "../../game/placement-validation.js";
import { getStoneAtPoint, isOnBoard } from "../../game/rules.js";
import { isPointInAllowedRegion } from "./problem-region.js";
import { selectTacticalWhiteMove } from "./tactical-response-engine.js";

const KATAGO_SOURCE = "katago";
const TACTICAL_FALLBACK_SOURCE = "tactical_fallback";

/**
 * 영역 내 빈 교차점 후보 (KataGo 없이 오답 응수용)
 */
export function buildRegionEmptyCandidates(region, stones, boardSize, maxCount = 36) {
  if (!region) {
    return [];
  }

  const occupied = new Set(
    (stones ?? []).map((stone) => `${stone.x},${stone.y}`),
  );
  const candidates = [];

  for (let x = region.minX; x <= region.maxX; x += 1) {
    for (let y = region.minY; y <= region.maxY; y += 1) {
      if (occupied.has(`${x},${y}`)) {
        continue;
      }
      const point = { x, y };
      if (!isOnBoard(point, boardSize) || !isPointInAllowedRegion(point, region)) {
        continue;
      }
      candidates.push({
        move: formatCoordLabel(point),
        x,
        y,
        visits: null,
        order: candidates.length,
        winrate: null,
        fromRegion: true,
      });
      if (candidates.length >= maxCount) {
        return candidates;
      }
    }
  }

  return candidates;
}

/**
 * 마지막 흑 오답수 주변 1~2칸 빈 점 (영역 밖이어도 포함)
 */
export function buildNearLastBlackCandidates(lastBlackMove, stones, boardSize, maxDist = 2, maxCount = 28) {
  if (!lastBlackMove) {
    return [];
  }

  const occupied = new Set(
    (stones ?? []).map((stone) => `${stone.x},${stone.y}`),
  );
  const candidates = [];

  for (let dx = -maxDist; dx <= maxDist; dx += 1) {
    for (let dy = -maxDist; dy <= maxDist; dy += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < 1 || dist > maxDist) {
        continue;
      }

      const point = { x: lastBlackMove.x + dx, y: lastBlackMove.y + dy };
      if (!isOnBoard(point, boardSize) || occupied.has(`${point.x},${point.y}`)) {
        continue;
      }

      candidates.push({
        move: formatCoordLabel(point),
        x: point.x,
        y: point.y,
        visits: null,
        order: dist - 1,
        winrate: null,
        fromRegion: false,
        nearLastBlack: true,
        distFromLastBlack: dist,
      });

      if (candidates.length >= maxCount) {
        return candidates.sort((a, b) => a.order - b.order);
      }
    }
  }

  return candidates.sort((a, b) => a.order - b.order);
}

function filterLegalCandidates(candidates, stones, boardSize, stoneColors) {
  return candidates.filter((candidate) => {
    const point = { x: candidate.x, y: candidate.y, color: stoneColors.white };
    const evaluation = evaluatePlacement(stones, point, { boardSize, stoneColors });
    return evaluation.status === PLACEMENT_STATUS.legal && !getStoneAtPoint(stones, point);
  });
}

function mergeCandidates(lists) {
  const merged = [];
  const seen = new Set();
  for (const list of lists) {
    for (const candidate of list) {
      const key = `${candidate.x},${candidate.y}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(candidate);
    }
  }
  return merged;
}

/**
 * KataGo 없이: 흑 오답수 주변 + 영역 합법수 → 오답 전술 점수
 */
export function selectWrongRevealLocalFallback({
  region,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  problem,
  regionCandidates = [],
  session = null,
}) {
  const nearBlack = filterLegalCandidates(
    buildNearLastBlackCandidates(lastBlackMove, stones, boardSize),
    stones,
    boardSize,
    stoneColors,
  );
  const fromKatago = filterLegalCandidates(
    regionCandidates,
    stones,
    boardSize,
    stoneColors,
  );
  const fromRegion = filterLegalCandidates(
    buildRegionEmptyCandidates(region, stones, boardSize),
    stones,
    boardSize,
    stoneColors,
  );

  const merged = mergeCandidates([nearBlack, fromKatago, fromRegion]);

  if (merged.length === 0) {
    return { ok: false, needsServer: true };
  }

  const education = selectTacticalWhiteMove({
    regionCandidates: merged,
    stones,
    boardSize,
    stoneColors,
    lastBlackMove,
    problem,
    studentMoveResult: "wrong",
    session,
  });

  const selected = education.selected;
  if (!selected?.point) {
    return { ok: false, needsServer: true };
  }

  return {
    ok: true,
    point: selected.point,
    move: selected.move,
    source: TACTICAL_FALLBACK_SOURCE,
    selectedReason: education.selectedReason,
    aiResponseStyle: education.aiResponseStyle,
    scoredCandidates: education.scoredCandidates,
    usedLocalFallback: true,
  };
}

export { KATAGO_SOURCE, TACTICAL_FALLBACK_SOURCE };
