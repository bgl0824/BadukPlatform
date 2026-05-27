/**
 * AI 백 응수 전술 스타일 — category(분류)와 분리.
 * 관리자에서 problem.ai_response_style 로 지정 (확장용).
 */

export const AI_RESPONSE_STYLES = [
  "default",
  "escape",
  "capture",
  "connect",
  "liberty_fight",
  "sacrifice",
];

/** @typedef {(typeof AI_RESPONSE_STYLES)[number]} AiResponseStyle */

export const AI_RESPONSE_STYLE_LABELS = {
  default: "기본 (영역 내 후보 + 전술)",
  escape: "도망·단수 연장·연결",
  capture: "잡기·단수치기",
  connect: "연결 우선",
  liberty_fight: "수상전 (활로 싸움)",
  sacrifice: "희생·먹여치기·환격",
};

/**
 * category만으로 스타일을 결정하지 않음 — 미지정 시 보조 추론만.
 * @type {Record<string, AiResponseStyle>}
 */
export const CATEGORY_STYLE_HINTS = {
  단수치기: "capture",
  촉촉수: "escape",
  축: "escape",
  장문: "escape",
  환격: "sacrifice",
  수상전: "liberty_fight",
  먹여치기: "sacrifice",
};

/**
 * @param {unknown} value
 * @returns {value is AiResponseStyle}
 */
export function isAiResponseStyle(value) {
  return AI_RESPONSE_STYLES.includes(value);
}

/**
 * @param {object} problem
 * @returns {AiResponseStyle}
 */
export function resolveAiResponseStyle(problem) {
  const explicit = normalizeStyleField(
    problem?.ai_response_style ??
      problem?.aiResponseStyle ??
      problem?.tactical_response_mode ??
      problem?.tacticalResponseMode,
  );

  if (explicit) {
    return explicit;
  }

  const category = String(problem?.category ?? "").trim();
  const hinted = CATEGORY_STYLE_HINTS[category];
  if (hinted && isAiResponseStyle(hinted)) {
    return hinted;
  }

  return "default";
}

/**
 * @param {unknown} raw
 * @returns {AiResponseStyle|null}
 */
function normalizeStyleField(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value === "auto" || value === "infer") {
    return null;
  }
  return isAiResponseStyle(value) ? value : null;
}

/**
 * 스타일별 전술 신호 가중치 (곱셈 계수)
 * @type {Record<AiResponseStyle, Record<string, number>>}
 */
export const STYLE_SIGNAL_WEIGHTS = {
  default: {
    extend_atari: 1,
    increase_liberty: 1,
    connect_white: 1,
    respond_to_black: 0.8,
    capture_black: 1,
    decrease_black_liberty: 0.9,
    escape_from_last_black: 0.5,
    sacrifice_play: 0.4,
    katago_prior: 0.7,
    self_atari_penalty: 1,
  },
  escape: {
    extend_atari: 2.2,
    increase_liberty: 1.6,
    connect_white: 1.9,
    respond_to_black: 0.3,
    capture_black: 0.7,
    decrease_black_liberty: 0.6,
    escape_from_last_black: 2,
    sacrifice_play: 0.2,
    katago_prior: 0.5,
    self_atari_penalty: 1.2,
  },
  capture: {
    extend_atari: 1.3,
    increase_liberty: 0.7,
    connect_white: 0.8,
    respond_to_black: 1,
    capture_black: 2.5,
    decrease_black_liberty: 2.2,
    escape_from_last_black: 0.3,
    sacrifice_play: 0.5,
    katago_prior: 0.6,
    self_atari_penalty: 0.8,
  },
  connect: {
    extend_atari: 1.4,
    increase_liberty: 1.1,
    connect_white: 2.5,
    respond_to_black: 0.9,
    capture_black: 0.9,
    decrease_black_liberty: 0.8,
    escape_from_last_black: 0.6,
    sacrifice_play: 0.3,
    katago_prior: 0.6,
    self_atari_penalty: 1,
  },
  liberty_fight: {
    extend_atari: 1.5,
    increase_liberty: 2,
    connect_white: 1.2,
    respond_to_black: 0.9,
    capture_black: 1.3,
    decrease_black_liberty: 2.3,
    escape_from_last_black: 0.5,
    sacrifice_play: 0.6,
    katago_prior: 0.55,
    self_atari_penalty: 0.9,
  },
  sacrifice: {
    extend_atari: 0.5,
    increase_liberty: 0.6,
    connect_white: 0.7,
    respond_to_black: 1,
    capture_black: 1.8,
    decrease_black_liberty: 1.7,
    escape_from_last_black: 0.2,
    sacrifice_play: 2.4,
    katago_prior: 0.65,
    self_atari_penalty: 0.35,
  },
};

/**
 * @param {AiResponseStyle} style
 */
export function getStyleWeights(style) {
  return STYLE_SIGNAL_WEIGHTS[style] ?? STYLE_SIGNAL_WEIGHTS.default;
}
