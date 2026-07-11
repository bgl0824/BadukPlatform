const OWNER_MOBILE_MAX_WIDTH = 768;

const OWNER_MOBILE_MODE_TITLES = {
  home: "Home",
  list: "문제은행",
  study: "학습중",
  learning: "학습관리",
  academy: "학원관리",
  attendance: "출결관리",
  payments: "결재확인",
  platform: "플랫폼",
  solve: "문제풀이",
  create: "문제생성",
  paper: "시험지",
};

function isOwnerMobileViewport() {
  return window.matchMedia(`(max-width: ${OWNER_MOBILE_MAX_WIDTH}px)`).matches;
}

export function createOwnerMobileNav({
  elements,
  getCurrentUser,
  canManageAcademy,
  appState,
}) {
  let bound = false;

  function closeMobileMenu() {
    document.body.classList.remove("owner-mobile-menu-open");
    elements.ownerMobileMenuButton?.setAttribute("aria-expanded", "false");
    elements.ownerMobileMenuBackdrop?.setAttribute("aria-hidden", "true");
  }

  function openMobileMenu() {
    document.body.classList.add("owner-mobile-menu-open");
    elements.ownerMobileMenuButton?.setAttribute("aria-expanded", "true");
    elements.ownerMobileMenuBackdrop?.setAttribute("aria-hidden", "false");
  }

  function toggleMobileMenu() {
    if (document.body.classList.contains("owner-mobile-menu-open")) {
      closeMobileMenu();
      return;
    }
    openMobileMenu();
  }

  function updateMobileScreenTitle(mode = appState.mode) {
    if (!elements.ownerMobileTopbarTitle) {
      return;
    }

    elements.ownerMobileTopbarTitle.textContent =
      OWNER_MOBILE_MODE_TITLES[mode] ?? "바둑 학원";
  }

  function syncOwnerMobileUi() {
    const isOwner = canManageAcademy(getCurrentUser());
    document.body.classList.toggle("is-academy-owner-ui", isOwner);

    if (!isOwner) {
      closeMobileMenu();
      elements.ownerMobileTopbar?.classList.add("is-hidden");
      elements.ownerMobileTopbar?.setAttribute("aria-hidden", "true");
      return;
    }

    elements.ownerMobileTopbar?.classList.remove("is-hidden");
    elements.ownerMobileTopbar?.setAttribute("aria-hidden", "false");
    updateMobileScreenTitle();

    if (!isOwnerMobileViewport()) {
      closeMobileMenu();
    }
  }

  function bindOwnerMobileNavEvents() {
    if (bound) {
      return;
    }
    bound = true;

    elements.ownerMobileMenuButton?.addEventListener("click", () => {
      if (!document.body.classList.contains("is-academy-owner-ui")) {
        return;
      }
      toggleMobileMenu();
    });

    elements.ownerMobileMenuBackdrop?.addEventListener("click", () => {
      closeMobileMenu();
    });

    elements.mainMenu?.addEventListener("click", (event) => {
      const menuButton = event.target.closest("[data-main-menu]");
      if (!menuButton || menuButton.classList.contains("is-hidden")) {
        return;
      }
      if (
        document.body.classList.contains("is-academy-owner-ui") &&
        isOwnerMobileViewport()
      ) {
        closeMobileMenu();
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMobileMenu();
      }
    });

    window.addEventListener(
      "resize",
      () => {
        if (!isOwnerMobileViewport()) {
          closeMobileMenu();
        }
      },
      { passive: true },
    );
  }

  return {
    bindOwnerMobileNavEvents,
    syncOwnerMobileUi,
    updateMobileScreenTitle,
    closeMobileMenu,
  };
}
