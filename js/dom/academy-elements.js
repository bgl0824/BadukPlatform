export const academyElements = {

  learningModeButton: document.querySelector('[data-main-menu="learning"]'),

  academyModeButton: document.querySelector('[data-main-menu="academy"]'),

  attendanceModeButton: document.querySelector('[data-main-menu="attendance"]'),

  paymentsModeButton: document.querySelector('[data-main-menu="payments"]'),

  learningMenuButtons: document.querySelectorAll(".learning-only-menu"),

  academyOwnerMenuButtons: document.querySelectorAll(".academy-owner-only-menu"),

  academyMenuButtons: document.querySelectorAll(".learning-only-menu, .academy-owner-only-menu"),

  academyMenuScreen: document.querySelector("#academy-menu-screen"),

  academyMenuEyebrow: document.querySelector("#academy-menu-eyebrow"),

  academyMenuTitle: document.querySelector("#academy-menu-title"),

  academyMenuDescription: document.querySelector("#academy-menu-description"),

  academyManagementSubmenu: document.querySelector("#academy-management-submenu"),

  academySubmenuButtons: document.querySelectorAll("[data-academy-section]"),

  academySectionPanels: document.querySelectorAll("[data-academy-section-panel]"),

  academyStudentsPanel: document.querySelector("#academy-students-panel"),

  academyStudentsTitle: document.querySelector("#academy-students-title"),

  academyStudentsDescription: document.querySelector("#academy-students-description"),

  academyInvitePanel: document.querySelector("#academy-invite-panel"),

  academyTeachersPanel: document.querySelector("#academy-teachers-panel"),

  academyTeachersTitle: document.querySelector("#academy-teachers-title"),

  academyTeachersDescription: document.querySelector("#academy-teachers-description"),

  academyStudentAccountsPanel: document.querySelector("#academy-student-accounts-panel"),

  attendancePanel: document.querySelector("#attendance-panel"),

  attendanceManagementSubmenu: document.querySelector("#attendance-management-submenu"),

  attendanceSubmenuButtons: document.querySelectorAll("[data-attendance-section]"),

  attendanceSectionPanels: document.querySelectorAll("[data-attendance-section-panel]"),

  attendanceMonthlySection: document.querySelector("#attendance-monthly-section"),

  attendancePanelBody: document.querySelector("#attendance-panel-body"),

  attendanceCodesSection: document.querySelector("#attendance-codes-section"),

  attendanceCodesBody: document.querySelector("#attendance-codes-body"),

  attendanceCheckSection: document.querySelector("#attendance-check-section"),

  attendanceCheckBody: document.querySelector("#attendance-check-body"),

  attendanceKioskSection: document.querySelector("#attendance-kiosk-section"),

  attendanceKioskBody: document.querySelector("#attendance-kiosk-body"),

  attendanceSmsLogsSection: document.querySelector("#attendance-sms-logs-section"),

  attendanceSmsLogsBody: document.querySelector("#attendance-sms-logs-body"),

  academyAccountsTitle: document.querySelector("#academy-accounts-title"),

  academyAccountsDescription: document.querySelector("#academy-accounts-description"),


  studentManagementToolbar: document.querySelector("#student-management-toolbar"),

  studentNameSearch: document.querySelector("#student-name-search"),

  studentLevelFilter: document.querySelector("#student-level-filter"),

  studentSortOrder: document.querySelector("#student-sort-order"),

  showInactiveStudentsWrap: document.querySelector("#show-inactive-students-wrap"),

  showInactiveStudents: document.querySelector("#show-inactive-students"),

  showInactiveTeachersWrap: document.querySelector("#show-inactive-teachers-wrap"),

  showInactiveTeachers: document.querySelector("#show-inactive-teachers"),

  studentTeacherFilter: document.querySelector("#student-teacher-filter"),

  academyTeacherList: document.querySelector("#academy-teacher-list"),

  academyStudentList: document.querySelector("#academy-student-list"),

  studentAccountNameSearch: document.querySelector("#student-account-name-search"),

  studentAccountSortOrder: document.querySelector("#student-account-sort-order"),

  showInactiveStudentAccountsWrap: document.querySelector("#show-inactive-student-accounts-wrap"),

  showInactiveStudentAccounts: document.querySelector("#show-inactive-student-accounts"),

  academyStudentAccountList: document.querySelector("#academy-student-account-list"),

  studentReviewModal: document.querySelector("#student-review-modal"),

  studentReviewModalCard: document.querySelector(".student-review-modal-card"),

  studentReviewDragHandle: document.querySelector("#student-review-drag-handle"),

  studentReviewTitle: document.querySelector("#student-review-title"),

  studentReviewList: document.querySelector("#student-review-list"),

  studentReviewSelectAll: document.querySelector("#student-review-select-all"),

  studentReviewPrintSelected: document.querySelector("#student-review-print-selected"),

  studentReviewArchiveSelected: document.querySelector("#student-review-archive-selected"),

  studentReviewDeleteSelected: document.querySelector("#student-review-delete-selected"),

  studentReviewArchivePromptModal: document.querySelector("#student-review-archive-prompt-modal"),

  studentReviewArchivePromptMessage: document.querySelector("#student-review-archive-prompt-message"),

  studentReviewArchivePromptConfirm: document.querySelector("#student-review-archive-prompt-confirm"),

  studentReviewArchivePromptDismiss: document.querySelector("#student-review-archive-prompt-dismiss"),

  toggleArchivedReviewNotes: document.querySelector("#toggle-archived-review-notes"),

  closeStudentReviewModal: document.querySelector("#close-student-review-modal"),

  studentLearningDetailModal: document.querySelector("#student-learning-detail-modal"),

  studentLearningDetailTitle: document.querySelector("#student-learning-detail-title"),

  studentLearningDetailMeta: document.querySelector("#student-learning-detail-meta"),

  studentLearningDetailBody: document.querySelector("#student-learning-detail-body"),

  studentLearningDetailLevelNav: document.querySelector("#student-learning-detail-level-nav"),

  closeStudentLearningDetailModal: document.querySelector("#close-student-learning-detail-modal"),

  studentLearningDetailOpenReview: document.querySelector("#student-learning-detail-open-review"),

  studentAcademyProfileModal: document.querySelector("#student-academy-profile-modal"),

  studentAcademyProfileTitle: document.querySelector("#student-academy-profile-title"),

  studentAcademyProfileMeta: document.querySelector("#student-academy-profile-meta"),

  studentAcademyProfileSections: document.querySelector("#student-academy-profile-sections"),

  closeStudentAcademyProfileModal: document.querySelector("#close-student-academy-profile-modal"),

  studentOfficialGradeModal: document.querySelector("#student-official-grade-modal"),

  studentOfficialGradeTitle: document.querySelector("#student-official-grade-title"),

  studentOfficialGradeMeta: document.querySelector("#student-official-grade-meta"),

  studentOfficialGradeForm: document.querySelector("#student-official-grade-form"),

  studentOfficialGradeCode: document.querySelector("#student-official-grade-code"),

  studentOfficialGradeAcquiredAt: document.querySelector("#student-official-grade-acquired-at"),

  studentOfficialGradeSource: document.querySelector("#student-official-grade-source"),

  closeStudentOfficialGradeModal: document.querySelector("#close-student-official-grade-modal"),

  cancelStudentOfficialGrade: document.querySelector("#cancel-student-official-grade"),

  studentGrowthReportModal: document.querySelector("#student-growth-report-modal"),

  studentGrowthReportTitle: document.querySelector("#student-growth-report-title"),

  studentGrowthReportMeta: document.querySelector("#student-growth-report-meta"),

  studentGrowthReportCard: document.querySelector("#student-growth-report-card"),

  closeStudentGrowthReportModal: document.querySelector("#close-student-growth-report-modal"),

  copyStudentGrowthReportButton: document.querySelector("#copy-student-growth-report"),

  createTeacherCodeButton: document.querySelector("#create-teacher-code"),

  createStudentCodeButton: document.querySelector("#create-student-code"),

  inviteCodeList: document.querySelector("#invite-code-list"),

};

