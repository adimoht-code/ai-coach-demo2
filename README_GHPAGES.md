# AI Coach — GitHub Pages Bundle

## 구성
- `index.html`, `styles.css`, `app.js` — 정적 웹앱 (카메라·루틴·리포트)
- `404.html` — SPA 라우팅/리프레시 대응 (GitHub Pages fallback)
- `.github/workflows/pages.yml` — main 브랜치 푸시 시 자동 배포

## 배포 방법
1. GitHub에 새 Public 저장소 생성 (예: `ai-coach-demo`), 기본 브랜치 `main`
2. 이 폴더 전체를 저장소에 커밋/푸시
3. Actions 탭에서 `Deploy static site to Pages` 워크플로 실행 확인
4. Settings → Pages → Branch: `gh-pages`(자동 설정) 확인
5. 접속: `https://<YOUR_ID>.github.io/<REPO_NAME>/`

> API 동기화는 선택 사항입니다. 서버 주소를 빈 값으로 두면 **로컬 저장**으로만 동작합니다.
