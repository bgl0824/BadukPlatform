/**
 * AI 응수 QA — 보드 썸네일 (canvas, 읽기 전용)
 */

const STONE_COLORS = {
  black: "#1a1a1a",
  white: "#f5f5f0",
  grid: "#8b7355",
  bg: "#dcb35c",
  wrong: "#c0392b",
  response: "#2980b9",
};

/**
 * @param {{
 *   stones: object[],
 *   boardSize: number,
 *   wrongPoint?: { x: number, y: number } | null,
 *   whitePoint?: { x: number, y: number } | null,
 *   width?: number,
 * }} params
 * @returns {string|null} data URL
 */
export function buildQaBoardPreviewDataUrl({
  stones,
  boardSize,
  wrongPoint = null,
  whitePoint = null,
  width = 132,
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  const padding = 6;
  const inner = Math.max(width - padding * 2, 48);
  const cell = inner / Math.max(boardSize - 1, 1);
  const height = padding * 2 + inner;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = STONE_COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const toPx = (coord) => padding + coord * cell;

  ctx.strokeStyle = STONE_COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i < boardSize; i += 1) {
    const p = toPx(i);
    ctx.beginPath();
    ctx.moveTo(toPx(0), p);
    ctx.lineTo(toPx(boardSize - 1), p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p, toPx(0));
    ctx.lineTo(p, toPx(boardSize - 1));
    ctx.stroke();
  }

  const radius = Math.max(cell * 0.38, 3);

  for (const stone of stones ?? []) {
    if (!Number.isInteger(stone?.x) || !Number.isInteger(stone?.y)) {
      continue;
    }
    const cx = toPx(stone.x);
    const cy = toPx(stone.y);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = stone.color === "white" ? STONE_COLORS.white : STONE_COLORS.black;
    ctx.fill();
    ctx.strokeStyle = stone.color === "white" ? "#333" : "#000";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  const drawHighlight = (point, color) => {
    if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)) {
      return;
    }
    const cx = toPx(point.x);
    const cy = toPx(point.y);
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  drawHighlight(wrongPoint, STONE_COLORS.wrong);
  drawHighlight(whitePoint, STONE_COLORS.response);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
