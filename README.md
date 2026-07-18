# HomeStock
집에 있는 생활용품 재고를 가족과 함께 쉽게 관리할 수 있게 만든 웹앱입니다.

쉽게 말하면, 집에서 "어? 휴지 없네" 같은 순간을 줄이기 위해 만든 프로젝트입니다.

---

## 이 프로젝트는 무엇인가요?

- 한 줄 소개: 우리 집 생필품 재고 관리 웹앱
- 만든 이유: 재고 확인, 장보기, 가족 공유가 따로 놀아서 불편해서
- 대상: 1인 가구, 가족 단위 사용자

---

## 처음 보는 사람을 위한 핵심 기능 5가지

1. 로그인/시작 화면
- Google 로그인 또는 익명 시작으로 빠르게 들어갈 수 있습니다.
- 로그인 후 방(가족 코드)을 만들어 가족과 같은 재고를 공유할 수 있습니다.

2. 재고 등록/수정
- 품목명, 단위, 수량, 최소 기준, 유통기한을 등록할 수 있습니다.
- 바코드 입력과 카메라 스캔으로 빠르게 품목을 추가할 수 있습니다.

3. 자동 알림 + 장보기 리스트
- 소진 임박/재고 부족/유통기한 임박 항목을 자동으로 알려줍니다.
- 조건에 맞는 장보기 리스트를 자동 생성합니다.

4. 가족 공유 모드
- 같은 방 코드를 쓰면 여러 사람이 같은 재고를 함께 관리합니다.
- 공유 데이터 복사/붙여넣기로 동기화 안정성을 높였습니다.

5. AI 재고 도우미
- "품목에 김 1개 추가해줘" 같은 자연어 요청으로 재고를 바로 반영할 수 있습니다.
- 현재 재고를 바탕으로 우선 구매 품목, 소비 우선순위를 추천합니다.

---

## 기술 구성

- 프런트엔드: HTML, CSS, JavaScript(바닐라)
- 백엔드: Node.js + Express
- 인증/동기화: Firebase Authentication, Firestore
- AI: Azure OpenAI (서버 프록시 `/api/ai-chat`)
- 배포: Azure App Service

---

## 프로젝트 구조

```txt
HomeStock/
├── index.html            # 화면 구조
├── styles.css            # UI 스타일
├── app.js                # 프런트 로직(상태/렌더링/이벤트)
├── server.js             # 정적 서빙 + 보안 헤더 + AI 프록시
├── firebase-config.js    # Firebase 웹 설정
├── .env.example          # 환경변수 예시
├── .gitignore            # Git 제외 목록
├── package.json          # 실행 스크립트/의존성
└── README.md
```

---

## 웹 사이트

https://homestock61555.azurewebsites.net

위 주소로 접속해 바로 사용해볼 수 있습니다.

---

## 서버 API 한눈에 보기

주요 API

- POST `/api/ai-chat` : 재고 질문/추천/자연어 등록 요청 처리

동작 예시

- "품목에 치약 2개 추가해줘" -> AI 액션으로 재고 반영
- "지금 가장 먼저 사야 할 3개 알려줘" -> 우선 구매 추천

---

## 보안에서 신경 쓴 점

- API 키는 서버 환경변수(.env/App Settings)에만 보관
- 보안 헤더(CSP, X-Frame-Options, X-Content-Type-Options 등) 적용
- 민감 파일 경로 차단(`/.env`, `/.git` 등)
- AI API 요청 속도 제한(Rate limit)
- 클라이언트에 키 노출 없이 서버 프록시 방식 유지

---

## 실행 방법

1. Node.js 20+ 설치
2. 의존성 설치
   - `npm install`
3. `.env.example` 참고해서 `.env` 생성 후 값 입력
   - `AZURE_OPENAI_ENDPOINT`
   - `AZURE_OPENAI_DEPLOYMENT`
   - `AZURE_OPENAI_API_KEY`
   - `AZURE_OPENAI_API_VERSION` (기본값: `2024-10-21`)
4. 서버 실행
   - `npm start`
5. 브라우저 접속
   - `http://localhost:5501`

---

## 현재 진행 상태

- 완료: 재고관리/알림/장보기/가족공유/AI 도우미/운영 배포
- 진행 중: 로그인 UX 개선, 운영 모니터링 고도화

---

## 만든 사람

백준기
