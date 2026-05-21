# Vercel 배포 절차 (최신 Auth 포함)

localhost는 최신인데 Vercel만 구버전일 때, **거의 항상 Git 미반영·캐시·잘못된 브랜치** 문제입니다.  
아래 순서대로 진행하면 `auth-service.js`, `usernameToAuthEmail()` (`@baduk.app`), admin 로그인이 배포본에 반영됩니다.

---

## 1. 배포에 포함되어야 하는 파일 (Auth)

| 경로 | 역할 |
|------|------|
| `js/auth.js` | 로그인·회원가입·세션 |
| `js/services/auth-service.js` | `usernameToAuthEmail`, `signUp`, 중복확인 RPC |
| `js/services/supabase-client.js` | Supabase 클라이언트 |
| `js/permissions/permission-service.js` | role (admin 등) |
| `auth.html` / `signup.html` | 로그인·가입 UI |
| `js/runtime-config.js` | **빌드 시** `generate-runtime-config.js`가 재생성 |

> `js/runtime-config.js`는 Vercel 빌드마다 환경변수로 덮어씁니다. 로컬 파일만 올려도 빌드 시 다시 생성됩니다.

---

## 2. 로컬에서 배포 전 확인

```powershell
cd c:\Users\cwl08\baduk-education-platform

# 최신 auth 코드 문법 검사 + 필수 파일 존재 확인
npm run build

# (선택) 관리자 가상 이메일 확인
npm run create-admin:dry-run
# → user_aa73da63e26b@baduk.app 출력되어야 함 (@baduk.local 아님)
```

`npm run build` 가 실패하면 Vercel도 같은 이유로 실패합니다.

---

## 3. GitHub에 최신 코드 반영 (가장 중요)

Vercel은 **GitHub에 push된 커밋**만 배포합니다. 로컬에만 있으면 Vercel은 구버전입니다.

```powershell
git status
git add js/auth.js js/services/auth-service.js js/services/supabase-client.js
git add auth.html signup.html js/permissions/permission-service.js
git add vercel.json package.json docs/ scripts/
git commit -m "fix: Supabase auth with baduk.app virtual email and admin bootstrap"
git push origin main
```

- Vercel 프로젝트가 연결된 **브랜치**가 `main`인지 Dashboard → Settings → Git에서 확인
- 다른 브랜치에만 push 했다면 Production Branch를 맞추거나 해당 브랜치로 merge

---

## 4. Vercel 환경 변수 (Production)

Dashboard → Project → **Settings → Environment Variables**

| 변수 | 설명 | 예시 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_KEY` | **anon / publishable** 키 (service_role 아님) | `eyJ...` 또는 `sb_publishable_...` |

- 로컬 `js/runtime-config.js`의 URL/KEY와 **동일 Supabase 프로젝트**를 쓰는지 확인
- 변경 후 **Redeploy 필수**

(선택) KataGo: `NEXT_PUBLIC_KATAGO_API_URL`

---

## 5. Vercel 재배포 (캐시 제거)

1. Dashboard → **Deployments**
2. 최신 배포 ⋮ → **Redeploy**
3. **Clear build cache** (또는 "Redeploy with existing Build Cache" 해제) 체크
4. Deploy

또는 빈 커밋으로 재배포:

```powershell
git commit --allow-empty -m "chore: trigger Vercel redeploy"
git push origin main
```

---

## 6. 빌드 로그에서 확인

Deployments → 해당 배포 → **Building** 로그:

```
npm run build
Runtime config generated...
BadukPlatform static build check passed.
```

- `check-build.js` 실패 시 배포는 올라가도 auth 모듈 누락 가능
- Build Command: `npm run build` (vercel.json과 동일)

---

## 7. 배포본에서 Auth 최신 여부 확인 (브라우저)

배포 URL에서 **F12 → Network** (시크릿 창 권장):

1. **강력 새로고침** `Ctrl+Shift+R`
2. `signup.html` 또는 회원가입 모달 열기
3. 다음 파일이 **200** 으로 로드되는지 확인:
   - `/js/auth.js`
   - `/js/services/auth-service.js` (모듈 import로 로드)
4. 회원가입 시도 시 Network:
   - `signup` 요청 1회
   - Request payload email이 `user_xxxxxxxxxxxx@baduk.app` 형태 (**@baduk.local 아님**)

### 빠른 검증 (콘솔)

`auth.html` 로그인 전, Sources에서 `auth-service.js` 검색:

- `USERNAME_AUTH_EMAIL_DOMAIN = "baduk.app"` 있어야 최신
- `baduk.local` 이면 **구버전 캐시 또는 미배포**

---

## 8. Supabase (배포 URL과 동일 프로젝트)

Auth 로직과 무관하게 **DB/Auth는 Supabase 클라우드 1곳**입니다.

1. SQL (1회): `scripts/supabase-is-auth-email-available.sql`
2. Dashboard Auth:
   - Confirm email **OFF**
   - Minimum password **6**
3. 관리자 계정 (로컬 터미널):

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="service_role_키"
npm run create-admin
```

→ Authentication → Users 에 `user_aa73da63e26b@baduk.app` / metadata `admin` 확인

4. 배포 사이트에서 로그인: **아이디 `admin`** / 비밀번호 `000000`

---

## 9. 문제별 체크리스트

| 증상 | 원인 | 조치 |
|------|------|------|
| Vercel만 구버전 JS | push 안 함 / 캐시 | §3·§5 |
| signup email이 `@baduk.local` | 구버전 auth-service | push + 캐시 삭제 redeploy |
| admin 로그인 실패 | admin 미생성 / 다른 Supabase | §8 |
| 중복확인 404 | RPC 미실행 | SQL Editor 실행 |
| 429 email rate limit | Confirm email ON | Dashboard OFF |
| 로그인만 안 됨 | Vercel env KEY 오류 | §4 재설정 후 redeploy |

---

## 10. 권장 배포 흐름 (요약)

```
로컬 npm run build 통과
    ↓
git push origin main
    ↓
Vercel Redeploy (Clear build cache)
    ↓
시크릿 창에서 @baduk.app signup 확인
    ↓
admin 로그인 확인
    ↓
(이후) scripts/supabase-problems-rls.sql 적용
```

RLS는 Auth 안정화 **이후** 적용을 권장합니다.
