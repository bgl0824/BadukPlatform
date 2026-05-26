const SPOT_HANDLER_KEYS = {
  blue: "AI_RESPONSE_SPOT_BLUE",
  green: "AI_RESPONSE_SPOT_GREEN",
};

let handlersRegistered = false;

export function ensureAiResponseSpotDrawHandlers() {
  if (handlersRegistered || !window.WGo?.Board?.drawHandlers) {
    return;
  }

  registerSpotHandler(SPOT_HANDLER_KEYS.blue, {
    fill: "rgba(56, 132, 255, 0.42)",
    stroke: "rgba(30, 100, 255, 0.95)",
    glow: "rgba(56, 132, 255, 0.55)",
  });

  registerSpotHandler(SPOT_HANDLER_KEYS.green, {
    fill: "rgba(52, 199, 122, 0.4)",
    stroke: "rgba(18, 150, 86, 0.95)",
    glow: "rgba(52, 199, 122, 0.5)",
  });

  handlersRegistered = true;
}

/**
 * @param {import("./candidates.js").AiResponseCandidate[]} candidates
 */
export function toBoardSpotDecorations(candidates) {
  return candidates.map((candidate) => ({
    x: candidate.x,
    y: candidate.y,
    type: candidate.color === "green" ? SPOT_HANDLER_KEYS.green : SPOT_HANDLER_KEYS.blue,
  }));
}

/**
 * @param {import("../../board.js")} boardController
 * @param {import("./candidates.js").AiResponseCandidate[]} candidates
 */
export function renderAiResponseSpots(boardController, candidates) {
  ensureAiResponseSpotDrawHandlers();
  boardController.setAiResponseSpots(toBoardSpotDecorations(candidates));
}

export function clearAiResponseSpots(boardController) {
  boardController.setAiResponseSpots([]);
}

function registerSpotHandler(type, palette) {
  WGo.Board.drawHandlers[type] = {
    stone: {
      draw(object, board) {
        const centerX = board.getX(object.x);
        const centerY = board.getY(object.y);
        const radius = board.stoneRadius * 0.92;
        const lineShift = board.ls;
        const drawX = centerX - lineShift;
        const drawY = centerY - lineShift;

        this.save();
        this.shadowColor = palette.glow;
        this.shadowBlur = radius * 0.9;
        this.beginPath();
        this.arc(drawX, drawY, radius * 1.08, 0, Math.PI * 2, true);
        this.fillStyle = palette.fill;
        this.fill();

        this.shadowBlur = 0;
        this.lineWidth = Math.max(2, radius * 0.16);
        this.strokeStyle = palette.stroke;
        this.beginPath();
        this.arc(drawX, drawY, radius, 0, Math.PI * 2, true);
        this.stroke();
        this.restore();
      },
      clear() {},
    },
  };
}
