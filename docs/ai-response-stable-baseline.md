# AI 응수형 안정 기준점 (v0.9.0)

**기준일:** 2026-06-01  
**Git 태그:** `v0.9.0-ai-response-stable`  
**Git 브랜치:** `stable-ai-response-20260601`  
**커밋:** `72f7bf9` — `Revert "환격,먹여치기 로직변경"`

이 문서는 AI 응수형 문제풀이가 **검증된 상태**로 동작하던 시점을 기록합니다.  
향후 `problem_goal`, snapback/capture 강제 분기, AI 응수 자동 QA 등 실험 작업 전 **되돌릴 수 있는 기준점**입니다.

## 검증된 동작 (2026-06-01 기준)

| 영역 | 상태 |
|------|------|
| AI 응수형 오답/정답 백 응수 | 정상 |
| 이어하기 | 정상 |
| 복습하기 | 정상 |
| 관리자 정답 수순 입력 | 정상 |
| 포획 처리 | 정상 |

## 아키텍처 (이 기준점)

- **`problem_goal`:** 사용하지 않음 (revert 완료, DB 컬럼이 있어도 런타임 미사용)
- **오답 응수:** `ai_response_style` + `target_white_group` 기반
- **snapback / capture-priority 강제 분기:** 없음 (revert 완료)
- **category 힌트:** 미지정 시 보조 추론 (`촉촉수→escape`, `환격→sacrifice` 등)
- **타깃 그룹:** △ 표시 → 연결 그룹 전체 → `target_white_group` (`target-white-group.js`)

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `js/solve/ai-response-solve/engine.js` | 학생 흑 / KataGo 백 세션 |
| `js/solve/ai-response-solve/katago-respond-client.js` | KataGo API + 로컬 전술 fallback |
| `js/solve/ai-response-solve/tactical-response-engine.js` | 오답 reveal: `resolveTargetWhiteGroup` + survival scoring |
| `js/solve/ai-response-solve/tactical-response-styles.js` | `ai_response_style` / category 힌트 |
| `js/solve/ai-response-solve/target-white-group.js` | △ → 타깃 백 그룹 해석 |

## 향후 작업 브랜치

새 실험·QA는 **main에서 분기**해 별도 브랜치에서 진행합니다.

```bash
git checkout main
git pull
git checkout -b feature/ai-response-qa
```

예정 실험 (별도 브랜치):

- AI 응수 자동 QA
- `problem_goal` 재도입 (설계 검토 후)
- snapback/capture 전술 분기 (회귀 테스트 후)

**main에 직접 대규모 변경하지 않습니다.**

## 문제 발생 시 되돌리기

### 1) 기준 커밋 확인

```bash
git show v0.9.0-ai-response-stable --oneline -s
# 72f7bf9 Revert "환격,먹여치기 로직변경"
```

### 2) AI 응수 모듈만 복구 (권장)

```bash
git checkout v0.9.0-ai-response-stable -- js/solve/ai-response-solve/
git checkout v0.9.0-ai-response-stable -- js/admin/editor.js
# 필요 시 problems.js, main.js 등 diff 확인 후 선택 복구
git status
git diff --staged
```

### 3) 기준 브랜치에서 hotfix 브랜치 생성

```bash
git checkout -b hotfix/ai-response-from-stable stable-ai-response-20260601
# 수정 후 main으로 PR
```

### 4) 특정 커밋 이후 변경 전부 되돌리기 (revert 체인)

main에 merge된 실험 커밋을 **revert 커밋**으로 되돌립니다 (force push 불필요).

```bash
git log --oneline v0.9.0-ai-response-stable..HEAD
git revert <commit-hash>   # 최신부터 역순으로
```

> `git reset --hard` / force push는 팀 합의 없이 사용하지 않습니다.

## 태그·브랜치 생성 명령 (기록)

```bash
git tag -a v0.9.0-ai-response-stable 72f7bf9 -m "AI response stable baseline before QA experiments"
git branch stable-ai-response-20260601 72f7bf9
git push origin v0.9.0-ai-response-stable
git push origin stable-ai-response-20260601
```

## 관련 revert 이력 (main)

| 커밋 | 설명 |
|------|------|
| `72f7bf9` | Revert snapback/capture 대규모 변경 (`bcf7bb5`) |
| `efa1558` | Revert `problem_goal` 구조 (`943f111`) |

## 참고 문서

- [AI 응수형 설계 (초기)](./ai-response-solve-design.md)
- [KataGo 배포](./katago-respond-deploy.md)
