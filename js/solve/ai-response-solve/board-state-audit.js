import { removeCapturedStonesAfterMove } from "../../game/capture.js";
import { getStoneAtPoint } from "../../game/rules.js";
import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";
import { formatCoordLabel } from "./black-sequence.js";

export function buildBoardStateHash(stones) {
  return [...(stones ?? [])]
    .sort(
      (a, b) =>
        a.y - b.y ||
        a.x - b.x ||
        String(a.color).localeCompare(String(b.color)),
    )
    .map((stone) => `${stone.x},${stone.y},${stone.color}`)
    .join("|");
}

export function inspectBoardPoint(stones, point) {
  if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    return null;
  }

  const stone = getStoneAtPoint(stones, point);
  return {
    label: formatCoordLabel(point),
    x: point.x,
    y: point.y,
    empty: !stone,
    color: stone?.color ?? null,
  };
}

function cloneStones(stones) {
  return (stones ?? []).map((stone) => ({ ...stone }));
}

export function replayBoardFromInitialAndMoves({
  initialStones,
  playedMoves,
  boardSize,
  stoneColors,
}) {
  let stones = cloneStones(initialStones);
  const captureLog = [];

  for (const move of playedMoves ?? []) {
    if (!move || !Number.isInteger(move.x) || !Number.isInteger(move.y)) {
      continue;
    }

    const stone = {
      x: move.x,
      y: move.y,
      color: move.color,
      mark: move.mark,
    };
    stones = stones.filter(
      (entry) => !(entry.x === stone.x && entry.y === stone.y),
    );
    stones.push(stone);

    const captureResult = removeCapturedStonesAfterMove(stones, stone, {
      boardSize,
      stoneColors,
    });
    if (captureResult.capturedCount > 0) {
      captureLog.push({
        move: formatCoordLabel(stone),
        color: stone.color,
        capturedCount: captureResult.capturedCount,
      });
    }
    stones = captureResult.stones;
  }

  return { stones, captureLog };
}

function resolveProbePoint(moveLabel, boardSize) {
  if (!moveLabel) {
    return null;
  }
  if (typeof moveLabel === "string") {
    return parseGtpCoordinate(moveLabel, boardSize);
  }
  if (Number.isInteger(moveLabel.x) && Number.isInteger(moveLabel.y)) {
    return moveLabel;
  }
  return null;
}

function buildLastBlackMoveCaptureAudit({
  initialStones,
  playedMoves,
  lastBlackMove,
  liveStones,
  boardSize,
  stoneColors,
}) {
  if (!lastBlackMove || !Array.isArray(playedMoves) || playedMoves.length === 0) {
    return null;
  }

  const beforeWrongMoves = playedMoves.slice(0, -1);
  const replayedBeforeWrong = replayBoardFromInitialAndMoves({
    initialStones,
    playedMoves: beforeWrongMoves,
    boardSize,
    stoneColors,
  });

  const stonesWithLastMove = [
    ...replayedBeforeWrong.stones.filter(
      (stone) =>
        !(stone.x === lastBlackMove.x && stone.y === lastBlackMove.y),
    ),
    lastBlackMove,
  ];
  const captureResult = removeCapturedStonesAfterMove(
    stonesWithLastMove,
    lastBlackMove,
    { boardSize, stoneColors },
  );
  const hashAfterCapture = buildBoardStateHash(captureResult.stones);
  const liveHash = buildBoardStateHash(liveStones);

  return {
    move: formatCoordLabel(lastBlackMove),
    capturedCount: captureResult.capturedCount,
    hashAfterCapture,
    matchesLiveHash: hashAfterCapture === liveHash,
    replayedBeforeWrongHash: buildBoardStateHash(replayedBeforeWrong.stones),
  };
}

/**
 * Compare live board snapshot (payload.stones / scoreableCheck) with
 * initialStones+moves replay (what goban KataGo analysis uses).
 */
export function auditKatagoStonesParity({
  boardSize,
  stoneColors,
  initialStones,
  playedMoves,
  liveStones,
  lastBlackMove = null,
  probeMoves = [],
  scoreableBoardStateHash = null,
  channel = "request",
}) {
  const liveHash = buildBoardStateHash(liveStones);
  const initialHash = buildBoardStateHash(initialStones);

  const replayed = replayBoardFromInitialAndMoves({
    initialStones,
    playedMoves,
    boardSize,
    stoneColors,
  });
  const katagoReplayHash = buildBoardStateHash(replayed.stones);

  const beforeWrongMoves =
    lastBlackMove && playedMoves?.length
      ? playedMoves.slice(0, -1)
      : (playedMoves ?? []);
  const replayedBeforeWrong = replayBoardFromInitialAndMoves({
    initialStones,
    playedMoves: beforeWrongMoves,
    boardSize,
    stoneColors,
  });

  const probePoints = probeMoves
    .map((moveLabel) => {
      const point = resolveProbePoint(moveLabel, boardSize);
      if (!point) {
        return { move: moveLabel, error: "unparseable" };
      }
      const label =
        typeof moveLabel === "string" ? moveLabel : formatCoordLabel(point);
      const live = inspectBoardPoint(liveStones, point);
      const katagoReplay = inspectBoardPoint(replayed.stones, point);
      const beforeWrongBlack = inspectBoardPoint(replayedBeforeWrong.stones, point);
      return {
        move: label,
        live,
        katagoReplay,
        beforeWrongBlack,
        mismatchLiveVsKatagoReplay:
          Boolean(live && katagoReplay) &&
          live.empty !== katagoReplay.empty,
      };
    })
    .filter(Boolean);

  const audit = {
    channel,
    note:
      "KataGo goban uses initialStones+moves replay; scoreableCheck uses payload.stones snapshot",
    payloadStonesHash: liveHash,
    initialStonesHash: initialHash,
    katagoReplayHash,
    katagoReplayMatchesPayload: katagoReplayHash === liveHash,
    beforeWrongBlackHash: buildBoardStateHash(replayedBeforeWrong.stones),
    scoreableBoardStateHash: scoreableBoardStateHash ?? null,
    scoreableMatchesPayload:
      scoreableBoardStateHash != null
        ? scoreableBoardStateHash === liveHash
        : null,
    scoreableMatchesKatagoReplay:
      scoreableBoardStateHash != null
        ? scoreableBoardStateHash === katagoReplayHash
        : null,
    lastBlackMoveCapture: buildLastBlackMoveCaptureAudit({
      initialStones,
      playedMoves,
      lastBlackMove,
      liveStones,
      boardSize,
      stoneColors,
    }),
    replayCaptureLog: replayed.captureLog,
    stoneCounts: {
      payloadStones: liveStones?.length ?? 0,
      katagoReplay: replayed.stones.length,
      initialStones: initialStones?.length ?? 0,
      playedMoves: playedMoves?.length ?? 0,
    },
    probePoints,
  };

  console.warn("[KatagoRespond] stones parity audit", audit);
  return audit;
}
