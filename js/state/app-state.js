export const appState = {
  mode: "list",
  selectedLevelGroup: "입문",
  selectedCategory: "활로",
  problemListSort: "learning",
  problemGradeFilter: "all",
  currentProblemIndex: 0,
  /** problems 배열 재로드 후 index 보정용 */
  currentProblemId: null,
  solvedAnswerKeys: new Set(),
  isSolved: false,
  isAiThinking: false,
  pendingAiTimeout: null,
  autoNextTimeout: null,
  wrongModalTimeout: null,
  wrongResetTimeout: null,
  canDismissAnswerModal: false,
  selectedPrintProblemIds: new Set(),
  playedMoves: [],
  initialBoardStones: [],
  reviewSession: null,
  pendingCategoryCompletion: null,
  studyExpandedLevelGroups: null,
  /** @type {{ examSetId: string, title: string, problemIds: string[], currentIndex: number, sessionMode?: "learning" | "mock", setRole?: string, type?: string, correctCount?: number, wrongProblemNumbers?: number[], mockStartedAt?: number | null } | null} */
  examSession: null,
  /** @deprecated 스팟 UX 프로토타입 */
  aiResponseSession: null,
  /** AI 응수형 풀이 (problem_mode = ai_response) */
  aiResponseSolveSession: null,
  /**
   * 학습중 이어하기/추천 — 카테고리 순서 고정 (문제은행 필터와 무관)
   * @type {{ categoryName: string, levelGroup: string, problemIds: string[], entries: { problemId: string, index: number }[] } | null}
   */
  studySolvePath: null,
};
