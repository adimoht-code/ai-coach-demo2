# AI 헬스코치 v0.4 — Mobile Light (All-in-One)

## 포함 기능
- 온보딩(키/몸무게/목표/기간) + 건너뛰기
- AI 프로그램 추천(간단 규칙 기반)
- MoveNet 자세 인식 (TF.js) + 실시간 피드백
- Web Speech API 음성 코칭 (영/한 혼합)
- 세트/반복/정확도 + 휴식 타이머
- 리포트 생성(최근 10회) + HTML/CSV 내보내기
- 모바일 우선 UI (Light Theme)

## 실행
1) `index.html`을 HTTPS 환경에서 열면 카메라 사용 가능
   - GitHub Pages 권장 (자동 배포용 `.github/workflows/pages.yml` 포함)
2) 홈 → **AI 프로그램 추천** → **AI 코칭 시작하기**
3) 코칭 탭 → **미리보기/시작** → 카메라 허용
4) 종료 후 리포트 탭에서 **AI 리포트 생성**

## 개발 메모
- Pose: TensorFlow.js MoveNet Lightning
- 음성: `window.speechSynthesis` (Web Speech API)
- 저장: `localStorage` (개인정보는 브라우저에만 저장)
