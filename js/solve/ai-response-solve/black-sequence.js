export {
  formatCoordLabel,
  normalizeBlackAnswerSequence,
  toBlackAnswerSequencePayload,
  resolveAnswerSequenceConfig,
  resolveBlackAnswerConfig,
  isCorrectBlackMove,
  getExpectedAuthorWhite,
  getNextSequenceColor,
  getSequenceColorLabel,
  toFullAnswerSequencePayload,
  syncDerivedAnswerFields,
  applyFullAnswerSequenceToDraft,
  renumberSequenceMoves,
  validateFullAnswerSequence,
} from "./answer-sequence.js";

import { resolveAnswerSequenceConfig, syncDerivedAnswerFields } from "./answer-sequence.js";

/** correct_move 동기화 */
export function syncLegacyCorrectMove(problem, boardSize = 13) {
  syncDerivedAnswerFields(problem, boardSize);
}
