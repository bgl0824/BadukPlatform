const PLATFORM_PLACEHOLDER_SECTIONS = [
  {
    title: "학원장(고객) 계정",
    description: "가입한 학원장 목록, 활성 여부, 담당 학원 규모",
    status: "준비 중",
  },
  {
    title: "일반 회원",
    description: "플랫폼 전체 회원 조회 및 계정 상태",
    status: "준비 중",
  },
  {
    title: "구독·결제",
    description: "결제 상태, 만료일, 플랜 변경 이력",
    status: "준비 중",
  },
  {
    title: "학원 운영 지표",
    description: "선생·학생 수, 최근 접속, 학원별 활성도",
    status: "준비 중",
  },
];

export function createPlatformAdminView({ elements, escapeHtml }) {
  function renderPlatformAdminDashboard() {
    if (!elements.platformAdminDashboardBody) {
      return;
    }

    elements.platformAdminDashboardBody.innerHTML = `
      <p class="platform-admin-lead">
        이 화면은 학원 운영·결제·고객 계정 등 <strong>플랫폼 운영</strong> 전용입니다.
        <strong>문제은행</strong>은 모든 역할이 공통으로 쓰는 학습 시스템이며, 상단 <strong>관리자 모드</strong>에서
        문제·커리큘럼(입문/초급 등)을 이전과 같이 관리할 수 있습니다.
      </p>
      <ul class="platform-admin-placeholder-grid" aria-label="플랫폼 운영 메뉴 준비 목록">
        ${PLATFORM_PLACEHOLDER_SECTIONS.map(
          (section) => `
            <li class="platform-admin-placeholder-card">
              <div class="platform-admin-placeholder-card-head">
                <h3>${escapeHtml(section.title)}</h3>
                <span class="platform-admin-placeholder-badge">${escapeHtml(section.status)}</span>
              </div>
              <p>${escapeHtml(section.description)}</p>
            </li>
          `,
        ).join("")}
      </ul>
    `;
  }

  function renderPlatformAdminMenu() {
    if (elements.platformAdminEyebrow) {
      elements.platformAdminEyebrow.textContent = "Platform";
    }
    if (elements.platformAdminTitle) {
      elements.platformAdminTitle.textContent = "플랫폼 운영";
    }
    if (elements.platformAdminDescription) {
      elements.platformAdminDescription.textContent =
        "학원별 학습 데이터가 아닌 서비스 운영·결제·계약 정보를 관리하는 화면입니다.";
    }

    renderPlatformAdminDashboard();
  }

  return {
    renderPlatformAdminDashboard,
    renderPlatformAdminMenu,
  };
}
