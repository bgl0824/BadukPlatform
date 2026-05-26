/** UX 프로토타입 전역 스위치 — 기본 OFF (KataGo 후보 연동 전 실사용 비권장) */

export const AI_RESPONSE_UX_MESSAGES = {
  noCandidates:
    "응수 후보가 없습니다. KataGo 연동 또는 ai_response_candidates 설정이 필요합니다.",
  pickWhite: "백의 응수를 선택해보세요.",
  disabledHint: "AI 응수 UX는 프로토타입이며 기본적으로 꺼져 있습니다.",
};

/**
 * @returns {boolean}
 */
export function isAiResponseUxEnabled() {
  const fromConfig = window.BadukConfig?.aiResponseUxEnabled;
  if (fromConfig === true) {
    return true;
  }
  if (fromConfig === false) {
    return false;
  }

  return window.localStorage?.getItem("BADUK_AI_RESPONSE_UX_ENABLED") === "1";
}
