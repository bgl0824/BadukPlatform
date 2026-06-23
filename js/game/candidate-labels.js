import { isValidBoardPoint } from "./board-point-validation.js";

export const CANDIDATE_LABEL_TYPE = "CANDIDATE_LABEL";
export const CANDIDATE_LABEL_OPTIONS = ["A", "B", "C", "D"];

const ALLOWED_LABELS = new Set(CANDIDATE_LABEL_OPTIONS);

let drawHandlerRegistered = false;

export function normalizeCandidateLabel(value) {
  const label = String(value ?? "")
    .trim()
    .toUpperCase();
  return ALLOWED_LABELS.has(label) ? label : "";
}

export function getProblemCandidateLabels(problem) {
  if (!problem) {
    return [];
  }
  return problem.candidateLabels ?? problem.candidate_labels ?? [];
}

export function sanitizeCandidateLabels(labels, boardSize) {
  if (!Array.isArray(labels)) {
    return [];
  }

  const seen = new Set();
  const sanitized = [];

  labels.forEach((entry) => {
    const point = {
      x: Number(entry?.x),
      y: Number(entry?.y),
    };
    const label = normalizeCandidateLabel(entry?.label);
    if (!label || !isValidBoardPoint(point, boardSize)) {
      return;
    }

    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    sanitized.push({ x: point.x, y: point.y, label });
  });

  return sanitized;
}

export function cloneCandidateLabels(labels, boardSize) {
  return sanitizeCandidateLabels(labels, boardSize).map((entry) => ({ ...entry }));
}

export function toggleCandidateLabelAt(labels, point, label, boardSize) {
  const normalizedLabel = normalizeCandidateLabel(label);
  if (!normalizedLabel || !isValidBoardPoint(point, boardSize)) {
    return sanitizeCandidateLabels(labels, boardSize);
  }

  const sanitized = sanitizeCandidateLabels(labels, boardSize);
  const index = sanitized.findIndex((entry) => entry.x === point.x && entry.y === point.y);
  if (index === -1) {
    return [...sanitized, { x: point.x, y: point.y, label: normalizedLabel }];
  }

  if (sanitized[index].label === normalizedLabel) {
    return sanitized.filter((_, entryIndex) => entryIndex !== index);
  }

  return sanitized.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, label: normalizedLabel } : entry,
  );
}

export function removeCandidateLabelAt(labels, point, boardSize) {
  if (!isValidBoardPoint(point, boardSize)) {
    return sanitizeCandidateLabels(labels, boardSize);
  }

  return sanitizeCandidateLabels(labels, boardSize).filter(
    (entry) => !(entry.x === point.x && entry.y === point.y),
  );
}

export function registerCandidateLabelDrawHandler() {
  if (drawHandlerRegistered || !window.WGo?.Board?.drawHandlers) {
    return;
  }

  const noopShadow = { draw() {}, clear() {} };

  WGo.Board.drawHandlers[CANDIDATE_LABEL_TYPE] = {
    stone: {
      draw(object, board) {
        const centerX = board.getX(object.x);
        const centerY = board.getY(object.y);
        const radius = board.stoneRadius;
        const text = String(object.text ?? "").trim().toUpperCase();
        const fontSize = Math.max(14, Math.round(radius * 1.35));

        this.save();
        this.font = `900 ${fontSize}px "Segoe UI", "Noto Sans KR", sans-serif`;
        this.textAlign = "center";
        this.textBaseline = "middle";
        this.lineWidth = Math.max(2, fontSize * 0.14);
        this.strokeStyle = "rgba(255, 255, 255, 0.95)";
        this.strokeText(text, centerX, centerY);
        this.fillStyle = "#1e4fa8";
        this.fillText(text, centerX, centerY);
        this.restore();
      },
    },
    shadow: noopShadow,
  };

  drawHandlerRegistered = true;
}

export function applyCandidateLabelsToWgoBoard(board, labels, boardSize, safeAdd) {
  if (!board) {
    return;
  }

  const addObject =
    typeof safeAdd === "function"
      ? safeAdd
      : (object) => {
          board.addObject(object);
        };

  sanitizeCandidateLabels(labels, boardSize).forEach((entry) => {
    addObject({
      x: entry.x,
      y: entry.y,
      type: CANDIDATE_LABEL_TYPE,
      text: entry.label,
    });
  });
}
