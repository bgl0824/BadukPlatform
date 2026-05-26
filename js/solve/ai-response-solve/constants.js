export const ANSWER_MOVE_COUNTS = [1, 3, 5, 7];

export const AI_RESPONSE_SOLVE_MESSAGES = {
  serverRequired: "AI 응수 서버 연결 필요. 관리자에게 KataGo API 설정을 확인해 주세요.",
  apiDisabled:
    "AI 응수 API가 꺼져 있습니다. katagoRespondApiEnabled를 켜 주세요.",
  katagoFailed: "백 응수를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  awaitBlack: (ply, total) => `흑 ${ply}수 / 총 ${total}수`,
  katagoThinking: "백이 응수하는 중…",
  wrongAfterWhite: "오답입니다. 백 응수를 확인한 뒤 다시 도전해 보세요.",
  complete: "정답입니다.",
};

/** 학생이 둬야 하는 흑 정답 수 */
export function getExpectedBlackAnswerCount(answerMoveCount) {
  const total = normalizeAnswerMoveCount(answerMoveCount);
  return Math.floor((total + 1) / 2);
}

/** 정답 루트에서 KataGo 백이 들어가는 횟수 (마지막 흑 직후 제외) */
export function getKatagoPliesOnCorrectPath(answerMoveCount) {
  const blackCount = getExpectedBlackAnswerCount(answerMoveCount);
  return Math.max(0, blackCount - 1);
}

export function normalizeAnswerMoveCount(value) {
  const count = Number(value);
  if (ANSWER_MOVE_COUNTS.includes(count)) {
    return count;
  }
  return 1;
}

export function isStudentPly(ply) {
  return ply % 2 === 1;
}

export function isKatagoPly(ply) {
  return ply % 2 === 0;
}
