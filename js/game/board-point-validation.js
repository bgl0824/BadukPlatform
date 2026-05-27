/**
 * WGo 보드 렌더 전 교차점 좌표 검증
 */

/**
 * @param {unknown} point
 * @param {number} boardSize
 * @returns {boolean}
 */
export function isValidBoardPoint(point, boardSize) {
  if (!point || typeof point !== "object") {
    return false;
  }

  const { x, y } = point;
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return false;
  }

  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) {
    return false;
  }

  return true;
}

/**
 * @param {unknown} point
 * @param {number} boardSize
 * @param {string} [context]
 * @returns {{ x: number, y: number } | null}
 */
export function sanitizeBoardPoint(point, boardSize, context = "") {
  if (isValidBoardPoint(point, boardSize)) {
    return { x: point.x, y: point.y };
  }

  if (point != null && (point.x != null || point.y != null)) {
    console.warn("[BoardPoint] invalid coordinate skipped", {
      point,
      boardSize,
      context,
    });
  }

  return null;
}

/**
 * @param {unknown} stone
 * @param {number} boardSize
 * @param {string} [context]
 * @returns {object | null}
 */
export function sanitizeStone(stone, boardSize, context = "") {
  if (!stone || typeof stone !== "object") {
    return null;
  }

  const point = sanitizeBoardPoint(stone, boardSize, context ? `${context}:stone` : "stone");
  if (!point) {
    return null;
  }

  return { ...stone, x: point.x, y: point.y };
}

/**
 * @param {unknown[]} stones
 * @param {number} boardSize
 * @param {string} [context]
 * @returns {object[]}
 */
export function sanitizeStones(stones, boardSize, context = "") {
  if (!Array.isArray(stones)) {
    return [];
  }

  const valid = [];
  for (const stone of stones) {
    const sanitized = sanitizeStone(stone, boardSize, context);
    if (sanitized) {
      valid.push(sanitized);
    }
  }
  return valid;
}

/**
 * @param {unknown} spot WGo mark/spot object (x, y, type, …)
 * @param {number} boardSize
 * @param {string} [context]
 * @returns {object | null}
 */
export function sanitizeBoardSpot(spot, boardSize, context = "") {
  if (!spot || typeof spot !== "object") {
    return null;
  }

  const point = sanitizeBoardPoint(spot, boardSize, context ? `${context}:spot` : "spot");
  if (!point) {
    return null;
  }

  return { ...spot, x: point.x, y: point.y };
}
