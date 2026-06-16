# 🗒️ 메모장 (Notepad)

Evernote 스타일의 개인 메모장. **Turso(libSQL)** 를 데이터베이스로 사용하고, **Render Blueprint** 로 자동 배포됩니다.

## 기능

- 📒 노트북(폴더)으로 노트 분류
- ✍️ 리치 텍스트 에디터 (굵게/기울임/제목/목록/인용/링크 등)
- 💾 자동 저장 (입력 후 0.7초 디바운스)
- 🔍 제목·본문 전체 검색
- ⭐ 즐겨찾기
- 🔒 단일 비밀번호 인증 (HMAC 서명 쿠키 세션)

## 기술 스택

- 백엔드: Node.js + Express
- 프론트엔드: 바닐라 JS (단일 서버가 API + 정적 파일 제공)
- DB: Turso / libSQL (`@libsql/client`)

## 로컬 실행

```bash
npm install
npm start          # 또는 개발용: npm run dev
# http://localhost:3000
```

### 환경변수 (`.env`)

| 변수 | 설명 |
| --- | --- |
| `TURSO_URL` | Turso 데이터베이스 URL (`libsql://...`) |
| `TURSO_TOKEN` | Turso 인증 토큰 |
| `APP_PASSWORD` | 로그인 비밀번호 (비우면 인증 없이 동작) |
| `SESSION_SECRET` | 세션 쿠키 서명 키 (운영 환경에선 임의의 긴 문자열) |
| `PORT` | 서버 포트 (기본 3000, Render가 자동 주입) |

> 스키마는 서버 시작 시 자동으로 생성됩니다(`db.js`의 `initSchema`).

## Render 배포 (Blueprint)

1. 이 저장소를 GitHub에 push 합니다.
2. Render 대시보드 → **New → Blueprint** → 저장소 선택.
3. `render.yaml` 이 자동 인식됩니다. 아래 환경변수만 입력하세요.
   - `TURSO_URL`, `TURSO_TOKEN`, `APP_PASSWORD` (`sync: false` 항목)
   - `SESSION_SECRET` 은 Render가 자동 생성합니다.
4. 배포 완료 후, 이후 **git push 할 때마다 자동 재배포** 됩니다.

## 구조

```
.
├── server.js        # Express 서버 · 인증 · REST API
├── db.js            # Turso 클라이언트 · 스키마 초기화
├── render.yaml      # Render Blueprint
└── public/          # 프론트엔드 (정적)
    ├── index.html
    ├── styles.css
    └── app.js
```
