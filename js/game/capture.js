import { getNeighborPoints, getStoneAtPoint, pointKey } from "./rules.js";

export function removeCapturedStonesAfterMove(stones, move, { boardSize, stoneColors }) {
  const opponentColor =
    move.color === stoneColors.black ? stoneColors.white : stoneColors.black;
  const capturedKeys = new Set();
  const checkedKeys = new Set();

  getNeighborPoints(move, boardSize).forEach((neighbor) => {
    const neighborStone = getStoneAtPoint(stones, neighbor);
    if (!neighborStone || neighborStone.color !== opponentColor) {
      return;
    }

    const neighborKey = pointKey(neighbor);
    if (checkedKeys.has(neighborKey)) {
      return;
    }

    const group = collectConnectedGroup(stones, neighborStone, boardSize);
    group.forEach((stone) => checkedKeys.add(pointKey(stone)));

    if (countGroupLiberties(stones, group, boardSize) === 0) {
      group.forEach((stone) => capturedKeys.add(pointKey(stone)));
    }
  });

  if (capturedKeys.size === 0) {
    return {
      stones: [...stones],
      capturedCount: 0,
    };
  }

  return {
    stones: stones.filter((stone) => !capturedKeys.has(pointKey(stone))),
    capturedCount: capturedKeys.size,
  };
}

export function collectConnectedGroup(stones, startStone, boardSize) {
  const group = [];
  const visited = new Set();
  const queue = [startStone];

  while (queue.length > 0) {
    const stone = queue.shift();
    const key = pointKey(stone);
    if (visited.has(key)) {
      continue;
    }

    visited.add(key);
    group.push(stone);

    getNeighborPoints(stone, boardSize).forEach((neighbor) => {
      const neighborStone = getStoneAtPoint(stones, neighbor);
      if (
        neighborStone &&
        neighborStone.color === startStone.color &&
        !visited.has(pointKey(neighborStone))
      ) {
        queue.push(neighborStone);
      }
    });
  }

  return group;
}

export function countGroupLiberties(stones, group, boardSize) {
  const liberties = new Set();

  group.forEach((stone) => {
    getNeighborPoints(stone, boardSize).forEach((neighbor) => {
      if (!getStoneAtPoint(stones, neighbor)) {
        liberties.add(pointKey(neighbor));
      }
    });
  });

  return liberties.size;
}
