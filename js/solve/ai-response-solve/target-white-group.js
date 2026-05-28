import { collectConnectedGroup, countGroupLiberties } from "../../game/capture.js";
import { getNeighborPoints, getStoneAtPoint, isOnBoard, pointKey } from "../../game/rules.js";

const DEFAULT_TARGET_MARK = "triangle";

/**
 * @typedef {{
 *   seedPoints: { x: number, y: number }[],
 *   groups: object[][],
 *   stoneKeys: Set<string>,
 *   minLiberties: number,
 *   atariLibertyKeys: Set<string>,
 *   totalStones: number,
 *   targetMark: string,
 * }} TargetWhiteContext
 */

function normalizePoint(entry, boardSize) {
  if (!entry) {
    return null;
  }
  if (Number.isInteger(entry.x) && Number.isInteger(entry.y)) {
    const point = { x: entry.x, y: entry.y };
    return isOnBoard(point, boardSize) ? point : null;
  }
  if (typeof entry === "string" && entry.includes(",")) {
    const [x, y] = entry.split(",").map(Number);
    const point = { x, y };
    return isOnBoard(point, boardSize) ? point : null;
  }
  return null;
}

function getGroupsForColor(stones, color, boardSize) {
  const groups = [];
  const visited = new Set();

  for (const stone of stones) {
    if (stone.color !== color) {
      continue;
    }
    const key = pointKey(stone);
    if (visited.has(key)) {
      continue;
    }
    const group = collectConnectedGroup(stones, stone, boardSize);
    group.forEach((s) => visited.add(pointKey(s)));
    groups.push(group);
  }

  return groups;
}

function getGroupLibertyKeys(stones, group, boardSize) {
  const liberties = new Set();
  group.forEach((stone) => {
    getNeighborPoints(stone, boardSize).forEach((neighbor) => {
      if (!getStoneAtPoint(stones, neighbor)) {
        liberties.add(pointKey(neighbor));
      }
    });
  });
  return liberties;
}

function buildTargetContextFromGroups(targetGroups, seedPoints, targetMark) {
  const stoneKeys = new Set();
  const atariLibertyKeys = new Set();
  let minLiberties = 99;
  let totalStones = 0;

  for (const group of targetGroups) {
    totalStones += group.length;
    group.forEach((stone) => stoneKeys.add(pointKey(stone)));
  }

  return {
    seedPoints,
    groups: targetGroups,
    stoneKeys,
    minLiberties: minLiberties === 99 ? 0 : minLiberties,
    atariLibertyKeys,
    totalStones,
    targetMark,
  };
}

function enrichContextWithLiberties(context, stones, boardSize) {
  let minLiberties = 99;
  const atariLibertyKeys = new Set();

  for (const group of context.groups) {
    const libs = countGroupLiberties(stones, group, boardSize);
    minLiberties = Math.min(minLiberties, libs);
    const libertyKeys = getGroupLibertyKeys(stones, group, boardSize);
    if (libertyKeys.size === 1) {
      libertyKeys.forEach((key) => atariLibertyKeys.add(key));
    }
  }

  context.minLiberties = minLiberties === 99 ? 0 : minLiberties;
  context.atariLibertyKeys = atariLibertyKeys;
  return context;
}

/**
 * 문제·표시(△)·명시 좌표에서 타깃 백 그룹 해석
 */
export function resolveTargetWhiteGroup(problem, stones, boardSize, stoneColors) {
  const mark =
    problem?.targetWhiteMark ??
    problem?.target_white_mark ??
    DEFAULT_TARGET_MARK;

  let seedPoints = [];

  const explicit =
    problem?.targetWhiteGroup ??
    problem?.target_white_group ??
    problem?.targetStones ??
    problem?.target_stones;

  if (Array.isArray(explicit) && explicit.length > 0) {
    seedPoints = explicit
      .map((entry) => normalizePoint(entry, boardSize))
      .filter(Boolean);
  }

  if (seedPoints.length === 0) {
    seedPoints = (stones ?? [])
      .filter((stone) => stone.color === stoneColors.white && stone.mark === mark)
      .map((stone) => ({ x: stone.x, y: stone.y }));
  }

  if (seedPoints.length === 0) {
    return null;
  }

  const seedKeys = new Set(seedPoints.map((p) => pointKey(p)));
  const whiteGroups = getGroupsForColor(stones, stoneColors.white, boardSize);
  const targetGroups = whiteGroups.filter((group) =>
    group.some((stone) => seedKeys.has(pointKey(stone))),
  );

  if (targetGroups.length === 0) {
    return null;
  }

  const context = buildTargetContextFromGroups(targetGroups, seedPoints, mark);
  return enrichContextWithLiberties(context, stones, boardSize);
}

/**
 * 착수 후 타깃 그룹 활로 지표 (같은 seed 기준으로 그룹 재계산)
 */
export function measureTargetGroupAfterMove(
  problem,
  stones,
  boardSize,
  stoneColors,
  targetContext,
) {
  if (!targetContext) {
    return null;
  }

  const afterContext = resolveTargetWhiteGroup(
    {
      ...problem,
      targetWhiteGroup: targetContext.seedPoints,
      target_white_group: targetContext.seedPoints,
      targetWhiteMark: targetContext.targetMark,
    },
    stones,
    boardSize,
    stoneColors,
  );

  if (!afterContext) {
    return { minLiberties: 0, atariLibertyKeys: new Set(), libertyGain: 0 };
  }

  const libertyGain = afterContext.minLiberties - targetContext.minLiberties;
  return {
    minLiberties: afterContext.minLiberties,
    atariLibertyKeys: afterContext.atariLibertyKeys,
    libertyGain,
  };
}

export function isMoveAdjacentToTargetGroup(point, targetContext, stones, boardSize) {
  if (!targetContext?.stoneKeys?.size) {
    return false;
  }

  for (const neighbor of getNeighborPoints(point, boardSize)) {
    const stone = getStoneAtPoint(stones, neighbor);
    if (stone && targetContext.stoneKeys.has(pointKey(stone))) {
      return true;
    }
  }
  return false;
}

export function isMoveOnTargetAtariLiberty(moveKey, targetContext) {
  return Boolean(targetContext?.atariLibertyKeys?.has(moveKey));
}

/** 타깃 그룹(들)의 현재 활로 좌표 */
export function getTargetLibertyPoints(targetContext, stones, boardSize) {
  if (!targetContext?.groups?.length) {
    return [];
  }

  const points = [];
  const seen = new Set();

  for (const group of targetContext.groups) {
    const libertyKeys = getGroupLibertyKeys(stones, group, boardSize);
    libertyKeys.forEach((key) => {
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      const [x, y] = key.split(":").map(Number);
      if (Number.isInteger(x) && Number.isInteger(y)) {
        points.push({ x, y });
      }
    });
  }

  return points;
}

export function pointKeyToCoordLabel(key) {
  const [x, y] = String(key).split(":").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return key;
  }
  return `${x},${y}`;
}

/**
 * 관리자 저장 시 △ 표시 백돌 → target_white_group 동기화
 */
export function syncTargetWhiteGroupOnProblem(problem, mark = DEFAULT_TARGET_MARK) {
  const targetMark = problem?.targetWhiteMark ?? problem?.target_white_mark ?? mark;
  const entries = (problem.stones ?? [])
    .filter((stone) => stone.color === "white" && stone.mark === targetMark)
    .map((stone) => ({ x: stone.x, y: stone.y }));

  problem.targetWhiteMark = targetMark;
  problem.target_white_mark = targetMark;
  problem.targetWhiteGroup = entries;
  problem.target_white_group = entries;
  return entries;
}

export function formatTargetWhiteGroupForLog(targetContext) {
  if (!targetContext) {
    return null;
  }

  return {
    targetMark: targetContext.targetMark,
    seedCount: targetContext.seedPoints?.length ?? 0,
    groupCount: targetContext.groups?.length ?? 0,
    stoneCount: targetContext.totalStones ?? 0,
    minLiberties: targetContext.minLiberties,
    atariLibertyKeys: [...(targetContext.atariLibertyKeys ?? [])],
    seedPoints: targetContext.seedPoints,
  };
}
