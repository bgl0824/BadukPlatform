(function () {
const SGF_LETTERS = "abcdefghijklmnopqrstuvwxyz";

function pointToSgf(point) {
  return `${SGF_LETTERS[point.x] ?? ""}${SGF_LETTERS[point.y] ?? ""}`;
}

function createProblemSgf(problem, playedMoves = []) {
  const size = window.BadukProblems?.BOARD_SIZE ?? 13;
  const setupNodes = buildSetupNodes(problem.stones);
  const moveNodes = playedMoves
    .map((move) => `;${move.color === "black" ? "B" : "W"}[${pointToSgf(move)}]`)
    .join("");

  return `(;GM[1]FF[4]SZ[${size}]${setupNodes}${moveNodes})`;
}

function buildSetupNodes(stones = []) {
  const black = stones
    .filter((stone) => stone.color === "black")
    .map((stone) => `[${pointToSgf(stone)}]`)
    .join("");
  const white = stones
    .filter((stone) => stone.color === "white")
    .map((stone) => `[${pointToSgf(stone)}]`)
    .join("");

  return `${black ? `AB${black}` : ""}${white ? `AW${white}` : ""}`;
}

window.BadukSgf = {
  createProblemSgf,
  pointToSgf,
};
})();
