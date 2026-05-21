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

drop policy if exists "Allow public read problems" on public.problems;
create policy "Allow public read problems"
on public.problems
for select
to anon
using (true);

drop policy if exists "Allow public insert problems" on public.problems;
create policy "Allow public insert problems"
on public.problems
for insert
to anon
with check (true);

drop policy if exists "Allow public update problems" on public.problems;
create policy "Allow public update problems"
on public.problems
for update
to anon
using (true)
with check (true);

drop policy if exists "Allow public delete problems" on public.problems;
create policy "Allow public delete problems"
on public.problems
for delete
to anon
using (true);

create or replace function public.delete_problem(problem_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.problems
  where id = problem_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.delete_problem(text) from public;
grant execute on function public.delete_problem(text) to anon;
```

실시간 반영을 쓰려면 Supabase Dashboard의 `Database` → `Replication`에서 `problems` 테이블의 Realtime을 켜 주세요.

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

1. [Vercel](https://vercel.com/)에 GitHub 계정으로 로그인합니다.
2. `Add New...` → `Project`를 누릅니다.
3. GitHub의 `BadukPlatform` repository를 선택합니다.
4. Project Name을 `BadukPlatform`으로 입력합니다.
5. Framework Preset은 `Other` 또는 자동 감지 상태로 둡니다.
6. Build Command는 `npm run build`, Output Directory는 `.`로 설정됩니다. `vercel.json`에 이미 포함되어 있습니다.
7. KataGo 어댑터를 배포했다면 Environment Variables에 `NEXT_PUBLIC_KATAGO_API_URL`을 추가합니다. 로그인 테스트만 할 때는 별도 환경변수가 필요 없습니다.
8. `Deploy`를 누릅니다.

배포가 끝나면 Vercel 무료 공유 주소가 생성됩니다. 프로젝트명이 사용 가능하면 `https://badukplatform.vercel.app` 형태로 접근할 수 있습니다. Vercel URL은 보통 소문자로 표시되며, 같은 이름이 이미 사용 중이면 뒤에 식별자가 붙을 수 있습니다.

## 확장 포인트

- KataGo 연동 시 `js/ai-response.js`의 `getTemporaryAiResponse()`를 비동기 API 호출로 교체합니다.
- SGF 기반 문제 로딩은 `js/sgf.js`에 파서를 추가하고 `js/problems.js`의 데이터 형식으로 변환하면 됩니다.
- 관리자 변경사항 영구 저장은 `localStorage` 또는 JSON export 기능으로 확장할 수 있습니다.
