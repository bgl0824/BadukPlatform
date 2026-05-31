import {
  isValidBoardPoint,
  sanitizeBoardPoint,
  sanitizeBoardSpot,
  sanitizeStone,
  sanitizeStones,
} from "./game/board-point-validation.js";

const { STONE } = window.BadukProblems;

const STONE_MARK_TYPES = {
  triangle: "TR",
  circle: "CR",
  square: "SQ",
  cross: "MA",
};

/** 마우스 호버 프리뷰: 터치·펜 일반 입력에서는 비활성 (1탭 즉시 착수) */
const HOVER_PREVIEW_QUERY = "(hover: hover) and (pointer: fine)";
/** WGo 기본 wood1.jpg — vendor/ 에 배치 (404 시 CSS 색으로 대체) */
const BOARD_BACKGROUND_IMAGE = "./vendor/wood1.jpg";
const BOARD_BACKGROUND_COLOR = "#f3d08a";
const GHOST_PREVIEW_TYPE = "GHOST_PREVIEW";
const GHOST_PREVIEW_STATUS = {
  legal: "legal",
  illegal: "illegal",
  occupied: "occupied",
  suicide: "suicide",
};

function resolvePreviewStatus(evaluation) {
  if (!evaluation) {
    return GHOST_PREVIEW_STATUS.illegal;
  }

  if (evaluation.status === "occupied") {
    return GHOST_PREVIEW_STATUS.occupied;
  }

  if (evaluation.status === "illegal") {
    return evaluation.reason === "suicide"
      ? GHOST_PREVIEW_STATUS.suicide
      : GHOST_PREVIEW_STATUS.illegal;
  }

  return GHOST_PREVIEW_STATUS.legal;
}

function isBlockedPreviewStatus(previewStatus) {
  return previewStatus !== GHOST_PREVIEW_STATUS.legal;
}

function registerGhostPreviewHandlers() {
  if (!window.WGo?.Board?.drawHandlers) {
    return;
  }

  const noopShadow = { draw() {}, clear() {} };

  WGo.Board.drawHandlers[GHOST_PREVIEW_TYPE] = {
    stone: {
      draw(object, board) {
        const centerX = board.getX(object.x);
        const centerY = board.getY(object.y);
        const radius = board.stoneRadius;
        const lineShift = board.ls;
        const drawX = centerX - lineShift;
        const drawY = centerY - lineShift;
        const drawRadius = Math.max(0, radius - 0.5);
        const previewStatus = object.previewStatus ?? GHOST_PREVIEW_STATUS.legal;

        if (isBlockedPreviewStatus(previewStatus)) {
          this.save();
          this.globalAlpha = previewStatus === GHOST_PREVIEW_STATUS.suicide ? 0.62 : 0.58;
          const gradient = this.createRadialGradient(
            drawX - radius * 0.15,
            drawY - radius * 0.15,
            radius * 0.1,
            drawX,
            drawY,
            radius * 0.95,
          );
          gradient.addColorStop(0, "rgba(255, 120, 120, 0.95)");
          gradient.addColorStop(1, "rgba(185, 74, 72, 0.9)");
          this.fillStyle = gradient;
          this.beginPath();
          this.arc(drawX, drawY, drawRadius, 0, Math.PI * 2, true);
          this.fill();

          this.globalAlpha = 0.5;
          this.strokeStyle = "rgba(255, 80, 80, 0.85)";
          this.lineWidth = Math.max(2, radius * 0.14);
          this.beginPath();
          this.arc(drawX, drawY, drawRadius + radius * 0.08, 0, Math.PI * 2, true);
          this.stroke();
          this.restore();
          return;
        }

        this.save();
        this.globalAlpha = 0.52;

        if (object.c === WGo.W) {
          const gradient = this.createRadialGradient(
            centerX - (2 * radius) / 5,
            centerY - (2 * radius) / 5,
            radius / 3,
            centerX - radius / 5,
            centerY - radius / 5,
            (5 * radius) / 5,
          );
          gradient.addColorStop(0, "#fff");
          gradient.addColorStop(1, "#aaa");
          this.fillStyle = gradient;
        } else {
          const gradient = this.createRadialGradient(
            centerX - (2 * radius) / 5,
            centerY - (2 * radius) / 5,
            1,
            centerX - radius / 5,
            centerY - radius / 5,
            (4 * radius) / 5,
          );
          gradient.addColorStop(0, "#666");
          gradient.addColorStop(1, "#000");
          this.fillStyle = gradient;
        }

        this.beginPath();
        this.arc(drawX, drawY, drawRadius, 0, Math.PI * 2, true);
        this.fill();
        this.restore();
      },
    },
    shadow: noopShadow,
  };
}

registerGhostPreviewHandlers();

class BoardController {
  applyBoardBackgroundFallback() {
    const applyColorFallback = () => {
      if (!this.element) {
        return;
      }

      this.element.style.backgroundImage = "";
      this.element.style.backgroundColor = BOARD_BACKGROUND_COLOR;
    };

    const probe = new Image();
    probe.decoding = "async";
    probe.onerror = applyColorFallback;
    probe.onload = () => {
      if (!probe.naturalWidth) {
        applyColorFallback();
      }
    };
    probe.src = BOARD_BACKGROUND_IMAGE;
  }

  constructor(element, { size, onPlay, onSecondaryPlay, onInvalidPlay, preview } = {}) {
    this.element = element;
    this.size = size;
    this.onPlay = onPlay;
    this.onSecondaryPlay = onSecondaryPlay;
    this.onInvalidPlay = onInvalidPlay;
    this.stones = [];
    this.aiResponseSpots = [];
    this.answerMarkers = { best: [], alternative: [] };
    this.previewContext = {
      enabled: Boolean(preview?.enabled),
      editorStonePlacement: Boolean(preview?.editorStonePlacement),
      getActiveColor: preview?.getActiveColor ?? (() => STONE.black),
      evaluatePoint: preview?.evaluatePoint ?? (() => ({ status: "legal" })),
    };
    this.touchConfirmMode = preview?.touchConfirmMode ?? (() => false);
    this.previewState = null;
    this.pendingConfirmPoint = null;
    this.previewFrameId = null;
    this.ghostObject = null;
    this.boundMouseLeave = () => this.clearPreview();

    this.board = new WGo.Board(this.element, {
      size: this.size,
      width: this.getResponsiveWidth(),
      background: BOARD_BACKGROUND_IMAGE,
      section: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    });

    this.applyBoardBackgroundFallback();

    this.bindPointerEvents();
    this.bindBoardGestureGuards();
    window.addEventListener("resize", () => this.resize());
  }

  setPreviewContext(context = {}) {
    this.previewContext = {
      ...this.previewContext,
      ...context,
    };

    if (!this.isPreviewEnabled()) {
      this.clearPreview();
    }
  }

  isPreviewEnabled() {
    return Boolean(this.previewContext.enabled);
  }

  isEditorStonePlacement() {
    return Boolean(this.previewContext.editorStonePlacement);
  }

  bindPointerEvents() {
    this.board.addEventListener("click", (x, y) => {
      this.handlePointerSelect({ x, y }, "primary");
    });

    this.board.addEventListener("contextmenu", (x, y, event) => {
      event?.preventDefault?.();
      this.handlePointerSelect({ x, y }, "secondary");
    });

    this.board.addEventListener("mousemove", (x, y) => {
      if (!this.shouldUseHoverPreview()) {
        return;
      }

      this.schedulePreviewUpdate({ x, y });
    });

    this.element.addEventListener("mouseleave", this.boundMouseLeave);
  }

  bindBoardGestureGuards() {
    const blockGesture = (event) => {
      event.preventDefault();
    };

    this.element.addEventListener("dblclick", blockGesture);
    this.element.addEventListener("gesturestart", blockGesture, { passive: false });

    this.element.querySelectorAll("canvas").forEach((canvas) => {
      canvas.addEventListener("dblclick", blockGesture);
      canvas.addEventListener("gesturestart", blockGesture, { passive: false });
    });
  }

  shouldUseHoverPreview() {
    if (!this.isPreviewEnabled()) {
      return false;
    }

    if (typeof window.matchMedia !== "function") {
      return true;
    }

    return window.matchMedia(HOVER_PREVIEW_QUERY).matches;
  }

  isTouchConfirmMode() {
    return typeof this.touchConfirmMode === "function"
      ? this.touchConfirmMode()
      : Boolean(this.touchConfirmMode);
  }

  schedulePreviewUpdate(point) {
    if (!isValidBoardPoint(point, this.size)) {
      return;
    }
    this.pendingPreviewPoint = point;

    if (this.previewFrameId !== null) {
      return;
    }

    this.previewFrameId = window.requestAnimationFrame(() => {
      this.previewFrameId = null;
      if (this.pendingPreviewPoint) {
        this.updatePreview(this.pendingPreviewPoint);
      }
    });
  }

  updatePreview(point) {
    if (!this.isPreviewEnabled()) {
      this.clearPreview();
      return;
    }

    const evaluation = this.getPointEvaluation(point);
    const color = this.previewContext.getActiveColor();
    this.previewState = {
      x: point.x,
      y: point.y,
      color,
      previewStatus: resolvePreviewStatus(evaluation),
    };
    this.syncGhostObject();
  }

  getPointEvaluation(point) {
    return this.previewContext.evaluatePoint(point, {
      stones: this.stones,
      boardSize: this.size,
    });
  }

  handlePointerSelect(point, button = "primary") {
    if (!isValidBoardPoint(point, this.size)) {
      console.warn("[BoardController] ignore invalid pointer", { point, button });
      return;
    }

    const isSecondary = button === "secondary";

    if (!this.isPreviewEnabled()) {
      this.dispatchPlay(point, isSecondary);
      return;
    }

    const evaluation = this.getPointEvaluation(point);
    const previewStatus = resolvePreviewStatus(evaluation);
    const allowOccupied = this.isEditorStonePlacement();

    if (previewStatus === GHOST_PREVIEW_STATUS.occupied && !allowOccupied) {
      return;
    }

    if (isSecondary) {
      if (allowOccupied || previewStatus !== GHOST_PREVIEW_STATUS.occupied) {
        this.pendingConfirmPoint = null;
        this.clearPreview();
        this.dispatchPlay(point, true);
      }
      return;
    }

    if (this.isTouchConfirmMode()) {
      if (
        this.pendingConfirmPoint &&
        this.pendingConfirmPoint.x === point.x &&
        this.pendingConfirmPoint.y === point.y
      ) {
        this.commitPlay(point, evaluation);
        return;
      }

      this.pendingConfirmPoint = { x: point.x, y: point.y };
      this.updatePreview(point);
      return;
    }

    this.commitPlay(point, evaluation);
  }

  dispatchPlay(point, isSecondary = false) {
    if (isSecondary) {
      this.onSecondaryPlay?.(point);
      return;
    }

    this.onPlay?.(point);
  }

  commitPlay(point, evaluation) {
    const previewStatus = resolvePreviewStatus(evaluation);

    if (isBlockedPreviewStatus(previewStatus) && !this.isEditorStonePlacement()) {
      this.onInvalidPlay?.(point, evaluation);
      this.clearPreview();
      return;
    }

    this.pendingConfirmPoint = null;
    this.clearPreview();
    this.dispatchPlay(point, false);
  }

  clearPreview() {
    this.pendingConfirmPoint = null;
    this.pendingPreviewPoint = null;
    this.previewState = null;

    if (this.previewFrameId !== null) {
      window.cancelAnimationFrame(this.previewFrameId);
      this.previewFrameId = null;
    }

    this.removeGhostObject();
  }

  syncGhostObject() {
    this.removeGhostObject();

    if (!this.previewState) {
      return;
    }

    this.ghostObject = {
      x: this.previewState.x,
      y: this.previewState.y,
      c: this.previewState.color === STONE.white ? WGo.W : WGo.B,
      type: GHOST_PREVIEW_TYPE,
      previewStatus: this.previewState.previewStatus,
    };

    this.safeAddObject(this.ghostObject, "ghost");
  }

  /**
   * WGo에 넘기기 전 좌표 검증 (invalid면 warn만)
   */
  safeAddObject(object, context = "") {
    if (!object || typeof object !== "object") {
      return false;
    }

    if (!isValidBoardPoint(object, this.size)) {
      console.warn("[BoardController] skip invalid WGo object", {
        object,
        context,
        boardSize: this.size,
      });
      return false;
    }

    try {
      this.board.addObject(object);
      return true;
    } catch (error) {
      console.warn("[BoardController] WGo addObject failed", {
        object,
        context,
        message: error?.message,
      });
      return false;
    }
  }

  removeGhostObject() {
    if (!this.ghostObject) {
      return;
    }

    this.board.removeObject(this.ghostObject);
    this.ghostObject = null;
  }

  loadPosition(stones) {
    this.stones = sanitizeStones(stones, this.size, "loadPosition");
    this.answerMarkers = { best: [], alternative: [] };
    this.clearPreview();
    this.render();
  }

  setAiResponseSpots(spots = []) {
    this.aiResponseSpots = (Array.isArray(spots) ? spots : [])
      .map((spot) => sanitizeBoardSpot(spot, this.size, "aiResponseSpot"))
      .filter(Boolean);
    this.render();
  }

  clearAiResponseSpots() {
    this.setAiResponseSpots([]);
  }

  hasStone(point) {
    if (!isValidBoardPoint(point, this.size)) {
      return false;
    }
    return this.stones.some((stone) => stone.x === point.x && stone.y === point.y);
  }

  getStoneAt(point) {
    if (!isValidBoardPoint(point, this.size)) {
      return undefined;
    }
    return this.stones.find((stone) => stone.x === point.x && stone.y === point.y);
  }

  addStone(stone) {
    const sanitized = sanitizeStone(stone, this.size, "addStone");
    if (!sanitized) {
      return false;
    }

    if (this.hasStone(sanitized)) {
      return false;
    }

    this.stones = [...this.stones, sanitized];
    this.safeAddObject(toWgoStone(sanitized), "addStone");
    return true;
  }

  setStones(stones) {
    this.stones = sanitizeStones(stones, this.size, "setStones");
    this.clearPreview();
    this.render();
  }

  setAnswerMarker(point) {
    this.setAnswerMarkers({
      best: point ? [point] : [],
      alternative: [],
    });
  }

  setAnswerMarkers({ best = [], alternative = [] } = {}) {
    this.answerMarkers = {
      best: (Array.isArray(best) ? best : best ? [best] : [])
        .map((entry) => sanitizeBoardPoint(entry, this.size, "answerMarker:best"))
        .filter(Boolean),
      alternative: (Array.isArray(alternative) ? alternative : [])
        .map((entry) => sanitizeBoardPoint(entry, this.size, "answerMarker:alternative"))
        .filter(Boolean),
    };
    this.render();
  }

  clearAnswerMarker() {
    this.answerMarkers = { best: [], alternative: [] };
    this.render();
  }

  getStones() {
    return [...this.stones];
  }

  resize() {
    const width = this.getResponsiveWidth();

    if (typeof this.board.setWidth === "function") {
      this.board.setWidth(width);
    } else {
      this.render();
    }

    this.syncGhostObject();
  }

  render() {
    const previewState = this.previewState;
    this.ghostObject = null;

    try {
      this.board.removeAllObjects();
    } catch (error) {
      console.warn("[BoardController] removeAllObjects failed", error?.message);
    }

    this.stones.forEach((stone) => {
      const sanitized = sanitizeStone(stone, this.size, "render:stone");
      if (!sanitized) {
        return;
      }
      this.safeAddObject(toWgoStone(sanitized), "render:stone");
      const mark = toWgoMark(sanitized);
      if (mark) {
        this.safeAddObject(mark, "render:mark");
      }
    });

    this.answerMarkers.best.forEach((point) => {
      this.safeAddObject(
        {
          x: point.x,
          y: point.y,
          type: "TR",
        },
        "render:answerMarker:best",
      );
    });

    this.answerMarkers.alternative.forEach((point) => {
      this.safeAddObject(
        {
          x: point.x,
          y: point.y,
          type: "SQ",
        },
        "render:answerMarker:alternative",
      );
    });

    this.aiResponseSpots.forEach((spot) => {
      this.safeAddObject(
        {
          x: spot.x,
          y: spot.y,
          type: spot.type,
        },
        "render:aiResponseSpot",
      );
    });

    this.previewState = previewState;
    this.syncGhostObject();
  }

  getResponsiveWidth() {
    const fallbackWidth = Math.min(window.innerWidth - 48, 640);
    const measuredWidth = this.element.clientWidth || fallbackWidth;
    return Math.max(260, Math.min(measuredWidth, 640));
  }
}

function toWgoStone(stone) {
  return {
    x: stone.x,
    y: stone.y,
    c: stone.color === STONE.black ? WGo.B : WGo.W,
  };
}

function toWgoMark(stone) {
  const type = STONE_MARK_TYPES[stone.mark];
  if (!type) {
    return null;
  }

  return {
    x: stone.x,
    y: stone.y,
    type,
  };
}

window.BadukBoard = {
  BoardController,
  isValidBoardPoint,
  sanitizeBoardPoint,
  sanitizeStones,
};
