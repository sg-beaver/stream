"""근무 시간표 자동 생성 모듈 (제약조건 기반 스케줄러).

STREAM 설계 원칙에 따라 AI Layer와 분리된 독립 모듈로,
Google OR-Tools CP-SAT 솔버를 사용해 Hard/Soft Constraint를
만족하는 근무 시간표를 생성한다.

구조:
- domain/       도메인 모델 (학생, 부서 정책, 학사 캘린더, 시간 그리드, 결과)
- config/       부서별 정책·학사 캘린더 JSON (추후 DB 이관 대상)
- constraints/  Hard/Soft 제약조건 클래스
- engine/       CP-SAT 솔버 래퍼
- reporting.py  시간표 그리드·근무 시간 집계 출력
- prototype.py  더미 데이터 기반 실행 진입점
"""
