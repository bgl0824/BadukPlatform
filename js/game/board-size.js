export const DEFAULT_BOARD_SIZE = 13;

export const SUPPORTED_BOARD_SIZES = [9, 13];

export function normalizeBoardSize(value) {
  const size = Number(value);
  if (size === 9) {
    return 9;
  }
  if (size === 13) {
    return 13;
  }
  return DEFAULT_BOARD_SIZE;
}

export function getProblemBoardSize(problem) {
  return normalizeBoardSize(problem?.boardSize ?? problem?.board_size);
}

export function getBoardSizeLabel(size) {
  return `${normalizeBoardSize(size)}줄`;
}
