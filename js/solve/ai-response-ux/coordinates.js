/**
 * GTP 좌표 (예: D4) → 0-based { x, y }. 13줄 기준 행 번호는 위에서 1.
 * @param {string} value
 * @param {number} boardSize
 */
export function parseGtpCoordinate(value, boardSize = 13) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+,\d+$/.test(trimmed)) {
    const [x, y] = trimmed.split(",").map(Number);
    return isOnBoard({ x, y }, boardSize) ? { x, y } : null;
  }

  const match = trimmed.match(/^([a-z])(\d+)$/i);
  if (!match) {
    return null;
  }

  const x = match[1].toLowerCase().charCodeAt(0) - "a".charCodeAt(0);
  const rowFromTop = Number(match[2]);
  if (!Number.isFinite(rowFromTop) || rowFromTop < 1 || rowFromTop > boardSize) {
    return null;
  }

  const y = rowFromTop - 1;
  return isOnBoard({ x, y }, boardSize) ? { x, y } : null;
}

function isOnBoard(point, boardSize) {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < boardSize &&
    point.y < boardSize
  );
}

export function pointKey(x, y) {
  return `${x}:${y}`;
}
