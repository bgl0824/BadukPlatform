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

## 문제 제작

화면 왼쪽의 `문제 제작` 모드에서 흑/백 돌을 배치하고 정답 위치를 지정한 뒤 `JSON 출력`을 누르면 `js/problems.js`의 `problems` 배열에 바로 붙여넣을 수 있는 문제 객체가 생성됩니다.
힌트 표시 도구로 기존 바둑알 위에 세모, 동그라미, 네모, X 표시를 추가할 수 있으며 출력 JSON의 해당 stone에 `mark`가 포함됩니다.

## 문제 목록

`문제 목록` 모드에서 `전체`, `활로`, `따내기`, `축`, `사활` 카테고리별로 문제를 필터링하고 카드에서 바로 문제풀이를 시작할 수 있습니다.

## 관리자 모드

상단의 `관리자 모드` 버튼을 켜면 문제 목록에서 문제를 추가, 수정, 삭제할 수 있습니다. 변경사항은 현재 브라우저 메모리의 `problems` 배열에 즉시 반영되며 저장/export 기능을 붙일 수 있도록 UI와 상태를 분리해 두었습니다.

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
7. `Deploy`를 누릅니다.

배포가 끝나면 Vercel 무료 공유 주소가 생성됩니다. 프로젝트명이 사용 가능하면 `https://badukplatform.vercel.app` 형태로 접근할 수 있습니다. Vercel URL은 보통 소문자로 표시되며, 같은 이름이 이미 사용 중이면 뒤에 식별자가 붙을 수 있습니다.

## 확장 포인트

- KataGo 연동 시 `js/ai-response.js`의 `getTemporaryAiResponse()`를 비동기 API 호출로 교체합니다.
- SGF 기반 문제 로딩은 `js/sgf.js`에 파서를 추가하고 `js/problems.js`의 데이터 형식으로 변환하면 됩니다.
- 관리자 변경사항 영구 저장은 `localStorage` 또는 JSON export 기능으로 확장할 수 있습니다.
