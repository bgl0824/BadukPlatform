import { canManageInviteCodes } from "../permissions/permission-service.js";
import {
  fetchInviteCodesByAcademyId,
  insertInviteCodeToSupabase,
  logInvite,
} from "../services/academy-invite-service.js";
import { isSupabaseConfigured } from "../services/supabase-client.js";
import {
  isInviteCodeActive,
  readAcademyMembers,
  readInviteCodes,
  removeInviteCode,
  saveInviteCodes,
} from "../services/academy-service.js";

export function createAcademyInviteController({
  elements,
  getCurrentUser,
  isAcademyUser,
  setFeedback,
  escapeHtml,
  formatDateTime,
}) {
  let inviteListEventsBound = false;

  function bindInviteCodeEvents() {
    if (inviteListEventsBound || !elements.inviteCodeList) {
      return;
    }

    inviteListEventsBound = true;
    elements.inviteCodeList.addEventListener("click", handleInviteListClick);
  }

  function handleInviteListClick(event) {
    const copyCodeButton = event.target.closest("[data-copy-invite]");
    if (copyCodeButton) {
      copyInviteCode(copyCodeButton.dataset.copyInvite);
      return;
    }

    const copyLinkButton = event.target.closest("[data-copy-invite-link]");
    if (copyLinkButton) {
      copyInviteLink(copyLinkButton.dataset.copyInviteLink);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-invite-code]");
    if (deleteButton) {
      deleteInviteCode(deleteButton.dataset.deleteInviteCode);
    }
  }

  async function createInviteCode(role) {
    if (!isAcademyUser()) {
      setFeedback("학원장 또는 방과후 계정에서만 초대 코드를 만들 수 있습니다.", "wrong");
      return;
    }

    const currentUser = getCurrentUser();
    const inviteCode = {
      code: generateInviteCode(role),
      role,
      academyId: currentUser.id,
      academyName: currentUser.academyName || currentUser.name || currentUser.username,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      status: "active",
    };

    if (!isSupabaseConfigured()) {
      const inviteCodes = readInviteCodes();
      saveInviteCodes([inviteCode, ...inviteCodes]);
      logInvite("create.localStorage-only", { code: inviteCode.code });
      await renderInviteCodes();
      setFeedback(
        `${getInviteRoleLabel(role)} 가입 코드 ${inviteCode.code}를 만들었습니다. (로컬 저장만 — Supabase 설정 후 다시 생성하세요)`,
        "correct",
      );
      return;
    }

    const result = await insertInviteCodeToSupabase(inviteCode);
    if (!result.ok) {
      setFeedback(result.message || "가입 코드 저장에 실패했습니다.", "wrong");
      return;
    }

    await renderInviteCodes();
    setFeedback(`${getInviteRoleLabel(role)} 가입 코드 ${inviteCode.code}를 만들었습니다.`, "correct");
  }

  async function deleteInviteCode(code) {
    const currentUser = getCurrentUser();
    if (!canManageInviteCodes(currentUser)) {
      setFeedback("초대코드를 삭제할 권한이 없습니다.", "wrong");
      return;
    }

    const confirmed = window.confirm("이 초대코드를 삭제할까요?");
    if (!confirmed) {
      return;
    }

    const result = await removeInviteCode({
      code,
      academyId: currentUser?.id,
    });
    if (!result.ok) {
      setFeedback(result.message || "초대코드 삭제에 실패했습니다.", "wrong");
      return;
    }

    await renderInviteCodes();
    window.alert("초대코드가 삭제되었습니다.");
  }

  async function renderInviteCodes() {
    bindInviteCodeEvents();
    if (!elements.inviteCodeList) {
      return;
    }

    const currentUser = getCurrentUser();
    const canDeleteInvite = canManageInviteCodes(currentUser);
    const listResult = await fetchInviteCodesByAcademyId(currentUser?.id ?? "");
    const inviteCodes = listResult.invites ?? [];
    if (!listResult.ok && listResult.message) {
      setFeedback(`가입 코드 목록을 불러오지 못했습니다: ${listResult.message}`, "wrong");
    }
    const academyMembers = readAcademyMembers().filter((member) => member.academyId === currentUser?.id);
    if (inviteCodes.length === 0) {
      elements.inviteCodeList.innerHTML = `<p class="invite-empty">아직 만든 가입 코드가 없습니다.</p>`;
      return;
    }

    elements.inviteCodeList.innerHTML = inviteCodes
      .map((invite) => {
        const signupLink = getInviteSignupLink(invite.code);
        const usage = getInviteUsageSummary(invite, academyMembers);
        const status = getInviteStatusMeta(invite);
        return `
          <article class="invite-code-card">
            <div class="invite-code-card-body">
              <div class="invite-code-card-head">
                <strong>${escapeHtml(invite.code)}</strong>
                <span class="invite-code-role">${getInviteRoleLabel(invite.role)} 가입용</span>
              </div>
              <div class="invite-code-card-status">
                <span class="invite-status-badge invite-status-badge--${status.tone}">${status.label}</span>
                <a
                  class="invite-signup-link"
                  href="${escapeHtml(signupLink)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="invite-signup-link__icon" aria-hidden="true">↗</span>
                  <span>가입 링크 열기</span>
                </a>
              </div>
              <p class="invite-code-meta">생성일: ${formatDateTime(invite.createdAt)} · ${usage.label}</p>
            </div>
            <div class="invite-card-actions">
              <button class="secondary-button" type="button" data-copy-invite="${escapeHtml(invite.code)}">
                코드 복사
              </button>
              <button class="secondary-button" type="button" data-copy-invite-link="${escapeHtml(signupLink)}">
                링크 복사
              </button>
              ${
                canDeleteInvite
                  ? `<button
                      class="secondary-button invite-delete-button"
                      type="button"
                      data-delete-invite-code="${escapeHtml(invite.code)}"
                    >
                      삭제
                    </button>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function copyInviteCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setFeedback(`가입 코드 ${code}를 복사했습니다.`, "correct");
    } catch {
      setFeedback(`가입 코드: ${code}`, "correct");
    }
  }

  async function copyInviteLink(link) {
    try {
      await navigator.clipboard.writeText(link);
      setFeedback("회원가입 링크를 복사했습니다.", "correct");
    } catch {
      setFeedback(`회원가입 링크: ${link}`, "correct");
    }
  }

  function getInviteSignupLink(code) {
    const signupUrl = new URL("./signup.html", window.location.href);
    signupUrl.searchParams.set("invite", code);
    return signupUrl.toString();
  }

  function generateInviteCode(role) {
    const prefix = role === "teacher" ? "TCH" : "STD";
    return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  function getInviteRoleLabel(role) {
    return role === "teacher" ? "선생님" : "학생";
  }

  function getInviteStatusMeta(invite) {
    if (invite.status === "disabled") {
      return { label: "비활성", tone: "disabled" };
    }

    if (invite.status === "expired") {
      return { label: "만료", tone: "expired" };
    }

    if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now()) {
      return { label: "만료", tone: "expired" };
    }

    return { label: "사용 가능", tone: "active" };
  }

  function getInviteUsageSummary(invite, academyMembers) {
    const usedCount = academyMembers.filter((member) => member.inviteCode === invite.code).length;
    if (usedCount > 0) {
      return { label: `사용됨 ${usedCount}명`, usedCount };
    }

    if (!isInviteCodeActive(invite)) {
      return { label: "미사용 · 만료/비활성", usedCount: 0 };
    }

    return { label: "미사용", usedCount: 0 };
  }

  return {
    bindInviteCodeEvents,
    createInviteCode,
    renderInviteCodes,
    copyInviteCode,
    getInviteSignupLink,
    readInviteCodes,
    saveInviteCodes,
  };
}
