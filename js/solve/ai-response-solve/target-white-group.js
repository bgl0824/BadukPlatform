import { collectConnectedGroup, countGroupLiberties } from "../../game/capture.js";
import { getNeighborPoints, getStoneAtPoint, isOnBoard, pointKey } from "../../game/rules.js";
import { formatCoordLabel } from "./answer-sequence.js";
import {
  getTargetColorForGoal,
  resolveProblemGoal,
} from "./problem-goal.js";

const DEFAULT_TARGET_MARK = "triangle";

/**
 * 타깃 백 그룹 정책 (환격·먹여치기·사활 공통)
 * - 백돌에 △(target_white_mark, 기본 triangle) 1개만 찍어도
 *   **그 돌이 속한 연결 백그룹 전체**가 타깃입니다.
 * - 서로 연결되지 않은 백그룹에 △를 여러 개 찍으면, 각 그룹(연결 성분)마다 타깃이 추가됩니다.
 * - △ 표시된 돌만 단독 타깃으로 두지 않습니다 (연결 확장).
 */
export const TARGET_WHITE_GROUP_POLICY = "expand_connected_from_mark";

/**
 * @typedef {{
 *   seedPoints: { x: number, y: number }[],
 *   seedSource: "stones_mark" | "target_white_group_db" | "target_black_group_db" | "none",
 *   groups: object[][],
 *   stoneKeys: Set<string>,
 *   minLiberties: number,
 *   atariLibertyKeys: Set<string>,
 *   totalStones: number,
 *   targetMark: string,
 *   targetColor: "white"|"black",
 *   groupSummaries: object[],
 * }} TargetGroupContext
 */

/** @typedef {TargetGroupContext} TargetWhiteContext */

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

function collectMarkedSeedsFromProblemStones(problem, mark, boardSize, color = "white") {
  return (problem?.stones ?? [])
    .filter((stone) => stone.color === color && stone.mark === mark)
    .map((stone) => normalizePoint(stone, boardSize))
    .filter(Boolean);
}

function collectExplicitSeedsFromProblem(problem, boardSize, targetColor = "white") {
  const explicit =
    targetColor === "black"
      ? (problem?.targetBlackGroup ?? problem?.target_black_group)
      : (problem?.targetWhiteGroup ??
        problem?.target_white_group ??
        problem?.targetStones ??
        problem?.target_stones);

  if (!Array.isArray(explicit) || explicit.length === 0) {
    return [];
  }

  return explicit.map((entry) => normalizePoint(entry, boardSize)).filter(Boolean);
}

/**
 * 시드(△ 또는 DB 좌표)가 포함된 연결 그룹 전체를 반환
 */
export function expandSeedsToConnectedGroups(
  seedPoints,
  stones,
  boardSize,
  stoneColors,
  color = "white",
) {
  if (!seedPoints?.length) {
    return [];
  }

  const seedKeys = new Set(seedPoints.map((p) => pointKey(p)));
  const groups = getGroupsForColor(stones, color, boardSize);
  return groups.filter((group) =>
    group.some((stone) => seedKeys.has(pointKey(stone))),
  );
}

/** @deprecated — use expandSeedsToConnectedGroups */
export function expandSeedsToConnectedWhiteGroups(seedPoints, stones, boardSize, stoneColors) {
  return expandSeedsToConnectedGroups(
    seedPoints,
    stones,
    boardSize,
    stoneColors,
    stoneColors.white,
  );
}

function buildGroupSummaries(targetGroups, stones, boardSize) {
  return targetGroups.map((group, index) => {
    const libertyKeys = getGroupLibertyKeys(stones, group, boardSize);
    const liberties = [...libertyKeys].map((key) => {
      const [x, y] = key.split(":").map(Number);
      return formatCoordLabel({ x, y });
    });

    return {
      groupIndex: index,
      stones: group.map((stone) => formatCoordLabel(stone)),
      stoneCount: group.length,
      libertyCount: libertyKeys.size,
      liberties: liberties.join(", "),
      libertiesList: liberties,
      atari: libertyKeys.size === 1,
      soleLiberty: libertyKeys.size === 1 ? liberties[0] ?? null : null,
    };
  });
}

function buildTargetContextFromGroups(
  targetGroups,
  seedPoints,
  targetMark,
  seedSource,
  stones,
  boardSize,
  targetColor = "white",
) {
  const stoneKeys = new Set();
  targetGroups.forEach((group) => {
    group.forEach((stone) => stoneKeys.add(pointKey(stone)));
  });

  const groupSummaries = buildGroupSummaries(targetGroups, stones, boardSize);

  const context = {
    seedPoints,
    seedSource,
    groups: targetGroups,
    stoneKeys,
    minLiberties: 0,
    atariLibertyKeys: new Set(),
    totalStones: stoneKeys.size,
    targetMark,
    targetColor,
    groupSummaries,
    policy: TARGET_WHITE_GROUP_POLICY,
  };

  return enrichContextWithLiberties(context, stones, boardSize);
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
  context.groupSummaries = buildGroupSummaries(context.groups, stones, boardSize);
  return context;
}

/**
 * problem_goal 또는 targetColor 기준 타깃 그룹 해석
 * @param {object} problem
 * @param {object[]} stones
 * @param {number} boardSize
 * @param {{ black: string, white: string }} stoneColors
 * @param {"white"|"black"|null} [targetColorOverride]
 */
export function resolveTargetGroup(
  problem,
  stones,
  boardSize,
  stoneColors,
  targetColorOverride = null,
) {
  const goal = resolveProblemGoal(problem);
  const targetColor =
    targetColorOverride ?? (goal ? getTargetColorForGoal(goal) : "white");

  const mark =
    targetColor === "black"
      ? (problem?.targetBlackMark ?? problem?.target_black_mark ?? DEFAULT_TARGET_MARK)
      : (problem?.targetWhiteMark ?? problem?.target_white_mark ?? DEFAULT_TARGET_MARK);

  const markedSeeds = collectMarkedSeedsFromProblemStones(
    problem,
    mark,
    boardSize,
    targetColor,
  );
  const explicitSeeds = collectExplicitSeedsFromProblem(problem, boardSize, targetColor);
  const dbSeedSource =
    targetColor === "black" ? "target_black_group_db" : "target_white_group_db";

  let seedPoints = [];
  let seedSource = "none";

  if (markedSeeds.length > 0) {
    seedPoints = markedSeeds;
    seedSource = "stones_mark";
    if (explicitSeeds.length > 0) {
      const markedKeys = new Set(markedSeeds.map((p) => pointKey(p)));
      const dbOnly = explicitSeeds.filter((p) => !markedKeys.has(pointKey(p)));
      if (dbOnly.length > 0) {
        console.warn("[TargetGroup] DB target group has coords not covered by △ marks", {
          problemId: problem?.id,
          targetColor,
          dbOnly: dbOnly.map((p) => formatCoordLabel(p)),
          policy: TARGET_WHITE_GROUP_POLICY,
        });
      }
    }
  } else if (explicitSeeds.length > 0) {
    seedPoints = explicitSeeds;
    seedSource = dbSeedSource;
  }

  if (seedPoints.length === 0) {
    return null;
  }

  const targetGroups = expandSeedsToConnectedGroups(
    seedPoints,
    stones,
    boardSize,
    stoneColors,
    targetColor,
  );

  if (targetGroups.length === 0) {
    console.warn("[TargetGroup] no group on current board matches seeds", {
      problemId: problem?.id,
      targetColor,
      seedSource,
      seeds: seedPoints.map((p) => formatCoordLabel(p)),
      policy: TARGET_WHITE_GROUP_POLICY,
    });
    return null;
  }

  return buildTargetContextFromGroups(
    targetGroups,
    seedPoints,
    mark,
    seedSource,
    stones,
    boardSize,
    targetColor,
  );
}

/**
 * @deprecated — use resolveTargetGroup
 */
export function resolveTargetWhiteGroup(problem, stones, boardSize, stoneColors) {
  return resolveTargetGroup(problem, stones, boardSize, stoneColors, "white");
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

  const targetColor = targetContext.targetColor ?? "white";
  const afterContext = resolveTargetGroup(
    problem,
    stones,
    boardSize,
    stoneColors,
    targetColor,
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
  return formatCoordLabel({ x, y });
}

/**
 * 선택 수가 어느 타깃 그룹의 활로인지
 */
export function findSelectedMoveLibertySource(point, targetContext, stones, boardSize) {
  if (!point || !targetContext?.groups?.length) {
    return null;
  }

  const moveKey = pointKey(point);
  const moveLabel = formatCoordLabel(point);

  for (let index = 0; index < targetContext.groups.length; index += 1) {
    const group = targetContext.groups[index];
    const libertyKeys = getGroupLibertyKeys(stones, group, boardSize);
    if (!libertyKeys.has(moveKey)) {
      continue;
    }

    const liberties = [...libertyKeys].map((key) => pointKeyToCoordLabel(key));
    const groupStones = group.map((stone) => formatCoordLabel(stone));

    return {
      selectedMove: moveLabel,
      groupIndex: index,
      groupStones: groupStones.join(", "),
      groupStonesList: groupStones,
      groupLibertyCount: libertyKeys.size,
      groupLiberties: liberties.join(", "),
      groupLibertiesList: liberties,
      isSoleLiberty: libertyKeys.size === 1,
      matchedAs: libertyKeys.size === 1 ? "sole_liberty_of_group" : "one_of_liberties",
    };
  }

  return {
    selectedMove: moveLabel,
    groupIndex: null,
    matchedAs: "not_on_any_target_group_liberty",
  };
}

/**
 * problem_goal 기준 △ 표시 → target_white_group / target_black_group 동기화
 */
export function syncTargetGroupOnProblem(problem, boardSize = 13, mark = DEFAULT_TARGET_MARK) {
  const stoneColors = { black: "black", white: "white" };
  const goal = resolveProblemGoal(problem);
  const targetColor = goal ? getTargetColorForGoal(goal) : "white";
  const targetMark =
    targetColor === "black"
      ? (problem?.targetBlackMark ?? problem?.target_black_mark ?? mark)
      : (problem?.targetWhiteMark ?? problem?.target_white_mark ?? mark);
  const layoutStones = problem?.stones ?? [];

  const markedSeeds = collectMarkedSeedsFromProblemStones(
    { stones: layoutStones },
    targetMark,
    boardSize,
    targetColor,
  );

  const emptyResult = {
    entries: [],
    expandedGroups: [],
    targetColor,
    policy: TARGET_WHITE_GROUP_POLICY,
  };

  if (markedSeeds.length === 0) {
    if (targetColor === "black") {
      problem.targetBlackMark = targetMark;
      problem.target_black_mark = targetMark;
      problem.targetBlackGroup = [];
      problem.target_black_group = [];
    } else {
      problem.targetWhiteMark = targetMark;
      problem.target_white_mark = targetMark;
      problem.targetWhiteGroup = [];
      problem.target_white_group = [];
    }
    return emptyResult;
  }

  const targetGroups = expandSeedsToConnectedGroups(
    markedSeeds,
    layoutStones,
    boardSize,
    stoneColors,
    targetColor,
  );

  const entries = [];
  const seen = new Set();
  targetGroups.forEach((group) => {
    group.forEach((stone) => {
      const key = pointKey(stone);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      entries.push({ x: stone.x, y: stone.y });
    });
  });

  const expandedGroups = targetGroups.map((group, index) => ({
    groupIndex: index,
    stones: group.map((stone) => formatCoordLabel(stone)).join(", "),
    stoneCount: group.length,
  }));

  if (targetColor === "black") {
    problem.targetBlackMark = targetMark;
    problem.target_black_mark = targetMark;
    problem.targetBlackGroup = entries;
    problem.target_black_group = entries;
  } else {
    problem.targetWhiteMark = targetMark;
    problem.target_white_mark = targetMark;
    problem.targetWhiteGroup = entries;
    problem.target_white_group = entries;
  }

  return {
    entries,
    expandedGroups,
    markedSeeds: markedSeeds.map((p) => formatCoordLabel(p)),
    targetColor,
    policy: TARGET_WHITE_GROUP_POLICY,
  };
}

/** @deprecated — use syncTargetGroupOnProblem */
export function syncTargetWhiteGroupOnProblem(problem, boardSize = 13, mark = DEFAULT_TARGET_MARK) {
  return syncTargetGroupOnProblem(problem, boardSize, mark);
}

/**
 * 콘솔용 — GTP 좌표 문자열로 펼침
 */
export function buildTargetWhiteGroupDiagnosticLog(targetContext, stones, boardSize) {
  if (!targetContext) {
    return {
      resolved: false,
      policy: TARGET_WHITE_GROUP_POLICY,
    };
  }

  const allTargetStones = [...targetContext.stoneKeys].map((key) =>
    pointKeyToCoordLabel(key),
  );
  const allLiberties = getTargetLibertyPoints(targetContext, stones, boardSize).map((p) =>
    formatCoordLabel(p),
  );
  const atariLiberties = [...(targetContext.atariLibertyKeys ?? [])].map((key) =>
    pointKeyToCoordLabel(key),
  );

  return {
    resolved: true,
    policy: TARGET_WHITE_GROUP_POLICY,
    targetColor: targetContext.targetColor ?? "white",
    seedSource: targetContext.seedSource,
    targetMark: targetContext.targetMark,
    markedSeeds: (targetContext.seedPoints ?? []).map((p) => formatCoordLabel(p)).join(", "),
    targetWhiteGroupStones: allTargetStones.join(", "),
    targetGroupStones: allTargetStones.join(", "),
    targetWhiteGroupStoneCount: allTargetStones.length,
    targetGroupStoneCount: allTargetStones.length,
    targetGroupCount: targetContext.groups?.length ?? 0,
    targetGroupLibertiesMin: targetContext.minLiberties,
    targetLiberties: allLiberties.join(", "),
    targetLibertiesList: allLiberties,
    atariLibertyKeys: atariLiberties.join(", "),
    groups: targetContext.groupSummaries?.map((summary) => ({
      groupIndex: summary.groupIndex,
      stones: summary.stones,
      liberties: summary.liberties,
      soleLiberty: summary.soleLiberty,
    })),
  };
}

export function formatTargetWhiteGroupForLog(targetContext, stones, boardSize) {
  return buildTargetWhiteGroupDiagnosticLog(targetContext, stones, boardSize);
}
