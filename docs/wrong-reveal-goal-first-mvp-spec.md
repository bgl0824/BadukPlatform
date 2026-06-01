# Wrong Reveal Goal-First MVP Spec (Phase 1)

**브랜치:** `feature/wrong-reveal-goal-first`  
**기준:** `main`의 `katago_filter` 경로 유지, feature flag로 분기  
**Phase 1 범위:** `target_survival` / escape 계열만  
**QA:** `resolveWhiteResponse` 경로 그대로 재사용

---

## 1. 목적

오답 reveal 백 응수 선택을

```
KataGo 전역 후보 → 다중 hard filter → fallback
```

에서

```
problem_goal + target_group → goal-aligned 후보 pool → (KataGo 순위 보조) → pick
```

으로 전환한다. Phase 1은 **target 생존(escape)형**만 구현하고, 나머지 goal은 flag ON이어도 `katago_filter`로 graceful fallback한다.

---

## 2. Feature Flag

### 2.1 런타임 설정

| 키 | 타입 | 기본값 | 설명 |
|----|------|--------|------|
| `BadukConfig.wrongRevealPolicy` | `"goal_first" \| "katago_filter"` | `"katago_filter"` | 오답 reveal 선택 정책 |

**main 기본:** `katago_filter` — 기존 동작 100% 유지.

**실험 브랜치 검증:** `goal_first` — Phase 1 goal-first 선택기 사용.

### 2.2 빌드/배포

`scripts/generate-runtime-config.js`에 추가:

```javascript
wrongRevealPolicy: process.env.WRONG_REVEAL_POLICY === "goal_first"
  ? "goal_first"
  : "katago_filter",
```

Vercel Preview에서만 `WRONG_REVEAL_POLICY=goal_first` 설정 가능. Production main은 unset → `katago_filter`.

### 2.3 분기 위치 (단일)

`js/solve/ai-response-solve/katago-respond-client.js` — wrong reveal 최종 선택 직전:

```
if (resolveWrongRevealPolicy() === "goal_first" && isPhase1Goal(problem)) {
  return selectWrongRevealMove({ ... });  // goal-first
}
// else: 기존 selectWrongRevealKatagoFirstMove / local fallback (변경 없음)
```

`resolveWhiteResponse` / `engine.js` / QA는 **분기하지 않음**.

---

## 3. `problem_goal` Enum (Phase 1)

### 3.1 전체 enum (설계상; Phase 1에서 **활성**은 `target_survival`만)

| 값 | Phase | 설명 |
|----|-------|------|
| `auto` | 1 | 미지정 시 추론 (아래 §3.3) |
| `target_survival` | **1 ✓** | △ target 백 그룹 생존 (단수 연장·활로 확보·연결) |
| `capture_black` | 2 | 흑 잡기·단수치기 |
| `connect_groups` | 2 | 백 그룹 연결 우선 |
| `sacrifice_exchange` | 2 | 희생·먹여치기·환격 |
| `encirclement_block` | 2 | 장문·포위·도망로 차단 |

### 3.2 Phase 1 활성 goal

```typescript
/** Phase 1에서 goal-first path가 처리하는 goal */
type Phase1ActiveGoal = "target_survival";

/** Phase 1에서 goal-first path 진입 가능 여부 */
function isPhase1Goal(problemGoal: ResolvedProblemGoal): boolean {
  return problemGoal === "target_survival";
}
```

`capture_black` 등 Phase 2 goal이 명시·추론되더라도 **Phase 1 코드는 실행하지 않음** → `katago_filter` + `console.warn` 1회.

### 3.3 `auto` 추론 규칙 (Phase 1)

우선순위:

1. DB/문제 객체 `problem.problem_goal` (snake) 또는 `problem.problemGoal` (camel) — 유효 enum이면 사용
2. `ai_response_style` / category 힌트:

| 입력 | 추론 goal |
|------|-----------|
| `escape`, `connect`, `liberty_fight`, `default` | `target_survival` |
| category `촉촉수`, `축`, `장문`, `수상전` | `target_survival` |
| `capture` / category `단수치기` | `capture_black` (Phase 1: **비활성** → katago_filter) |
| `sacrifice` / `환격`, `먹여치기` | `sacrifice_exchange` (Phase 1: **비활성**) |
| 그 외 | `target_survival` (보수적 기본) |

### 3.4 저장 (Phase 1 — optional)

- **런타임:** `problem.problem_goal` 필드 읽기만 (없으면 `auto`)
- **Admin UI:** Phase 1에서 필수 아님. QA/수동 JSON 편집으로 검증 가능
- **DB:** 기존 `problem_goal` 컬럼이 있으면 load 시 매핑; 없어도 `auto`로 동작

### 3.5 API

```javascript
// js/solve/ai-response-solve/problem-goal.js (신규)

export const PROBLEM_GOALS = [
  "auto",
  "target_survival",
  "capture_black",
  "connect_groups",
  "sacrifice_exchange",
  "encirclement_block",
];

/** @typedef {(typeof PROBLEM_GOALS)[number]} ProblemGoal */

/** @typedef {Phase1ActiveGoal | Exclude<ProblemGoal, Phase1ActiveGoal>} ResolvedProblemGoal */

/**
 * @param {object} problem
 * @returns {ProblemGoal} raw field (default "auto")
 */
export function readProblemGoalField(problem);

/**
 * @param {object} problem
 * @returns {ResolvedProblemGoal} after auto inference
 */
export function resolveProblemGoal(problem);

/**
 * Phase 1 goal-first path 사용 가능 여부
 * @param {object} problem
 * @returns {boolean}
 */
export function isPhase1GoalFirstEligible(problem);
```

---

## 4. `selectWrongRevealMove` 인터페이스

### 4.1 역할

- **입력:** 현재 오답 보드 + target context + (선택) KataGo raw candidates
- **출력:** 기존 `selectWrongRevealKatagoFirstMove`와 **동일 shape**의 education result  
  → `finalizeKatagoSelection` / QA response contract 변경 없음

### 4.2 함수 시그니처

```javascript
/**
 * Goal-first wrong reveal move selection (Phase 1: target_survival only).
 *
 * @param {object} params
 * @param {object} params.problem
 * @param {number} params.boardSize
 * @param {object[]} params.stones              // 오답 착수 후 보드
 * @param {{ black: string, white: string }} params.stoneColors
 * @param {object} params.lastBlackMove         // 학생 오답 흑 수
 * @param {object} params.allowedRegion         // computeAllowedRegion 결과
 * @param {import("./target-white-group.js").TargetWhiteContext|null} params.targetContext
 * @param {ResolvedProblemGoal} params.problemGoal  // resolveProblemGoal(problem)
 * @param {number} [params.blackAnswerIndex=0]
 * @param {Array<{ move: string, x: number, y: number, visits?: number|null, policyPrior?: number|null, order?: number }>} [params.rawCandidates=[]]
 *   KataGo API raw candidates — pool 내 순위 보조용 only
 *
 * @returns {WrongRevealEducationResult}
 */
export function selectWrongRevealMove(params);
```

### 4.3 반환 타입 `WrongRevealEducationResult`

기존 tactical education result와 호환:

```typescript
type WrongRevealEducationResult = {
  style: AiResponseStyle;
  aiResponseStyle: AiResponseStyle;
  responseMode: "wrong_reveal_goal_first";
  targetContext: TargetWhiteContext | null;
  scoredCandidates: ScoredCandidate[];   // goal pool scored (top N)
  selected: ScoredCandidate | null;    // { point, move, selectedReason, totalScore, reasons[] }
  selectedReason: string | null;         // = selected.selectedReason
  selectionMeta: {
    policy: "goal_first";
    problemGoal: ResolvedProblemGoal;
    katagoTopMove: string | null;
    selectedMove: string | null;
    selectedSource: WrongRevealSelectedSource;
    selectedKatagoRank: number | null;   // rawCandidates 내 순위; pool 밖이면 null
    matchesKatagoTop: boolean;
    tacticalReason: string | null;
    pickMode: GoalFirstPickMode;
    goalCandidateCount: number;
    goalPoolMoves: string[];             // 디버그용, 최대 20
    authorWhiteAttempt: AuthorWhiteAttempt | null;
    katagoRankAssist: KatagoRankAssistMeta | null;
    allowedRegion: AllowedRegion | null;
  };
};
```

### 4.4 `selectedSource` (Phase 1)

| 값 | 조건 |
|----|------|
| `goal_first` | goal pool 1위 그대로 선택, KataGo 1순위와 동일 |
| `goal_first_katago_rank` | goal pool 내 KataGo policy/visits로 재정렬 후 선택 |
| `goal_first_author_white` | `fullAnswerSequence` author white가 legal → 우선 (§4.7) |
| `goal_first_tactical` | pool 내 전술 점수 1위 (KataGo 미매칭) |

**사용하지 않음 (Phase 1):** `tactical_override`, `local_tactical` — global fallback path와 분리.

`selected`가 `null`이면 caller(`katago-respond-client`)가 기존 `tryWrongRevealLocalFallback` 호출 가능. Phase 1 목표는 **null 빈도 최소화**.

### 4.5 `selectedReason` (Phase 1 vocabulary)

| reason | 의미 |
|--------|------|
| `goal_extend_atari` | target 유일/위기 활로 연장 |
| `goal_liberty_gain` | target 활로 증가 최대 |
| `goal_connect_target` | target 그룹 연결 |
| `goal_escape_line` | continuous escape / future liberty |
| `goal_on_target_liberty` | target 활로 착点 (연장 외) |
| `goal_author_white` | author white (legal) |
| `goal_katago_consensus` | pool 내 KataGo 1순위와 일치 |
| `goal_pool_best` | pool 전술 1위 (generic) |

QA `selectedReason` 라벨表에 위 키 추가 (Phase 1 브랜치).

### 4.6 `pickMode`

| pickMode | 설명 |
|----------|------|
| `goal_pool_empty` | 후보 0 → selected null |
| `goal_no_target_context` | target 없음 → selected null |
| `goal_author_white` | author white 선택 |
| `goal_single_liberty` | 유일 활로 강제 (forced_extend_atari **대체**, pool 내만) |
| `goal_scored_best` | pool 전술 점수 1위 |
| `goal_katago_rank_in_pool` | pool ∩ KataGo rank assist |

### 4.7 Author white (Phase 1 — optional tier)

```javascript
type AuthorWhiteAttempt = {
  move: string | null;
  legal: boolean;
  used: boolean;
  rejectReason: "none" | "missing_sequence" | "occupied" | "illegal_placement" | "disabled_by_flag" | null;
};
```

- `getExpectedWrongRevealAuthorWhite(problem, blackAnswerIndex, boardSize)` 사용
- **기본:** Phase 1에서 `useAuthorWhiteOnWrongReveal: false` (runtime flag). true일 때만 legal이면 `goal_first_author_white`
- QA `author_white_match` issue: flag ON + 의도 사용 시 negative 제외 (Phase 1 브랜치 QA 조정 — §7)

---

## 5. `generateGoalCandidates` (내부 companion)

`selectWrongRevealMove` 내부 또는 `goal-candidates.js`로 분리.

```javascript
/**
 * Phase 1: target_survival pool only.
 *
 * @param {object} params
 * @param {ResolvedProblemGoal} params.problemGoal  // must be "target_survival"
 * @param {TargetWhiteContext} params.targetContext
 * @param {object} params.allowedRegion
 * @param {object[]} params.stones
 * @param {number} params.boardSize
 * @param {object} params.lastBlackMove
 * @param {{ black: string, white: string }} params.stoneColors
 * @param {object} params.problem
 *
 * @returns {{
 *   candidates: GoalCandidate[],
 *   meta: { sources: string[], targetLibertyLabels: string[], mergedCount: number }
 * }}
 */
export function generateGoalCandidates(params);

/** @typedef {{ x: number, y: number, move: string, source: GoalCandidateSource }} GoalCandidate */

/** @typedef {
 *   | "target_liberty"
 *   | "target_adjacent"
 *   | "connect_point"
 *   | "escape_extension"
 *   | "near_last_black"
 * } GoalCandidateSource */
```

### 5.1 Phase 1 pool 구성 (target_survival)

**union 후 legal + inRegion 필터:**

1. **target liberties** — `getTargetLibertyPoints(targetContext, stones, boardSize)`
2. **target adjacent empty** — target 그룹 인접 빈점 (Chebyshev 1)
3. **connect points** — target과 한 수로 연결 가능한 빈점 (`buildContinuousEscapePoints` 등 기존 helper 재사용)
4. **near last black** — `buildNearLastBlackCandidates` (가중치만 낮게; pool 탈락 방지용 보조)

**제외:**

- `buildRegionEmptyCandidates` 전역 영역 빈점 sweep (의미 없는 region 후보 유입 방지)
- KataGo raw 후보 **pool에 직접 merge하지 않음** (순위 보조만)

### 5.2 선택 알고리즘 (Phase 1)

```
1. generateGoalCandidates → legal ∩ region
2. if empty → return selected null, pickMode goal_pool_empty
3. (optional) author white tier
4. scoreCandidate(..., responseMode: "wrong_reveal", targetContext) on each
5. if minLiberties <= 1 and exactly one legal target liberty move
     → pick that move (pickMode goal_single_liberty)  // pool 내부 forced extend
6. else rank:
     a. KataGo rank assist: candidates appearing in rawCandidates, bonus by (30 - rank)
     b. existing tactical totalScore
     c. tie: closer to target, then KataGo rank
7. return best with selectedReason from primary tactical signal
```

**KataGo rank assist:** `rawCandidates`에 없는 pool 수도 선택 가능 (Phase 1 핵심 — KataGo null 연쇄 차단).

---

## 6. `katago-respond-client` 통합

### 6.1 Wrong reveal 흐름 (goal_first)

```
requestKatagoRespondWrong
  ├─ immediateFallback (기존, replace window용 — 유지)
  └─ katagoTask
       └─ processKatagoRespondResponse
            └─ finalizeKatagoSelection
                 └─ buildTacticalSelection
                      ├─ [NEW] wrongRevealPolicy === "goal_first"
                      │         && isPhase1GoalFirstEligible(problem)
                      │    → selectWrongRevealMove({ rawCandidates, ... })
                      └─ else → selectWrongRevealKatagoFirstMove (기존)
```

### 6.2 Response contract (QA 호환 — 변경 없음)

`resolveWhiteResponse` 성공 시 필드 유지:

```typescript
{
  ok: true,
  point: { x, y, color: "white" },
  move: string,
  source: "katago" | "tactical_fallback",  // goal_first도 KataGo path 탔으면 "katago"
  selectedSource: string,
  selectedReason: string,
  aiResponseStyle: AiResponseStyle,
  usedLocalFallback: boolean,
  selectionMeta?: object,
  regionCandidates?: array,
  rawCandidates?: array,
  // ...
}
```

| goal_first 케이스 | `source` | `usedLocalFallback` |
|-------------------|----------|---------------------|
| KataGo API 성공 + goal_first pick | `katago` | `false` |
| KataGo 실패/timeout + goal_first only (Phase 1 비목표) | — | — |
| goal_first selected null → legacy fallback | `tactical_fallback` | `true` |

Phase 1 성공 기준: **`usedLocalFallback: false` 비율 상승**, `forced_extend_atari` 빈도 하락.

---

## 7. QA (`ai-response-qa`) 영향 — Phase 1

### 7.1 변경 없음

- `resolveWhiteResponse(parityContext.resolveWhiteResponseParams)` 호출
- `classifyQaResponse` issue keys
- target liberty before/after 진단

### 7.2 브랜치에서만 조정 (선택)

| 항목 | 조정 |
|------|------|
| `ai-response-qa-labels.js` | `goal_*` selectedReason 한글 라벨 |
| `ai-response-qa-quality.js` | `goal_extend_atari` → `extend_atari` positive 매핑 |
| `inferWrongRevealGoal` | `resolveProblemGoal(problem)` 우선 |
| `author_white_match` | `useAuthorWhiteOnWrongReveal` ON 시 negative 제외 |

### 7.3 검증 방법

1. 동일 문제·동일 오답 후보에 대해 `wrongRevealPolicy` ON/OFF 각각 QA 실행
2. 비교 지표:
   - `used_fallback` 비율
   - `far_from_target` 비율
   - `verdict: good` 비율
   - `selectedReason === "forced_extend_atari"` → `goal_*` 로 대체 여부

---

## 8. 신규/수정 파일 (Phase 1)

| 파일 | 작업 |
|------|------|
| `js/solve/ai-response-solve/problem-goal.js` | **신규** — enum, resolve, isPhase1GoalFirstEligible |
| `js/solve/ai-response-solve/goal-candidates.js` | **신규** — generateGoalCandidates (target_survival) |
| `js/solve/ai-response-solve/select-wrong-reveal-move.js` | **신규** — selectWrongRevealMove |
| `js/solve/ai-response-solve/katago-respond-client.js` | flag 분기 + import |
| `js/solve/ai-response-solve/tactical-response-engine.js` | **변경 최소** — scoreCandidate 재사용만 |
| `scripts/generate-runtime-config.js` | `wrongRevealPolicy` |
| `scripts/check-build.js` | needle 추가 |
| `docs/wrong-reveal-goal-first-mvp-spec.md` | 본 문서 |

**건드리지 않음 (Phase 1):** `engine.js`, `resolve-white-response.js` (signature 유지), `selectWrongRevealKatagoFirstMove`, local fallback 구현.

---

## 9. Out of Scope (Phase 1)

- `capture_black`, `sacrifice_exchange`, `encirclement_block` generator
- KataGo `allowMoves` / ownership API
- Admin `problem_goal` 편집 UI (필드 read-only 허용)
- `selectWrongRevealKatagoFirstMove` / targetImpact gate 제거
- DB migration (기존 컬럼 있으면 load mapping만)

---

## 10. 수용 기준 (Phase 1 Done)

- [ ] `wrongRevealPolicy=katago_filter` (default): 기존 QA 결과와 동일 (회귀 없음)
- [ ] `wrongRevealPolicy=goal_first` + escape/survival 문제 N≥10:
  - [ ] `usedLocalFallback` < 50% (baseline 대비 개선)
  - [ ] `forced_extend_atari` 최종 선택 < 20%
  - [ ] target liberty gain ≥ 0 비율 > baseline
- [ ] Phase 2 goal (capture/sacrifice) 문제: goal_first flag ON이어도 **katago_filter fallback**, 크래시 없음
- [ ] `npm run build` / check-build 통과

---

## 11. 브랜치 작업 순서

```bash
git checkout main
git pull
git checkout -b feature/wrong-reveal-goal-first
```

1. `problem-goal.js` + runtime flag (default `katago_filter`)
2. `goal-candidates.js` (target_survival pool)
3. `select-wrong-reveal-move.js`
4. `katago-respond-client.js` 분기 (1곳)
5. QA baseline 스냅샷 (flag OFF vs ON)
6. Preview deploy `WRONG_REVEAL_POLICY=goal_first`

---

## 12. 참고

- 안정 baseline: `docs/ai-response-stable-baseline.md`
- 기존 선택기: `selectWrongRevealKatagoFirstMove` (`tactical-response-engine.js`)
- QA goal 추론 참고: `js/admin/ai-response-qa-quality-profiles.js`
