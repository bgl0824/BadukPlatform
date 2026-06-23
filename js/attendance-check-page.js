import { createAttendanceCheckKiosk } from "./attendance/attendance-check-kiosk.js";
import {
  applyKioskConnectFromUrl,
  readKioskBinding,
} from "./services/attendance-kiosk-service.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderUnconnected(root) {
  root.innerHTML = `
    <section class="attendance-check-page-unconnected" aria-live="polite">
      <h1>출결 체크</h1>
      <p class="attendance-check-page-unconnected-lead">공용폰이 연결되지 않았습니다.</p>
      <p class="attendance-check-page-unconnected-help">
        원장 화면의 <strong>출결관리 &gt; 공용폰 관리</strong>에서 공용폰 연결 링크를 생성한 뒤,
        이 기기의 브라우저에서 해당 링크를 열어 주세요.
      </p>
    </section>
  `;
}

function bootstrapAttendanceCheckPage() {
  const root = document.querySelector("#attendance-check-page-root");
  if (!root) {
    return;
  }

  applyKioskConnectFromUrl();
  const binding = readKioskBinding();
  if (!binding) {
    renderUnconnected(root);
    return;
  }

  root.innerHTML = '<div id="attendance-check-kiosk-mount" class="attendance-check-kiosk-mount"></div>';
  const mount = root.querySelector("#attendance-check-kiosk-mount");
  if (!mount) {
    return;
  }

  const kiosk = createAttendanceCheckKiosk({
    mount,
    getAcademyContext: () => readKioskBinding(),
    escapeHtml,
    isActive: () => true,
    features: {
      showHeader: false,
      showCurrentTime: true,
      showAcademyBanner: true,
      showKioskOpenLink: false,
      largeLayout: true,
    },
  });

  kiosk.render();
  kiosk.start({ resetAuto: true });

  window.addEventListener("pagehide", () => {
    kiosk.destroy();
  });
}

bootstrapAttendanceCheckPage();
