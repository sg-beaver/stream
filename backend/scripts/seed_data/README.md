# 시드 명단 CSV

`seed_mock_data.py`가 읽는 팀 공용 계정·가능시간 데이터입니다.
엑셀/스프레드시트로 열어 편집할 수 있고, **수정 후 PR → 팀원들이 `--reset` 재시드**하는 흐름을 따릅니다.

| 파일 | 내용 | 비고 |
|---|---|---|
| `departments.csv` | 부서 (id, 이름, 주간 한도, 정원) | id는 공고·직원이 참조하므로 임의 변경 금지 |
| `staff.csv` | 직원 계정 | 공고 작성자(created_by)가 참조 |
| `students.csv` | 학생 계정 | `funding_type`: gyobi(교비)/gukga(국가) · `role`: applicant(지원 데모)/worker(정보서비스팀 근로, 공고 6 합격 자동 생성) |
| `available_times.csv` | 주간 가능시간 | day_of_week: 월=1~일=7, 시간은 HH:MM |

- worker 학생의 명단·장학 구분은 `scheduler/config/sample/students_sample.json`과 일치해야 합니다 (시간표 생성이 아직 그 JSON을 읽음, #36 DB 로더 연동 전까지).
- 공고·지원서처럼 여러 줄 텍스트·중첩 구조인 데이터는 CSV가 아니라 `seed_mock_data.py` 안에 그대로 둡니다.
- 모든 계정의 비밀번호는 스크립트가 일괄 설정합니다 (`stream1234`).
