# Supabase Auth — username 기반 (실제 이메일 인증 없음)

가상 이메일(`user_xxx@baduk.app`) + 아이디/비밀번호만 사용하는 구조입니다.  
**클라이언트 코드만으로 확인 메일 발송을 끌 수 없습니다.** Dashboard 설정이 필수입니다.

## 429 `email rate limit exceeded` 원인

1. **Confirm email(이메일 확인)이 켜져 있음** → `auth.signUp()` 마다 확인 메일 발송 → 짧은 시간에 여러 번 가입 시도 시 429
2. 가입 실패 후 **같은 아이디로 반복 클릭** → signUp API 반복 호출
3. (선택) Custom SMTP 한도 초과

## Dashboard 필수 설정

**Authentication** 메뉴에서:

| 항목 | 권장 값 | 설명 |
|------|---------|------|
| Email provider | **Enabled** | password 로그인에 필요 |
| Confirm email | **OFF** | OFF일 때만 signUp이 메일 없이 세션 반환 |
| Secure email change | OFF (권장) | 불필요한 메일 발송 감소 |
| Minimum password length | **6** | 프론트와 동일 |

UI에 "Confirm email"이 안 보이면:

- **Authentication → Sign In / Providers → Email** (또는 **Auth → Providers**)
- 프로젝트가 **Hosted Auth** / 새 UI면 **Authentication → Configuration → Sign up** 탭

Confirm email을 끄면:

- `signUp` 후 **session이 바로 생성**됨 (`requiresEmailConfirmation` 없음)
- 확인 메일 **발송 안 함** → 429 대부분 해소

## Rate Limits (선택)

**Authentication → Rate Limits** 에서 signup/email 관련 한도를 일시적으로 올릴 수 있습니다.  
근본 해결은 **Confirm email OFF** + **가입 버튼 중복 클릭 방지**입니다.

## 앱에서의 signUp 동작 (현재 코드)

- `auth.signUp({ email, password, options: { data: metadata } })` 만 사용
- `emailRedirectTo`, OTP, `signInWithOtp` **미사용**
- 중복확인은 RPC만 호출 (signUp 아님)
- `BadukConfig.debugAuth = true` 시 콘솔에 signUp payload 로그 (비밀번호 제외)

## 운영 점검

1. Confirm email OFF 후 테스트 계정 1개 가입
2. Network 탭: `signup` 요청이 **클릭 1회당 1번**인지 확인
3. 성공 시 Response에 `session` 포함 여부 확인
