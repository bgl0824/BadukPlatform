import { formatCoordLabel } from "./answer-sequence.js";

function isSameCoord(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

/**
 * 오답 응수 금지 좌표 — 세션 초기화 시 캐시된 whiteAnswers만 사용 (런타임에 problem.full_answer_sequence 미참조).
 * @param {object} session
 * @returns {{ x: number, y: number, label?: string, blackAnswerIndex: number }[]}
 */
export function getForbiddenAuthorWhitePoints(session) {
  if (!session || !Array.isArray(session.whiteAnswers)) {
    return [];
  }

  const index = Number(session.blackAnswerIndex ?? 0);
  const entry = session.whiteAnswers[index];
  if (!entry || !Number.isInteger(entry.x) || !Number.isInteger(entry.y)) {
    return [];
  }

  return [
    {
      x: entry.x,
      y: entry.y,
      label: entry.label ?? formatCoordLabel(entry),
      blackAnswerIndex: index,
    },
  ];
}

export function isForbiddenAuthorWhitePoint(point, session) {
  if (!point) {
    return false;
  }
  return getForbiddenAuthorWhitePoints(session).some((forbidden) =>
    isSameCoord(point, forbidden),
  );
}

export function filterForbiddenAuthorWhiteCandidates(candidates, session) {
  const forbidden = getForbiddenAuthorWhitePoints(session);
  if (forbidden.length === 0) {
    return { candidates: candidates ?? [], removed: [] };
  }

  const removed = [];
  const filtered = (candidates ?? []).filter((candidate) => {
    const point = { x: candidate.x, y: candidate.y };
    const blocked = forbidden.some((entry) => isSameCoord(point, entry));
    if (blocked) {
      removed.push({
        move: candidate.move ?? formatCoordLabel(point),
        x: point.x,
        y: point.y,
        reason: "author_sequence_white_forbidden_on_wrong",
      });
    }
    return !blocked;
  });

  return { candidates: filtered, removed };
}

/**
 * @param {object} params
 * @param {object|null} params.selected
 * @param {string|null} params.selectedReason
 * @param {string} params.source
 * @param {object} params.session
 * @param {object[]} [params.forbiddenPoints]
 * @param {object[]} [params.removedCandidates]
 * @param {object} [params.extra]
 */
export function logWrongRevealSelection({
  selected,
  selectedReason,
  source,
  session,
  forbiddenPoints = getForbiddenAuthorWhitePoints(session),
  removedCandidates = [],
  extra = {},
}) {
  const selectedMove =
    selected?.move ??
    (selected?.point
      ? formatCoordLabel(selected.point)
      : selected?.x != null
        ? formatCoordLabel(selected)
        : null);

  console.log("[AI_RESPONSE] wrong-reveal selection", {
    selectedMove,
    selectedReason: selectedReason ?? selected?.selectedReason ?? null,
    source,
    blackAnswerIndex: session?.blackAnswerIndex ?? null,
    currentPly: session?.currentPly ?? null,
    forbiddenAuthorWhites: forbiddenPoints.map((entry) => entry.label ?? formatCoordLabel(entry)),
    removedAuthorSequenceCandidates: removedCandidates,
    ...extra,
  });

  warnIfSelectedMatchesAuthorSequence({
    selectedPoint: selected?.point ?? selected,
    selectedMove,
    session,
    source,
    forbiddenPoints,
  });
}

export function warnIfSelectedMatchesAuthorSequence({
  selectedPoint,
  selectedMove,
  session,
  source,
  forbiddenPoints = getForbiddenAuthorWhitePoints(session),
}) {
  if (!selectedPoint || forbiddenPoints.length === 0) {
    return false;
  }

  const matched = forbiddenPoints.find((forbidden) => isSameCoord(selectedPoint, forbidden));
  if (!matched) {
    return false;
  }

  console.warn("[AI_RESPONSE] wrong-reveal selectedMove matches author_sequence white (forbidden)", {
    selectedMove: selectedMove ?? formatCoordLabel(selectedPoint),
    selectedReason: null,
    source,
    authorSequenceWhite: matched.label ?? formatCoordLabel(matched),
    blackAnswerIndex: session?.blackAnswerIndex ?? null,
    hint: "오답 경로는 target_white_group 생존 수만 사용해야 합니다. full_answer_sequence 백 수와 동일하면 버그입니다.",
  });
  return true;
}

/**
 * 금지 좌표와 같으면 null, 아니면 그대로 반환
 */
export function rejectForbiddenAuthorWhiteSelection(selected, session) {
  if (!selected?.point && selected?.x == null) {
    return { selected: null, rejected: false };
  }

  const point = selected.point ?? { x: selected.x, y: selected.y };
  if (!isForbiddenAuthorWhitePoint(point, session)) {
    return { selected, rejected: false };
  }

  return {
    selected: null,
    rejected: true,
    rejectedMove: selected.move ?? formatCoordLabel(point),
  };
}
