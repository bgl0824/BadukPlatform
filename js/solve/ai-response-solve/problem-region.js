/** 문제 주변 허용 영역 (bounding box + margin) */
export const DEFAULT_REGION_MARGIN = 2;

/**
 * @param {{
 *   boardSize: number,
 *   stones?: Array<{ x: number, y: number }>,
 *   initialStones?: Array<{ x: number, y: number }>,
 *   lastMove?: { x: number, y: number } | null,
 *   margin?: number,
 * }} params
 */
export function computeAllowedRegion({
  boardSize,
  stones = [],
  initialStones = [],
  lastMove = null,
  margin = DEFAULT_REGION_MARGIN,
}) {
  const points = [];

  for (const stone of [...initialStones, ...stones]) {
    if (Number.isInteger(stone?.x) && Number.isInteger(stone?.y)) {
      points.push({ x: stone.x, y: stone.y });
    }
  }

  if (lastMove && Number.isInteger(lastMove.x) && Number.isInteger(lastMove.y)) {
    points.push({ x: lastMove.x, y: lastMove.y });
  }

  if (points.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: boardSize - 1,
      maxY: boardSize - 1,
      margin,
      empty: true,
    };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX: Math.max(0, minX - margin),
    maxX: Math.min(boardSize - 1, maxX + margin),
    minY: Math.max(0, minY - margin),
    maxY: Math.min(boardSize - 1, maxY + margin),
    margin,
    empty: false,
  };
}

/**
 * @param {{ x: number, y: number }} point
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} region
 */
export function isPointInAllowedRegion(point, region) {
  if (!point || !region) {
    return false;
  }
  return (
    point.x >= region.minX &&
    point.x <= region.maxX &&
    point.y >= region.minY &&
    point.y <= region.maxY
  );
}

/**
 * @param {Array<{ x?: number, y?: number }>} candidates
 */
export function filterCandidatesInRegion(candidates, region, boardSize) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  return candidates.filter((candidate) => {
    const point =
      Number.isInteger(candidate.x) && Number.isInteger(candidate.y)
        ? { x: candidate.x, y: candidate.y }
        : null;
    if (!point || !isPointInAllowedRegion(point, region)) {
      return false;
    }
    return point.x >= 0 && point.y >= 0 && point.x < boardSize && point.y < boardSize;
  });
}

/**
 * KataGo 후보 중 문제 영역 안의 첫 수 (order/visits 순 유지)
 * @deprecated 전술 선택은 selectTacticalWhiteMove 사용
 */
export function selectCandidateInRegion(candidates, region, boardSize) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999),
  );

  for (const candidate of sorted) {
    const point =
      Number.isInteger(candidate.x) && Number.isInteger(candidate.y)
        ? { x: candidate.x, y: candidate.y }
        : null;

    if (!point || !isPointInAllowedRegion(point, region)) {
      continue;
    }

    if (point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize) {
      continue;
    }

    return {
      ...candidate,
      point,
    };
  }

  return null;
}
