import { removeCapturedStonesAfterMove, collectConnectedGroup, countGroupLiberties } from "./capture.js";
import { getStoneAtPoint } from "./rules.js";

export const PLACEMENT_STATUS = {
  empty: "empty",
  occupied: "occupied",
  legal: "legal",
  illegal: "illegal",
};

export function evaluatePlacement(stones, move, { boardSize, stoneColors }) {
  if (getStoneAtPoint(stones, move)) {
    return { status: PLACEMENT_STATUS.occupied };
  }

  const stonesWithMove = [...stones, move];
  const { stones: afterCapture } = removeCapturedStonesAfterMove(stonesWithMove, move, {
    boardSize,
    stoneColors,
  });

  if (!getStoneAtPoint(afterCapture, move)) {
    return { status: PLACEMENT_STATUS.illegal, reason: "suicide" };
  }

  const group = collectConnectedGroup(afterCapture, move, boardSize);
  if (countGroupLiberties(afterCapture, group, boardSize) === 0) {
    return { status: PLACEMENT_STATUS.illegal, reason: "suicide" };
  }

  return { status: PLACEMENT_STATUS.legal };
}
