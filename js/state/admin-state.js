const { STONE } = window.BadukProblems;

export const adminState = {
  isEnabled: false,
  listPanel: "problems",
  problemSortMode: false,
  gradeAssignment: {
    selectedProblemIds: new Set(),
    showUnassignedOnly: false,
    rangeFrom: 1,
    rangeTo: 1,
  },
  examSetManager: {
    sets: [],
    selectedSetId: null,
    draft: null,
    loading: false,
  },
  editingIndex: null,
  draft: null,
  activeTool: STONE.black,
  activeMark: "triangle",
};
