export const CAPTURE_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function pointKey(point) {
  return `${point.x}:${point.y}`;
}

export function isSamePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function isOnBoard(point, boardSize) {
  return point.x >= 0 && point.y >= 0 && point.x < boardSize && point.y < boardSize;
}

export function getNeighborPoints(point, boardSize) {
  return CAPTURE_DIRECTIONS.map(([dx, dy]) => ({
    x: point.x + dx,
    y: point.y + dy,
  })).filter((neighbor) => isOnBoard(neighbor, boardSize));
}

export function getStoneAtPoint(stones, point) {
  return stones.find((stone) => isSamePoint(stone, point));
}
