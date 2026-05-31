import { AI_RESPONSE_STYLE_LABELS, resolveAiResponseStyle } from "../solve/ai-response-solve/tactical-response-styles.js";
import { KATAGO_SOURCE, TACTICAL_FALLBACK_SOURCE } from "../solve/ai-response-solve/wrong-response-fallback.js";

/** selectedReason → 한글 (오답 응수 엔진 reason 키) */
export const SELECTED_REASON_LABELS = {
  forced_extend_atari: "활로 연장 (단수 대응)",
  continuous_escape: "연속 도망",
  future_liberty_gain: "활로 증가",
  connect_target_group: "타깃 그룹 연결",
  connect_white_group: "백 그룹 연결",
  near_last_black: "흑 오답 수 인근",
  region_candidate: "영역 일반 후보",
  capture_black: "흑 잡기",
  sacrifice_play: "희생·교환",
  snapback_capture: "환격 포획",
  capture_black_group: "흑 그룹 포획",
};

const SURVIVAL_REASONS = new Set([
  "forced_extend_atari",
  "continuous_escape",
  "future_liberty_gain",
  "connect_target_group",
]);

export function formatSelectedReasonLabel(selectedReason) {
  if (!selectedReason) {
    return "—";
  }
  return SELECTED_REASON_LABELS[selectedReason] ?? selectedReason;
}

export function formatResponseTypeLabel(response, problem) {
  const style = response?.aiResponseStyle ?? resolveAiResponseStyle(problem);
  const styleLabel = AI_RESPONSE_STYLE_LABELS[style] ?? style ?? "—";
  let sourceLabel = "—";
  if (response?.source === KATAGO_SOURCE) {
    sourceLabel = "KataGo";
  } else if (response?.source === TACTICAL_FALLBACK_SOURCE) {
    sourceLabel = "전술 fallback";
  } else if (response?.source) {
    sourceLabel = String(response.source);
  }
  return `${styleLabel} · ${sourceLabel}`;
}

export function formatAiResponseStyleLabel(response, problem) {
  const style = response?.aiResponseStyle ?? resolveAiResponseStyle(problem);
  return AI_RESPONSE_STYLE_LABELS[style] ?? style ?? "—";
}

export function isSurvivalSelectedReason(selectedReason) {
  return SURVIVAL_REASONS.has(selectedReason);
}
