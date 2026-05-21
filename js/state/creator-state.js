const { STONE } = window.BadukProblems;

export function createCreatorState(categories) {
  return {
    activeTool: STONE.black,
    activeMark: "triangle",
    selectedCategory: categories[0] ?? "",
    problemType: "board",
    oxAnswer: true,
    isCategoryOpen: false,
    stones: [],
    correctMove: null,
    history: [],
  };
}
