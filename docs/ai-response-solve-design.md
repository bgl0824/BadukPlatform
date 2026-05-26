# AI 응수형 문제풀이 설계

## 목표

- **학생**: 항상 흑만 착수
- **시스템 / KataGo**: 항상 백 응수만 자동 착수 (스팟 UI 없음)
- **admin**: 문제별 총 수(`answer_move_count`)와 흑 정답 수열(`black_answer_sequence`) 설정
- **일반 문제**: 기존 `handleUserMove` / `completeProblem` / progress / review / 시험 세트 **변경 없음**

## 수순 모델

| `answer_move_count` | 수순 (ply) | 흑 정답 개수 | 백 응수 (KataGo) |
|---------------------|------------|--------------|------------------|
| 1 | 흑 | 1 | 오답 시에만 1수 |
| 3 | 흑·백·흑 | 2 | 정답 중 1수, 오답 시 1수 |
| 5 | 흑·백·흑·백·흑 | 3 | 정답 중 2수, 오답 시 1수 |
| 7 | … | 4 | 정답 중 3수, 오답 시 1수 |

- `blackCount = (answer_move_count + 1) / 2`
- 홀수 ply = 흑(학생), 짝수 ply = 백(KataGo)
- **마지막 흑 정답**을 맞추면 즉시 `completeProblem` — 이후 백 응수 없음
- **어느 흑이든 오답** → KataGo 백 1수 자동 착수 → 「오답입니다」→ 다시 풀기 / 처음부터

## DB (`problems`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `problem_mode` | text | `normal`(기본) \| `ai_response` |
| `answer_move_count` | int | 1, 3, 5, 7 |
| `black_answer_sequence` | jsonb | `["D4","F4"]` — **흑만**, GTP 또는 `{x,y}` |

### 기존 필드와의 관계

| 기존 | AI 응수형에서 |
|------|----------------|
| `correct_move` | `black_answer_sequence[0]`과 **동기화** (목록·호환용) |
| `correct_sequence` (활로) | `problem_mode=ai_response`이면 **사용 안 함** |
| `ai_response_candidates` (스팟 UX) | **사용 안 함** (프로토타입 전용) |

로드 시 `black_answer_sequence`가 비어 있고 `answer_move_count=1`이면 `correct_move`에서 1수 복원.

## 런타임 세션 (`appState.aiResponseSolveSession`)

```ts
{
  answerMoveCount: 3,
  currentPly: 1,              // 1-based, 다음에 둘 ply
  blackAnswerIndex: 0,        // 기대 중인 흑 정답 인덱스
  phase: "await_black" | "katago_pending" | "wrong_reveal",
  playedMoves: Move[],        // 문제 풀이 중 실제 착수(흑·백)
}
```

## 분기 (main.js)

```
handleBoardClick
  └─ if shouldUseAiResponseSolve(problem)
       └─ aiResponseSolveEngine.handleStudentBlackMove(point)  // 전용 엔진
     else
       └─ handleUserMove()  // 기존
```

`shouldUseAiResponseSolve` = `problem_mode === ai_response` && `aiResponseSolveEnabled` && (API ON 또는 1수만 로컬 처리).

## KataGo API

`POST /api/katago/respond`

**Request**

```json
{
  "problemId": "...",
  "boardSize": 13,
  "stones": [{ "x": 3, "y": 3, "color": "black" }],
  "moves": [{ "color": "B", "move": "D4" }],
  "lastMove": { "color": "B", "move": "D4" },
  "nextPlayer": "W",
  "studentMoveResult": "correct",
  "currentPly": 1
}
```

**Response**

```json
{ "move": "E4", "source": "katago" }
```

프론트: `response.move` → 백돌 자동 `addStone` (캡처 규칙 동일).

클라이언트: `js/solve/ai-response-solve/katago-respond-client.js`

## 기능 플래그

| 플래그 | 기본 | 역할 |
|--------|------|------|
| `BadukConfig.aiResponseSolveEnabled` | `true` | `ai_response` 문제 분기 자체 |
| `BadukConfig.katagoRespondApiEnabled` | `false` | API 호출 허용 |
| `BadukConfig.katagoRespondApiUrl` | `/api/katago/respond` | 엔드포인트 |

API OFF 또는 KataGo 미연결: **mock 사용 안 함** → 「AI 응수 서버 연결 필요」 후 진행 중단.

## Vercel 배포 (실 API)

1. Environment Variables:
   - `KATAGO_SERVER_URL` — 실제 KataGo 분석 서버
   - `KATAGO_ANALYZE_PATH` — 기본 `/api/v1/analyze`
   - `KATAGO_RESPOND_API_ENABLED=true` — 빌드 시 `runtime-config` 반영
2. Serverless: `api/katago/respond.js` → `POST /api/katago/respond`
3. 응답 형식: `{ "move": "E4", "source": "katago" }` 만 백 자동 착수
4. Render 어댑터: `backend/katago-api` 동일 경로 `/api/katago/respond` 지원

## admin 편집

- 문제 모드: 일반 / AI 응수형
- 정답 수: 1 / 3 / 5 / 7
- 도구 「흑 정답 추가」: `black_answer_sequence`에만 추가 (백 저장 안 함)
- 저장 시 `correct_move` = 첫 흑 정답

## 1차 적용

- `problem_mode = ai_response` + 축 테스트 2문제
- `scripts/supabase-problems-ai-response-solve.sql` 실행

## 영향 없음 (검증 체크리스트)

- [ ] 일반 1수 / 활로 `correct_sequence`
- [ ] `studentProgressService` (오답은 기존 `recordWrongMove` 호출)
- [ ] review / exam session `loadProblem` 경로
- [ ] category completion

## 구현 파일

| 경로 | 역할 |
|------|------|
| `js/solve/ai-response-solve/constants.js` | ply / 흑 개수 계산 |
| `js/solve/ai-response-solve/black-sequence.js` | GTP ↔ 좌표, problem 로드 |
| `js/solve/ai-response-solve/session.js` | 세션 생성·갱신 |
| `js/solve/ai-response-solve/katago-respond-client.js` | API |
| `js/solve/ai-response-solve/engine.js` | 착수·정오답·백 자동 |
| `js/game/problem-mode.js` | `isAiResponseProblem`, `shouldUseAiResponseSolve` |

## 레거시

- `ai_response_test` + 블루/그린 스팟: `ai-response-ux/` (기본 OFF, 프로토타입)
- 신규 실서비스 흐름: **`ai_response` + 본 설계**
