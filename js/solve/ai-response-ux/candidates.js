import { parseGtpCoordinate, pointKey } from "./coordinates.js";

/**
 * @typedef {{ x: number, y: number, color: "blue" | "green", label?: string, source?: string }} AiResponseCandidate
 */

/**
 * KataGo / DB 공통 진입점 — 명시적 후보만 반환 (자동 mock 없음).
 * @param {object} problem
 * @param {{ boardSize?: number, kataGoCandidates?: unknown }} [options]
 * @returns {AiResponseCandidate[]}
 */
export function resolveCandidateResponses(problem, { boardSize = 13, kataGoCandidates = null } = {}) {
  const sources = [
    { list: kataGoCandidates, source: "katago" },
    { list: problem?.candidateResponses, source: "katago" },
    { list: problem?.aiResponseCandidates, source: "configured" },
  ];

  for (const { list, source } of sources) {
    const normalized = normalizeCandidateList(list, boardSize, source);
    if (normalized.length > 0) {
      return normalized.slice(0, 2);
    }
  }

  return [];
}

/** @deprecated resolveCandidateResponses 사용 */
export function resolveAiResponseCandidates(problem, { boardSize = 13 } = {}) {
  return resolveCandidateResponses(problem, { boardSize });
}

/**
 * @param {Array<{ move: string | { x: number, y: number }, color?: string, label?: string }> | null | undefined} rawList
 * @param {number} boardSize
 * @param {string} [source]
 */
export function normalizeCandidateList(rawList, boardSize, source = "configured") {
  if (!Array.isArray(rawList)) {
    return [];
  }

  const normalized = [];

  rawList.forEach((entry) => {
    const color = entry?.color === "green" ? "green" : "blue";
    let point = null;

    if (entry?.move && typeof entry.move === "object") {
      point = { x: Number(entry.move.x), y: Number(entry.move.y) };
    } else if (typeof entry?.move === "string") {
      point = parseGtpCoordinate(entry.move, boardSize);
    } else if (Number.isInteger(entry?.x) && Number.isInteger(entry?.y)) {
      point = { x: entry.x, y: entry.y };
    }

    if (!point || !isEmptyIntersection(point, boardSize)) {
      return;
    }

    normalized.push({
      x: point.x,
      y: point.y,
      color,
      label: entry?.label ?? entry?.move,
      source: entry?.source ?? source,
    });
  });

  return dedupeCandidates(normalized);
}

function isEmptyIntersection(point, boardSize) {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < boardSize &&
    point.y < boardSize
  );
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = pointKey(candidate.x, candidate.y);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
