export function bindSolveController({
  elements,
  showListMode,
  showSolveMode,
  showNextProblem,
  showMainMenuTarget,
}) {
  elements.listModeButton?.addEventListener("click", showListMode);
  elements.solveModeButton?.addEventListener("click", showSolveMode);
  elements.nextButton?.addEventListener("click", showNextProblem);
  elements.mainMenuButtons.forEach((button) => {
    button.addEventListener("click", () => showMainMenuTarget(button.dataset.mainMenu));
  });
}
