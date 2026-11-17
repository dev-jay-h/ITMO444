# Resume Builder Execution Checklist

체크 규칙:

- `[x]` 완료 및 검증됨
- `[ ]` 아직 실행하지 않음
- 각 단계의 명령 결과와 스크린샷을 `evidence/` 폴더에 저장
- Gemini API 키, AWS 비밀 키, 실제 이력서 개인정보는 저장하거나 캡처하지 않음

## 0. 실행 전 상태

- [x] `final_project` 폴더와 필수 스크립트 존재
- [x] uploader/viewer 앱 코드 존재
- [x] 각 앱의 테스트 파일 존재
- [x] 샘플 resume/job description 존재
- [x] 최소 권한 IAM 정책 작성
- [x] gzip user-data 및 16 KB 검사 구현
- [x] S3 `resumes/` 객체 1일 만료 규칙 구현
- [x] SNS 토픽 `resume-mailer-jhan38` 생성
- [x] AWS 로그인 사용자와 계정 번호 재확인 (`541195182299`, `user/Jay_Han`)
- [x] 현재 프로젝트 ALB와 ASG가 실행 중이지 않은지 확인 (조회 결과 없음)

Evidence:

```text
evidence/00-aws-caller-identity.png
evidence/00-sns-topic.png
AWS account: 541195182299
SNS topic: arn:aws:sns:us-east-2:541195182299:resume-mailer-jhan38
Project ALB query: no results
Project ASG query: no results
```

## 1. 로컬 단위 테스트 - Part D

- [ ] `uploader-app`: 13 passed, 0 failed
- [ ] `viewer-app`: 13 passed, 0 failed
- [ ] 의도적으로 viewer `highlight` 테스트를 한 번 실패시킴
- [ ] 변경을 원상복구함
- [ ] 원상복구 후 viewer 테스트가 다시 13 passed
- [ ] 테스트 결과 스크린샷 저장

Evidence:

```text

```

## 2. Gemini 키와 SSM - Part A

- [ ] Gemini API 키 생성
- [ ] 로컬 터미널에서 키 작동 확인
- [ ] 키를 SSM `/itmo-444/gemini-api-key`에 `SecureString`으로 저장
- [ ] `describe-parameters`에서 `SecureString` 확인
- [ ] shell 변수에서 Gemini 키 제거 확인
- [ ] 출력, 파일, shell history, 스크린샷에 키가 노출되지 않음

Evidence:

```text

```

## 3. SNS 기본 실습 - Part B

- [x] 표준 SNS 토픽 생성
- [ ] 본인 이메일 구독 생성
- [ ] `PendingConfirmation` 상태 스크린샷
- [ ] 이메일에서 구독 확인
- [ ] 실제 Subscription ARN 상태 스크린샷
- [ ] 기본 테스트 메시지 도착 확인
- [ ] 발신자 주소 기록
- [ ] 구독자가 없는 토픽의 publish 결과 기록
- [ ] 본인 이메일 구독에 `recipient` 필터 정책 설정
- [ ] 일치하는 recipient 메시지만 도착
- [ ] 다른 recipient 메시지는 도착하지 않음
- [ ] recipient 속성 없는 메시지는 도착하지 않음
- [ ] B5 결과표와 받은 편지함 스크린샷 저장

Evidence:

```text

```

## 4. AWS 스택 배포 - Part E

- [ ] `create_app_stack.sh` 실행
- [ ] uploader user-data 실제 byte 수 기록 (`< 16384`)
- [ ] viewer user-data 실제 byte 수 기록 (`< 16384`)
- [ ] S3 lifecycle rule 확인
- [ ] 배포된 uploader IAM 정책을 CLI로 다시 읽어 저장
- [ ] 배포된 viewer IAM 정책을 CLI로 다시 읽어 저장
- [ ] uploader target group `healthy`
- [ ] viewer target group `healthy`
- [ ] uploader `:8080` 페이지 로드
- [ ] viewer `:8081` 기본 페이지 로드
- [ ] `stack_outputs.env` 생성 확인

Evidence:

```text
Uploader user-data bytes:
Viewer user-data bytes:
ALB DNS:
```

## 5. 라이브 애플리케이션 테스트 - Part F

- [ ] F1 샘플 두 파일 업로드 및 viewer redirect 스크린샷
- [ ] Education 우선, Python/SQL/AWS 굵게 표시 확인
- [ ] F2 DOCX 다운로드 및 Word에서 열린 화면 스크린샷
- [ ] F3 원본과 비교하여 발명된 사실 여부 기록
- [ ] F4 첫 이메일 전송 및 SNS 확인 안내 스크린샷
- [ ] F5 확인 후 재전송, 이메일 링크 수신 스크린샷
- [ ] F6 private window에서도 링크 작동 확인
- [ ] F7 두 번째 통제 가능한 주소로 privacy/filter test
- [ ] F8 PDF, 위장 binary, empty, 100 KB 초과 파일 거부
- [ ] F9 prompt injection 문장이 결과에 영향 없음
- [ ] F10 `<script>alert(1)</script>`가 실행되지 않고 문자로 표시
- [ ] F11 잘못된 이메일 거부, 대문자 이메일 소문자 처리
- [ ] F12 존재하지 않는 resume ID가 not found 표시

Evidence:

```text

```

## 6. Pre-signed URL 실습 - Part B6

- [ ] 테스트 객체에 대해 10분짜리 pre-signed URL 생성
- [ ] private window에서 만료 전 다운로드 성공
- [ ] 만료 후 다시 열어 실패 확인
- [ ] 만료 전/후 결과 기록

Evidence:

```text

```

## 7. 의도적 장애 실험 - Part F2

- [ ] uploader의 SSM 권한 제거 후 사용자 메시지와 로그 기록
- [ ] SSM 권한 원상복구
- [ ] viewer의 SNS Publish 권한 제거 후 사용자 메시지와 로그 기록
- [ ] SNS 권한 원상복구
- [ ] SSM에 잘못된 Gemini 키 저장 후 사용자 메시지와 로그 기록
- [ ] 실제 Gemini 키 복원
- [ ] 로그에 resume 본문이 없는지 확인

Evidence:

```text

```

## 8. 복원력 실험 - Part G

- [ ] 생성된 resume URL 저장
- [ ] viewer EC2 인스턴스 종료
- [ ] 교체 중 상태 기록
- [ ] 새 viewer 인스턴스 `healthy` 확인
- [ ] 같은 resume URL이 다시 작동하는 스크린샷
- [ ] S3를 사용하는 이유에 관한 답안 작성

Evidence:

```text

```

## 9. 제출 자료 최종 확인

- [ ] `ls -a` 결과
- [ ] 두 앱 13/13 테스트 결과
- [ ] 의도적 테스트 실패 결과
- [x] E1 change list 작성 (`PROJECT_NOTES.md`)
- [x] IAM action-to-code 표 작성 (`PROJECT_NOTES.md`)
- [ ] 실제 배포된 IAM 정책 출력
- [ ] 실제 user-data byte 수
- [ ] SSM SecureString 스크린샷
- [ ] SNS 전/후 확인 및 필터 테스트 자료
- [ ] F1, F2, F4, F5 스크린샷
- [ ] F3, F6-F12 결과
- [ ] 장애 실험 3개 결과
- [ ] resilience 결과
- [x] short answers 초안 작성 (`PROJECT_NOTES.md`)

## 10. 최종 정리 - Part H

과제 제출 증거를 모두 확보한 뒤에만 진행한다.

- [ ] `cleanup_project.sh` 실행
- [ ] 프로젝트 SNS 토픽이 남지 않았음을 확인
- [ ] 프로젝트 SSM 파라미터가 남지 않았음을 확인
- [ ] 프로젝트 ALB가 남지 않았음을 확인
- [ ] 프로젝트 ASG가 남지 않았음을 확인
- [ ] 필요 없으면 Google AI Studio API 키 삭제
- [ ] 네 가지 empty listing 결과 저장

Evidence:

```text

```
