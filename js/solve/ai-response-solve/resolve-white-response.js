import { isKatagoRespondApiEnabled, requestKatagoRespond } from "./katago-respond-client.js";
import { logMockWhiteMove, pickMockWhiteResponse } from "./mock-white-response.js";

const KATAGO_SOURCE = "katago";

function isMockAllowed() {
  return window.BadukConfig?.katagoRespondAllowMock === true;
}

/**
 * KataGo API만 사용. mock은 katagoRespondAllowMock=true 일 때만 (기본 차단).
 */
export async function resolveWhiteResponse({
  problem,
  boardSize,
  stones,
  playedMoves,
  initialStones,
  lastBlackMove,
  stoneColors,
  studentMoveResult,
  currentPly,
}) {
  if (!isKatagoRespondApiEnabled()) {
    console.warn("[AI_RESPONSE] katagoRespondApiEnabled=false — server required");
    return {
      ok: false,
      disabled: true,
      needsServer: true,
      message: "AI 응수 서버 연결 필요",
    };
  }

  const apiResult = await requestKatagoRespond({
    problem,
    boardSize,
    stones,
    playedMoves,
    initialStones,
    lastMove: lastBlackMove,
    stoneColors,
    studentMoveResult,
    currentPly,
  });

  if (apiResult.ok && apiResult.point && apiResult.source === KATAGO_SOURCE) {
    return apiResult;
  }

  if (apiResult.disabled || apiResult.needsServer) {
    return {
      ok: false,
      needsServer: true,
      message: apiResult.message ?? "AI 응수 서버 연결 필요",
    };
  }

  if (isMockAllowed()) {
    const mock = pickMockWhiteResponse({ boardSize, stones, lastBlackMove });
    if (mock?.point) {
      logMockWhiteMove(mock.point);
      console.warn("[AI_RESPONSE] DEV ONLY: katagoRespondAllowMock=true");
      return { ok: true, point: mock.point, source: "mock" };
    }
  }

  console.error("[AI_RESPONSE] KataGo respond failed", apiResult);
  return {
    ok: false,
    needsServer: true,
    message: apiResult.message ?? "AI 응수 서버 연결 필요",
  };
}

/** 백 자동 착수 허용 여부 */
export function isKatagoWhiteMove(result) {
  return Boolean(result?.ok && result?.point && result?.source === KATAGO_SOURCE);
}
