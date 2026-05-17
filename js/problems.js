(function () {
const BOARD_SIZE = 13;

const STONE = {
  black: "black",
  white: "white",
};

const problems = [
  {
    id: "활로-새-문제-1778978691561",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (4곳)",
    level: "",
    category: "활로",
    stones: [{ x: 3, y: 9, color: "white", mark: "triangle" }],
    correctMove: { x: 2, y: 9 },
    correctSequence: [
      { x: 2, y: 9 },
      { x: 3, y: 8 },
      { x: 3, y: 10 },
      { x: 4, y: 9 },
    ],
  },
  {
    id: "활로-새-문제-1778978944087",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (3곳)",
    level: "",
    category: "활로",
    stones: [{ x: 3, y: 12, color: "white", mark: "triangle" }],
    correctMove: { x: 2, y: 12 },
    correctSequence: [
      { x: 2, y: 12 },
      { x: 3, y: 11 },
      { x: 4, y: 12 },
    ],
  },
  {
    id: "활로-새-문제-1778978982670",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (2곳)",
    level: "",
    category: "활로",
    stones: [{ x: 0, y: 12, color: "white", mark: "triangle" }],
    correctMove: { x: 0, y: 11 },
    correctSequence: [
      { x: 0, y: 11 },
      { x: 1, y: 12 },
    ],
  },
  {
    id: "활로-새-문제-1778979028695",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (2곳)",
    level: "",
    category: "활로",
    stones: [
      { x: 3, y: 9, color: "white", mark: "triangle" },
      { x: 3, y: 8, color: "black" },
      { x: 4, y: 9, color: "black" },
    ],
    correctMove: { x: 2, y: 9 },
    correctSequence: [
      { x: 2, y: 9 },
      { x: 3, y: 10 },
    ],
  },
  {
    id: "활로-새-문제-1778979061595",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (2곳)",
    level: "",
    category: "활로",
    stones: [
      { x: 3, y: 12, color: "white", mark: "triangle" },
      { x: 3, y: 11, color: "black" },
    ],
    correctMove: { x: 2, y: 12 },
    correctSequence: [
      { x: 2, y: 12 },
      { x: 4, y: 12 },
    ],
  },
  {
    id: "활로-새-문제-1778979085402",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (1곳)",
    level: "",
    category: "활로",
    stones: [
      { x: 0, y: 12, color: "white", mark: "triangle" },
      { x: 0, y: 11, color: "black" },
    ],
    correctMove: { x: 1, y: 12 },
    correctSequence: [{ x: 1, y: 12 }],
  },
];

window.BadukProblems = {
  BOARD_SIZE,
  STONE,
  problems,
};
})();
