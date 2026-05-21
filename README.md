# BadukPlatform

WGo.js 기반의 13줄 바둑 문제풀이 정적 페이지입니다.

## 실행

로컬에서 정적 서버로 실행합니다.

```bash
npm start
```

배포 전 정적 파일과 JavaScript 문법을 점검합니다.

```bash
npm run build
```

## 구조

- `index.html`: 페이지 마크업 및 로컬 WGo.js 로드
- `styles.css`: 모바일 반응형 UI 스타일
- `vendor/wgo.min.js`: WGo.js 로컬 사본
- `js/main.js`: 문제 진행, 정답 판정, 화면 상태 관리
- `js/board.js`: WGo.js 바둑판 래퍼
- `js/problems.js`: `id`, `title`, `description`, `level`, `category`, `stones`, `correctMove`를 가진 문제 데이터 배열
  - `stones` 항목은 선택적으로 `mark: "triangle" | "circle" | "square" | "cross"`를 가질 수 있습니다.
- `js/ai-response.js`: 임시 AI 응수 함수
- `js/sgf.js`: SGF 확장용 유틸
- `package.json`: Vercel 빌드 점검 스크립트
- `vercel.json`: Vercel 정적 배포 설정

## 문제 목록

`문제 목록` 모드에서 `전체`, `활로`, `따내기`, `축`, `사활` 카테고리별로 문제를 필터링하고 카드에서 바로 문제풀이를 시작할 수 있습니다.

## 아이디 기반 로그인 설정

현재 인증은 외부 데이터베이스 없이 브라우저 `localStorage`만 사용합니다. 회원가입 정보는 `BADUK_AUTH_USERS`에 누적 저장되고, 로그인 세션은 `BADUK_AUTH_USER`에 저장되어 새로고침 후에도 유지됩니다.

저장되는 회원 정보는 `id`, `username`, `passwordHash`, `name`, `phone`, `email`, `userType`, `academyName`, `postcode`, `address`, `addressDetail`, `createdAt`입니다. 비밀번호 원문은 저장하지 않고 브라우저 Web Crypto 기반 SHA-256 해시로 저장합니다.

브라우저 콘솔에서 저장된 회원 목록을 확인하려면 아래처럼 볼 수 있습니다.

```js
JSON.parse(localStorage.getItem("BADUK_AUTH_USERS") || "[]");
```

테스트 데이터를 지우고 싶다면 아래 값을 삭제하면 됩니다.

```js
localStorage.removeItem("BADUK_AUTH_USER");
localStorage.removeItem("BADUK_AUTH_USERS");
```

주의: `localStorage` 인증은 Vercel 정적 배포에서 즉시 테스트하기 위한 임시 저장 방식입니다. 실제 운영에서 여러 기기 간 기록 공유, 비밀번호 재설정, 관리자 권한 보호가 필요하면 서버 데이터베이스 인증으로 교체해야 합니다.

## 관리자 모드

상단의 `관리자 모드` 버튼을 켜면 문제 목록에서 문제를 추가, 수정, 삭제할 수 있습니다. 문제 데이터는 Supabase `problems` 테이블에 저장되고, 다른 브라우저에서 변경해도 실시간 구독으로 목록이 갱신됩니다.

## Supabase 문제 데이터 설정

문제 데이터는 Supabase의 `public.problems` 테이블에서 읽고 씁니다. Supabase SQL Editor에서 아래 SQL을 실행해 주세요.

```sql
create table if not exists public.problems (
  id text primary key,
  title text not null,
  description text not null default '',
  level text not null default '',
  category text not null,
  stones jsonb not null default '[]'::jsonb,
  correct_move jsonb,
  correct_sequence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_problem_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_problem_updated_at on public.problems;
create trigger set_problem_updated_at
before update on public.problems
for each row
execute function public.set_problem_updated_at();

alter table public.problems enable row level security;
```

문제 테이블 RLS(읽기 공개 / 쓰기는 admin·academy_owner·teacher만)는 **`scripts/supabase-problems-rls.sql`** 을 SQL Editor에서 실행하세요. `user_metadata.role`(또는 `userType`)이 JWT에 포함되어야 합니다.

실시간 반영을 쓰려면 Supabase Dashboard의 `Database` → `Replication`에서 `problems` 테이블의 Realtime을 켜 주세요.

## Supabase Auth (회원가입·로그인 — 우선 적용)

1. **SQL Editor**에서 아래 파일 **전체를 한 번만** 실행합니다.  
   **`scripts/supabase-is-auth-email-available.sql`**  
   - `public.is_auth_username_available`  
   - `public.is_auth_email_available`  
   - 여러 번 실행해도 안전합니다 (`drop if exists` + `create or replace`).

2. **Authentication → Providers → Email**
   - **Minimum password length = 6**
   - **Confirm email = OFF** (필수 — ON이면 `signUp`마다 확인 메일 발송 → 429 `email rate limit exceeded`)
   - 자세한 Dashboard 경로: `scripts/supabase-auth-dashboard-setup.md`

3. 로그인/가입 시 Supabase에는 `user_{해시}@baduk.app` 영문 가상 이메일만 저장되고, 화면 아이디(`user_metadata.username`)는 한글 그대로 유지됩니다.

4. signUp 디버그: `js/runtime-config.js`에 `debugAuth: true` 추가 시 콘솔에 signUp payload 로그(비밀번호 제외).

5. 중복확인 RPC 404 시: Database → Functions 에 두 함수 존재 여부 확인 → API 스키마 reload 후 재시도.

### 기본 관리자 계정 (admin)

Dashboard **Project Settings → API → service_role** 키를 복사한 뒤:

```powershell
# Dashboard → Project Settings → API → service_role (publishable 키 아님!)
$env:SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
npm run create-admin:dry-run
npm run create-admin
```

성공 시 콘솔에 `[SUCCESS] admin user created` 와 auth email / user id 가 출력됩니다.  
`[ERROR] SUPABASE_SERVICE_ROLE_KEY가 없습니다` 가 나오면 환경변수가 설정되지 않은 것입니다.

- 화면 로그인: 아이디 `admin` / 비밀번호 `000000`
- 내부 email: `user_{해시}@baduk.app` (`create-admin:dry-run` 출력값과 동일)
- metadata: `role`, `userType`, `username` 모두 `admin`

수동 metadata 보정만 필요하면 `scripts/create-admin-user.sql` 참고.

문제 테이블 RLS는 **`scripts/supabase-problems-rls.sql`** — 로그인/가입 안정화 **이후** 적용을 권장합니다.

Vercel 배포에서는 기본으로 아래 Supabase 프로젝트가 `js/runtime-config.js`에 설정되어 있습니다. 다른 프로젝트를 쓰려면 환경변수로 덮어쓸 수 있습니다.

```txt
NEXT_PUBLIC_SUPABASE_URL=https://biprcqrqnizwpxolkfyi.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=your-publishable-or-anon-key
```

## 외부 AI 반격 연동

오답 착수 시 `window.BADUK_AI_API_URL` 또는 `localStorage.BADUK_AI_API_URL`에 설정된 API로 현재 바둑판 상태를 POST 전송합니다. API가 없거나 실패하면 기존 임시 AI 응수로 자동 fallback됩니다.

```js
localStorage.setItem("BADUK_AI_API_URL", "https://your-katago-api.example.com/analyze");
```

응답은 `{ "move": { "x": 4, "y": 9 } }`, `{ "bestMove": { "x": 4, "y": 9 } }`, `"4,9"`, `"ej"` 형식을 지원합니다.

Vercel 배포에서는 `NEXT_PUBLIC_KATAGO_API_URL` 환경변수를 설정하면 빌드 시 `js/runtime-config.js`에 API 주소가 반영됩니다.

```txt
NEXT_PUBLIC_KATAGO_API_URL=https://your-katago-adapter.onrender.com/counter-move
```

`backend/katago-api`에는 Render/AWS에 올릴 수 있는 Node.js API 어댑터 템플릿이 들어 있습니다. 이 어댑터는 프론트엔드 요청을 받아 실제 KataGo 서버로 전달하고 `{ move: { x, y } }` 형태로 응답을 정규화합니다.

## GitHub 업로드

1. GitHub에서 새 repository를 만듭니다. 이름은 `BadukPlatform`을 권장합니다.
2. 이 폴더에서 Git을 초기화합니다.

```bash
git init
git add .
git commit -m "Initial BadukPlatform deploy setup"
```

3. GitHub repository 주소를 연결하고 업로드합니다.

```bash
git remote add origin https://github.com/<YOUR_ID>/BadukPlatform.git
git branch -M main
git push -u origin main
```

## Vercel 무료 배포

**상세 절차(최신 Auth·admin 로그인 포함):** [`docs/vercel-deploy-auth.md`](docs/vercel-deploy-auth.md)

요약:

1. 로컬에서 `npm run build` 통과 확인
2. `js/auth.js`, `js/services/auth-service.js` 등 **Git push** (`main` 브랜치)
3. Vercel Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`
4. **Redeploy + Clear build cache**
5. 배포 URL에서 signup email이 `user_*@baduk.app` 인지 Network 탭으로 확인
6. Supabase에 `npm run create-admin` 으로 admin 계정 생성 후 로그인 테스트

기본 설정은 `vercel.json`에 있습니다 (`buildCommand`: `npm run build`, `outputDirectory`: `.`).

배포 URL 예: `https://badukplatform.vercel.app` (프로젝트명에 따라 다름)

## 확장 포인트

- KataGo 연동 시 `js/ai-response.js`의 `getTemporaryAiResponse()`를 비동기 API 호출로 교체합니다.
- SGF 기반 문제 로딩은 `js/sgf.js`에 파서를 추가하고 `js/problems.js`의 데이터 형식으로 변환하면 됩니다.
- 관리자 변경사항 영구 저장은 `localStorage` 또는 JSON export 기능으로 확장할 수 있습니다.
