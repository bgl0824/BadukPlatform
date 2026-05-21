export const LEVEL_GROUPS = ["입문", "초급", "중급", "고급", "유단자"];

export const DEFAULT_LEVEL_GROUP = "입문";

export const LEVEL_GROUP_INFO = {
  입문: {
    title: "입문 과정",
    description: "바둑의 기본 규칙과 필수 개념을 익히는 단계입니다.",
  },
  초급: {
    title: "초급 과정",
    description: "기본기를 다지고 실전 감각을 키우는 단계입니다.",
  },
  중급: {
    title: "중급 과정",
    description: "전술과 형세 판단을 심화하는 단계입니다.",
  },
  고급: {
    title: "고급 과정",
    description: "복잡한 수읽기와 실전 적용을 연습하는 단계입니다.",
  },
  유단자: {
    title: "유단자 과정",
    description: "고급 전술과 끝내기까지 종합적으로 다루는 단계입니다.",
  },
};

export function normalizeLevelGroup(value) {
  const normalized = String(value ?? "").trim();
  return LEVEL_GROUPS.includes(normalized) ? normalized : DEFAULT_LEVEL_GROUP;
}

export function isLevelGroup(value) {
  return LEVEL_GROUPS.includes(String(value ?? "").trim());
}

export function getLevelGroupInfo(levelGroup) {
  const normalized = normalizeLevelGroup(levelGroup);
  return LEVEL_GROUP_INFO[normalized] ?? LEVEL_GROUP_INFO[DEFAULT_LEVEL_GROUP];
}
