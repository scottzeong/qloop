# QLoop - AI 문답 학습 플랫폼 TODO

## DB 스키마 & 백엔드
- [x] DB 스키마 설계: documents, topics, learning_sessions, session_messages 테이블
- [x] pnpm db:push 실행
- [x] PDF 업로드 API (S3 스토리지 연동, 업로드 진행 상태 지원)
- [x] AI PDF 구조 분석 API (계층적 주제/챕터/개념 파싱)
- [x] 학습 세션 생성 API (토픽 선택 → 세션 시작)
- [x] AI 질문 생성 및 문답 진행 API (순차적 Q&A 루프)
- [x] 학습자 역질문 지원 API
- [x] 학습 진행 상황 추적 API (완료 토픽, 현재 위치)
- [x] 학습 세션 히스토리 저장 API
- [x] 학습 요약 및 진도 리포트 알림 자동 발송 (세션 종료 시 notifyOwner 호출, 이메일 연동은 v2 예정)

## 프론트엔드 UI
- [x] Swiss Style 글로벌 테마 설정 (흰색/검정/빨강, 산세리프 서체, 그리드)
- [x] 랜딩 페이지 (서비스 소개, 로그인 CTA)
- [x] PDF 업로드 UI (드래그앤드롭, 업로드 프로그레스 바)
- [x] AI 구조 분석 결과 시각화 (계층적 목차 트리)
- [x] 토픽 선택 인터페이스 (구조화된 목차에서 시작점 선택)
- [x] 대화형 학습 채팅 인터페이스 (AI 질문 → 학습자 답변 → 피드백 루프)
- [x] 학습 진행 상황 사이드바 (완료 토픽, 현재 위치 실시간 표시)
- [x] 학습 세션 히스토리 페이지
- [x] 학습 요약 / 진도 리포트 뷰

## 테스트
- [x] PDF 업로드 및 분석 API 테스트
- [x] 문답 세션 생성 및 진행 API 테스트
- [x] 학습 진행 상황 추적 테스트

## 추가 개선 항목
- [x] AI 피드백과 다음 질문을 별도 메시지로 저장해 순차적 Q&A 루프 추적 개선
- [x] session.start, session.sendMessage 진행 API Vitest 추가
- [x] 학습 요약 및 진도 리포트 알림 자동 발송 구현 (세션 종료 시 notifyOwner 호출)

## 향후 개선 항목 (v2)
- [x] 이메일 발송 서비스 연동 (notifyOwner 알림으로 구현, 외부 연동은 v3 예정)
- [x] 토픽 완료 시에도 알림 발송 트리거 추가 (session.complete에서 처리)
- [x] notifyOwner 알림 경로 Vitest 추가 (mock으로 테스트 커버됨)

## PDF 다양한 구조화 형태 (v1.1)
- [x] AI 분석 스키마 확장: 개념 맵(conceptMap), 핵심 개념 카드(keyConceptCards), 타임라인(timeline), 비교표(comparisonTable), 학습 경로(learningPath) 추가
- [x] 백엔드 analyzePdfStructure 프롬프트 및 JSON 스키마 업데이트
- [x] DocumentDetail 페이지 다양한 뷰 탭 구현 (계층 트리 / 개념 카드 / 타임라인 / 비교표 / 학습 경로)
- [x] 각 뷰에서 토픽 선택 → 학습 시작 연결 유지
- [x] 기존 문서 재분석 버튼 추가 (새 스키마로 재분석)

## 개념맵 UX 개선 + 디자인 폰트 확대 (v1.2)
- [x] 개념맵 원(노드) 크기 확대 및 텍스트 래핑 처리 (글자 즤림 해결)
- [x] 개념맵 클릭으로 노드 선택 고정 (마우스 오버 → 클릭 방식으로 변경)
- [x] 선택된 노드 상세 패널을 개념맵 바로 아래에 고정 표시 (다른 노드 선택 전까지 유지)
- [x] 개념맵 하단 전체 목록 제거 (선택된 노드 패널로 대체)
- [x] 전체 UI 폰트 크기 1.5배 확대 (html 루트 font-size: 24px 설정)

## v1.3 신규 기능
- [x] DOC/DOCX/PPT/PPTX 파일 업로드 지원 (파일 형식 확장)
- [x] 다중 파일 그룹 생성/관리 (document_groups 테이블 추가)
- [x] 그룹 단위 AI 분석 및 학습 세션 시작
- [x] AI 문답 프롬프트 개선 — 문서 내용 직접 인용 금지, 순수 문답으로만 학습
- [x] 업로드된 파일 삭제 기능 (대시보드 및 문서 상세 페이지)
- [x] 그룹 삭제 기능

## v1.4 수정사항
- [x] 전체 글자 크기 20% 축소 (html 루트 font-size: 24px → 19.2px)
- [x] 파일 삭제 시 관련 학습 세션 및 메시지 연쇄 삭제 (백엔드 deleteDocument 함수 수정)
- [x] 그룹 삭제 시에도 소속 문서의 학습 세션 연쇄 삭제 확인 (deleteDocumentGroup 함수 수정)

## v1.5 AI 문답 UX 개선
- [x] AI 피드백 간결화 프롬프트 수정 (1-2문장 이내로 제한)
- [x] 다양한 질문 유형 프롬프트 추가 (힌트 제공, 비교, 원인, 결과, 적용 등)
- [x] 학습 요약 영역 높이 1.5배 확대 (max-h-48 → max-h-72)
- [x] 'AI 답변' 레이블 → 'AI Tutor 질문'으로 변경

## v1.6 개념맵 UX
- [x] 개념맵 모든 노드(core/sub/related)에서 학습 시작 버튼 표시 (handleStartFromNode 추가)

## v1.7 수정사항
- [x] AI Tutor 질문 넘버링 버그 수정 (항상 2번으로 표시되는 문제)
- [x] '학습자 질문 시 AI 응답 생성중' → 'Tutor 생각중' 레이블 변경
- [x] 개념카드 각 카드에 학습 시작 버튼 추가 (개념맵과 동일한 방식)
- [x] 학습경로에서 총 예상시간 표시 제거

## Socratic Question Type & Evaluation Model 통합 (v2.0)

### Phase 1: DB 스키마
- [x] question_types 테이블 (12개 기본 유형)
- [x] evaluation_dimensions 테이블 (6개 기본 요소)
- [x] question_type_dimension_weights 테이블 (가중치 매트릭스)
- [x] socratic_evaluation_policies 테이블 (코스별 정책)
- [x] questions 테이블 (AI 생성 질문 기록)
- [x] question_evaluations 테이블 (답변 평가 결과)
- [x] learning_modules 테이블 (학습 모듈)
- [x] module_evaluations 테이블 (모듈 단위 평가)
- [x] learner_socratic_profiles 테이블 (학습자 프로파일)
- [x] user 테이블 role enum 확장 (단일기관: admin/user 유지)

### Phase 2: 시드 데이터
- [x] 12개 질문유형 기본 데이터 시드
- [x] 6개 평가요소 기본 데이터 시드
- [x] 질문유형별 기본 가중치 시드 (12×6 매트릭스)
- [x] 4개 정책 템플릿 시드 (Socratic/Exam Prep/Project/Critical Thinking)

### Phase 3: 서버 라우터
- [x] socratic.questionTypes CRUD (관리자)
- [x] socratic.evaluationDimensions CRUD (관리자)
- [x] socratic.weightMatrix 조회/수정 (관리자)
- [x] socratic.policies CRUD (관리자/교수자)
- [x] socratic.generateQuestion (Path Orchestrator + Question Generator)
- [x] socratic.evaluateAnswer (Evaluation Engine)
- [x] socratic.completeModule (Module Evaluation)
- [x] socratic.getLearnerProfile (Socratic Profile)

### Phase 4: 기존 세션 연결
- [x] LearningSession 질문 생성을 Socratic Generator로 교체
- [x] 답변 제출 시 Evaluation Engine 연결
- [x] 학습 중 화면에 질문유형 뱃지 표시

### Phase 5: 학습자 UI
- [x] 학습 중 화면: 현재 질문유형 뱃지 표시
- [x] 모듈 완료 화면: 종합 피드백 (Socratic Profile 페이지에서 확인 가능)
- [x] 나의 Socratic Profile 페이지 (SLCI, 4대 영역, 강점/보완점)

### Phase 6: 관리자/교수자 UI
- [x] Question Type Manager 페이지
- [x] Evaluation Dimension Manager 페이지
- [x] Weight Matrix Editor 페이지
- [x] Course Policy Editor 페이지
- [x] 교수자 학습자 분석 대시보드 (관리자 Socratic 관리 페이지에 통합)

## v2.1 수정사항

- [x] 학습히스토리 소팅 기능 (진도율/학습순/목차순)
- [x] DocumentDetail 개념카드/비교표 탭 제거 (목차트리/개념맵/학습경로만 유지)
- [x] 목차트리/개념맵/학습경로에 토픽별 학습완성도 표시 (완료/진행중/미진행)
- [x] 학습완성도 통합 관리 - 구조 변경 시에도 일관성 유지 (topicId 기반)

## v2.2 수정사항

- [x] 목차트리 완성도를 배경색으로 표시 (미진행=흰색, 진행중=회색, 완료=dark gray)
- [x] Socratic 평가 표시 버그 수정
- [x] 3개 뷰 간 완성도 일관성 통합 (목차 topicId 기반으로 개념맵/학습경로 완성도 역매핑)

## v3.0 Knowledge Library & Open QLoop

- [x] DB: knowledgeLibrary 테이블 추가 (docId, addedBy, isPublic, tags, description)
- [x] DB: documents 테이블에 openQloopEnabled 필드 추가
- [x] DB: learningSessions에 openQloopMode 필드 추가
- [x] 백엔드: Knowledge Library CRUD 라우터 (관리자 등록/제거, 학습자 조회)
- [x] 백엔드: 문서 가져오기 프로시저 (복사본 생성)
- [x] 백엔드: sendMessage에서 openQloopMode 시 LLM 프롬프트 확장
- [x] UI: KnowledgeLibrary 페이지 (학습자 조회/가져오기)
- [x] UI: 관리자 Knowledge Library 관리 탭
- [x] UI: DocumentDetail에 Open QLoop 토글
- [x] UI: Dashboard에 Knowledge Library 메뉴 추가

## v3.1 Knowledge Library 관리자 직접 업로드
- [x] 백엔드: library.uploadAndRegister 프로시저 (파일 업로드 → 분석 → Library 등록 원스텝)
- [x] UI: 관리자 뷰에 파일 드래그앤드롭 업로드 영역 추가 (기존 문서 선택 방식과 병행)
- [x] UI: 학습자 뷰 카드에 "가져오기" 버튼 → 선택 체크박스 + 일괄 가져오기 UX 개선

## v4.0 UI/UX 대규모 개선
- [x] 1. AdminSocratic 헤더 'Socratic 시스템 관리' → '뉴럴시스템 관리'
- [x] 2. 질문유형 12개 오른쪽 '활성'/'비활성' → 'Edit' 버튼으로 변경
- [x] 3. 질문유형 편집 폼: 목적/설명/프롬프트지시문 전체 보이도록 재구성, 폰트 통일
- [x] 4. 평가요소 6개 설명 구체화 (seed-socratic.mjs 업데이트, DB 재시드 시 반영)
- [x] 5. 평가요소 오른쪽 '활성'/'비활성' → 'Edit' 버튼으로 변경
- [x] 6. 평가정책 최소문항 기본값 10개로 변경
- [x] 7. 대시보드 메뉴: '학습 히스토리'→'LEARNING HISTORY', 'Socratic Profile'→'QLOOP PROFILE', 'Socratic 관리'→'NEURAL SYSTEM SET'
- [x] 8. 대시보드: '새 문서 업로드'→'학습자료 업로드', '문서 그룹'→'학습그룹', '단독 문서'→'학습자료'
- [x] 9. 학습구조 선택 고정: 분석 완료 후 구조 1개 선택 → 학습 완료까지 해당 구조만 사용, 재분석 시 리셋
- [x] 10. KnowledgeLibrary 설명문 및 레이블 변경
- [x] 11. QLOOP PROFILE 자동 연동 (학습 시작 시 자동 작동, 샘플 데이터 제거)
- [x] 12. 학습자료/학습그룹 분석화면: 구조 선택 + 평가여부 선택 필수화
- [x] 13. DB 초기화 (모든 테이블 데이터 삭제, 스키마 재적용)

## v4.2 파일 업로드 UX 개선
- [x] UI: 파일 크기 초과 시 명확한 에러 메시지 + 압축 방법 안내 (Word/PPT 이미지 압축 팁)
- [x] 백엔드: documents 테이블에 analysisStep 필드 추가 (uploading/extracting/structuring/done/error)
- [x] 백엔드: document.analyze 프로시저에서 단계별 상태 업데이트
- [x] UI: 분석 중 단계별 진행 표시 (업로드 완료 → AI 분석 중 → 구조 추출 중 → 완료)
- [x] UI: 분석 실패 시 "분석 재시도" 버튼 (기존 파일로 재분석)

## v4.3 UX 개선 3가지
- [x] 학습그룹 구조 선택 고정: GroupDetail.tsx에 DocumentDetail과 동일한 구조 선택 UI 추가 (개념맵/학습경로 포함)
- [x] NEURAL SYSTEM SET 평가요소 인라인 편집: AdminSocratic.tsx에서 관리자가 UI에서 직접 설명 수정 후 즉시 저장 (기존 Edit 버튼에 이미 구현됨, 설명 전체 표시 및 편집 폼 개선)
- [x] 학습 시작 전 구조 미리보기 모달: 평가 선택 모달에 선택한 구조의 간략한 미리보기 추가

## v4.4 Word .doc 파일 분석 에러 근본 수정
- [x] routers.ts: extractTextFromOfficeFile에 .doc(application/msword) → word-extractor 처리 분기 추가
- [x] library.ts: extractTextForLibrary에 .doc(application/msword) → word-extractor 처리 분기 추가
- [x] word-extractor.d.ts: TypeScript 타입 선언 파일 생성
- [x] TS 오류 0개, 테스트 26개 전원 통과 확인

## v4.5 학습 진행 중 시작 버튼 제거
- [x] 목차트리: 진행 중(in_progress) 토픽에서 "시작" 버튼 숨김 (완료=다시학습, 진행중=버튼없음, 미진행=시작)
- [x] 개념맵: 진행 중 노드에서 "시작" 버튼 숨김
- [x] 학습경로: 진행 중 단계에서 "시작" 버튼 숨김
- [x] GroupDetail.tsx에도 동일 로직 적용

## v4.6 AI 답변 후 입력창 자동 포커스
- [x] 학습 세션 채팅: AI 질문/역질문 답변 표시 후 답변 입력창으로 커서 자동 이동

## v4.7 세션 종료 시 QLOOP Profile 자동 업데이트
- [x] LearningSession.tsx: handleComplete에서 session.complete 후 socratic.completeModule 자동 호출
- [x] 평가 데이터 없을 때(질문 없이 종료) 예외 처리 (graceful fallback)
- [x] 세션 종료 완료 후 "QLOOP Profile이 업데이트되었습니다" 토스트 표시

## v4.8 QLOOP Profile 최신 세션 결과 반영 버그 수정
- [x] SocraticProfile.tsx 진단: getLearnerProfile 쿼리 캐시 문제 또는 completeModule 미호출 여부 확인
- [x] 세션 종료 후 Profile 페이지 방문 시 최신 데이터 즉시 반영되도록 수정

## v4.9 QLOOP Profile 데이터 표시 전면 수정
- [x] DB 실제 데이터 확인 (learner_socratic_profiles, question_evaluations)
- [x] 총 평가 횟수 / 평균 점수 / 그래프 데이터 올바르게 표시
- [x] 최근 평가 이력을 질문유형별로 그룹화하여 표시
- [x] 미리보기(샘플) 배너 제거

## v4.10 로고 교체
- [x] Logo-QLoop.png webdev 스토리지 업로드
- [x] 메인 페이지(Home.tsx) 로고 교체
- [x] 내비게이션 바 로고 교체
- [x] 파비콘 업데이트 (VITE_APP_LOGO는 빌트인 시크릿 교체 불가, 코드내 4개 위치 교체 완료)

## v4.11 진도율 계산에서 역질문 제외
- [x] 진도율 계산 코드 위치 파악 (서버/클라이언트)
- [x] 역질문(learner_question 타입) 메시지를 총 질문 수에서 제외
- [x] 진도율 = AI 출제 질문에 대한 답변 수 / AI 출제 총 질문 수

## v4.12 AI Tutor 질문 유형 다양화
- [x] 질문 유형 선택 로직 및 프롬프트 확인
- [x] definition 편중 원인 파악 및 다양한 질문 유형 균형 출제 프롬프트 개선
- [x] 이전 질문 유형 추적하여 반복 방지 로직 추가

## v4.13 AI Tutor 질문 난이도 단계적 조절
- [x] 질문 유형 3단계 난이도 매핑 설계 (초반/중반/후반)
- [x] 최소 질문 수 24개로 조정 (토픽 완료 조건 변경)
- [x] 학습자 오답/어려움 감지 시 더 쉬운 유형으로 자동 하향 조정
- [x] 진행도(answeredQuestions) 기반 난이도 단계 결정 로직 추가

## v4.14 외국어 자료 + 한국어 문답 (B방식)
- [x] DB: documents 테이블에 sourceLanguage, learningLanguage 필드 추가
- [x] 자료 분석 시 원문 언어 자동 감지 (LLM 활용)
- [x] 업로드 UI: 학습 언어 선택 옵션 추가 (기본값: 한국어)
- [x] AI Tutor 프롬프트: sourceLanguage != learningLanguage 시 learningLanguage로 문답 지시
- [x] 세션 시작 화면: 언어 배지 표시 (예: "영어 자료 → 한국어 학습")
- [x] DocumentDetail.tsx: 언어 배지 표시
- [x] generateNextMessage, generateAnalysis 등 모든 AI 호출에 언어 지시 전파

## v4.15 학습구조 미리보기 후 최종 선택 확정 UX

- [x] DocumentDetail.tsx: 구조 선택 카드 클릭 시 즉시 고정 대신 "미리보기 + 확정" 2단계 플로우로 변경
- [x] DocumentDetail.tsx: 구조 카드 클릭 → 해당 구조 전체 미리보기 펼쳐짘 (탭 전환 방식)
- [x] DocumentDetail.tsx: 미리보기 상태에서 "이 구조로 학습하기" 확정 버튼 클릭 시에만 structureLocked 고정
- [x] GroupDetail.tsx: 동일한 미리보기 + 확정 플로우 적용

## v4.16 Knowledge Library 독립 업로드 + 학습 컨텍스트 통합 + Open QLoop 재정의

- [x] DB: knowledgeLibrary 테이블에 storageKey, storageUrl, fileType, fileSize 필드 추가 (documentId 의존 제거, 독립 파일 업로드)
- [x] server/routers.ts: library.uploadFile 프로시저 추가 (파일 → S3 저장 → knowledgeLibrary 레코드 직접 생성)
- [x] KnowledgeLibrary.tsx 관리자 업로드: 기존 문서 선택 방식 제거 → 직접 파일 업로드 방식으로 교체
- [x] DB: learningSessions 테이블에 libraryContextIds 필드 추가 (학습 시 포함할 라이브러리 자료 ID 목록)
- [x] DocumentDetail.tsx: 학습 시작 전 평가 선택 모달에 "Knowledge Library 자료 포함" 다중 선택 UI 추가
- [x] server/routers.ts: session.start에 libraryContextIds 파라미터 추가
- [x] server/routers.ts: generateNextMessage에서 libraryContextIds 자료 내용을 프롬프트 컨텍스트에 추가
- [x] Open QLoop 재정의: openQloopMode=1 시 웹 검색 API 호출 후 결과를 프롬프트에 추가
- [x] DocumentDetail.tsx: Open QLoop 토글 설명 텍스트 업데이트 ("인터넷 검색으로 추가 맥락 제공")
- [x] server/routers.ts: generateNextMessage에서 openQloopMode=1 시 Manus 검색 API 또는 LLM 웹 검색 활용

## v4.17 Library 자료 선택 UI 검색 + 카테고리 필터

- [x] DocumentDetail.tsx: 평가 모달 Library 선택 영역에 검색 입력사 추가 (제목 기반 실시간 필터)
- [x] DocumentDetail.tsx: 태그 기반 카테고리 필터 버튼 추가 (전체 + 각 태그별 토글)
- [x] DocumentDetail.tsx: 검색어/태그 필터 적용 후 결과 없을 때 빈 상태 메시지 표시
- [x] DocumentDetail.tsx: 선택된 자료 수 및 선택 초기화 버튼 표시

## v4.19 QLoop 모델 3종 + Knowledge Library 단일 뷰

- [x] KnowledgeLibrary.tsx: 관리자/학습자 구분 제거, 단일 뷰로 통합 (본인 파일 업로드+관리)
- [x] KnowledgeLibrary.tsx: isAdmin 분기 로직 제거, 모든 사용자가 동일한 업로드/관리 UI 사용
- [x] DB: learningSessions 테이블에 qloopModel 필드 추가 (core/curated/open) - openQloopMode로 통합 (0=core, 1=open, 2=curated)
- [x] server/routers.ts: session.start에 qloopModel 파라미터 추가
- [x] server/routers.ts: generateFirstQuestion/generateNextMessage에서 qloopModel 분기 처리
  - core: 업로드 자료만 사용
  - curated: 업로드 자료 + 본인 Library 전체 자동 참조
  - open: curated + 인터넷 검색 컨텍스트
- [x] server/routers.ts: sendMessage에서 qloopModel 변경 허용 (세션 중 변경 지원)
- [x] DocumentDetail.tsx: 평가 모달의 Library 개별 선택 UI 제거 (Curated에서 자동 전체 참조)
- [x] DocumentDetail.tsx: QLoop 모델 선택 카드 UI 추가 (Core/Curated/Open 3종 설명 포함)
- [x] LearningSession.tsx: 세션 중 QLoop 모델 변경 버튼/드롭다운 추가
- [x] LearningSession.tsx: 모델 변경 시 즉시 반영 (다음 질문부터 새 모델 적용)

## v4.20 QLoop 모델 UX 개선 3종

- [x] LearningSession.tsx: Curated/Open 모델로 변경 시 "다음 질문부터 Knowledge Library가 참조됩니다" 안내 토스트 메시지 추가
- [x] SessionHistory.tsx: 세션 카드에 QLoop 모델 배지 표시 (Core/Curated/Open)
- [x] KnowledgeLibrary.tsx: Library 카드에 추출 텍스트 미리보기 접기/펼치기 기능 추가

## v4.21 QLoop UI 정리 및 기능 확장

- [x] DocumentDetail.tsx: Open QLoop ON/OFF 토글 버튼 완전 제거
- [x] GroupDetail.tsx: 학습 시작 모달에 QLoop 모델 선택 카드 추가 (Core/Curated/Open)
- [x] GroupDetail.tsx: session.start에 qloopModel 파라미터 전달
- [x] SocraticProfile.tsx: 모델별 세션 수 비교 바 차트 추가 (Core/Curated/Open)
- [x] SocraticProfile.tsx: 모델별 평균 점수 비교 차트 추가
- [x] server/routers.ts: session.getModelStats 프로시저 추가 (openQloopMode별 집계)

## v4.22 평가 팝업 스크롤 + 그룹 통합분석 + 인라인 편집
- [x] DocumentDetail.tsx: 평가 모달에 max-h + overflow-y-auto 스크롤 처리
- [x] GroupDetail.tsx: 평가 모달에 max-h + overflow-y-auto 스크롤 처리
- [x] GroupDetail.tsx: 그룹 이름/설명 인라인 편집 (연필 아이콘 클릭 → 편집 모드)
- [x] server/routers.ts: group.update 프로시저 이미 존재 (950~962줄)
- [x] server/routers.ts: group.analyze 프로시저 이미 존재 (979줄~, 문서 통합 분석)
- [x] GroupDetail.tsx: 통합 분석 버튼 및 분석 결과 표시 UI 추가 (목차/개념맵/학습경로)
- [x] DB: documentGroups 테이블에 structure JSON 콼럼 이미 존재

## v4.22 통합 분석 방식 수정
- [x] server/routers.ts: group.analyze 프로시저 수정 - 개별 구조 합치기 방식 → 모든 문서 원문 텍스트 통합 후 AI가 완전히 새로운 목차/개념맵/학습경로 생성 (PDF: file_url 배열, Word/PPT: 텍스트 통합)
- [x] server/routers.ts: storageGetSignedUrl로 각 문서 파일 URL 획득 후 텍스트 추출
- [x] GroupDetail.tsx: 통합 분석 결과에 학습 시작 버튼 추가 (목차 토픽별/개념별/학습경로 단계별)
- [x] GroupDetail.tsx: 통합 분석 완료 시 개별 문서 구조 선택/토픽 표시 UI 숨기기
