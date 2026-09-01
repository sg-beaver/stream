"""find_schedules가 붙여 주는 인원·근무 블록 맥락 (#195, LLM 호출 없음).

회귀의 출처는 실제 화면이다. "주 15시간이 됐으니 한 시간 줄여 달라"는 요청에서
챗봇이 후보 3건 중 **가장 깔끔한 것을 빼고** 나머지 둘을 1·2안으로 추천했다:

- 금 18:00-19:00 — 1시간짜리 독립 블록, 같은 시간에 다른 근무자가 있다 (정답)
- 목 09:00-12:00 — 혼자 근무, 블록 두 개에 정확히 걸쳐 있어 1시간만 줄이면 블록이 쪼개진다
- 토 10:00-12:00 — 혼자 근무, 빼면 그 시간대 인원이 0이 된다

세 후보가 등가로 보였던 이유는 조회 결과에 인원·블록 정보가 없었기 때문이다.
student_name으로 걸면 그 학생 행만 오므로 "금요일 18시에 다른 근무자가 있다"는
사실이 모델에게 보이지 않았다. 편집 후 알림으로는 대체되지 않는다 — 최소 인원
미달은 warning이라 new_violations(critical만)에 담기지 않기 때문이다.
"""

import datetime

import pytest

from app import models
from app.scheduler import chat

MONDAY = datetime.date(2026, 9, 7)  # 2026-2 학기, 폐관·공휴일·시험 없음
THURSDAY = datetime.date(2026, 9, 10)
FRIDAY = datetime.date(2026, 9, 11)
SATURDAY = datetime.date(2026, 9, 12)
PERIOD_END = MONDAY + datetime.timedelta(days=6)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def over_cap(db_session):
    """학생A가 주 15시간(교비 상한 14시간 초과)인 근무표.

    정책은 부서 기본값(library_info_service) — 학기 중 평일 블록은
    09:00-10:30·10:30-12:00·…·18:00-19:00·19:00-20:00…, 토요일은
    09:00-12:00·12:00-13:00·13:00-17:00이고 최소 인원은 1명이다.
    """
    dept = models.Department(name="정보서비스팀", weekly_hour_limit=14)
    db_session.add(dept)
    db_session.flush()
    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자",
                     department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x",
                       funding_type="gyobi"),
        models.Student(student_id="20222222", name="학생B", password_hash="x",
                       funding_type="gyobi"),
    ])
    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END, solver_summary={},
    )
    db_session.add(draft)
    db_session.flush()

    rows = {}
    for key, student_id, day, start, end in [
        ("mon", "20221111", MONDAY, "09:00", "14:00"),        # 5시간
        ("tue", "20221111", MONDAY + datetime.timedelta(days=1), "09:00", "13:00"),  # 4시간
        ("thu", "20221111", THURSDAY, "09:00", "12:00"),      # 3시간 · 혼자
        ("fri1", "20221111", FRIDAY, "18:00", "19:00"),       # 1시간 · 학생B 동석
        ("fri2", "20221111", FRIDAY, "20:00", "22:00"),       # 2시간
        ("sat", "20221111", SATURDAY, "10:00", "12:00"),      # 2시간 · 혼자
        ("peer_fri", "20222222", FRIDAY, "18:00", "19:00"),   # 금 18시 동석자
    ]:
        row = models.WorkSchedule(
            batch_id=draft.batch_id, student_id=student_id,
            department_id=dept.department_id, work_date=day,
            start_time=_t(start), end_time=_t(end),
        )
        db_session.add(row)
        rows[key] = row
    db_session.flush()

    session = models.ChatSession(
        department_id=dept.department_id, period_start=MONDAY, period_end=PERIOD_END,
        batch_id=draft.batch_id, created_by="STF001",
    )
    db_session.add(session)
    db_session.commit()
    return {"dept": dept, "draft": draft, "session": session, "rows": rows}


def _by_time(result):
    return {(s["work_date"], s["start_time"]): s for s in result["schedules"]}


class TestStaffingAnnotations:
    def test_standalone_hour_with_coworker_is_safe_to_remove(self, db_session, over_cap):
        """금 18:00-19:00 — 1시간짜리 독립 블록에 동석자가 있어 빼도 인원이 남는다."""
        result = chat._tool_find_schedules(
            db_session, over_cap["session"], {"student_name": "학생A"}
        )
        row = _by_time(result)[(FRIDAY.isoformat(), "18:00")]
        assert row["hours"] == 1.0
        assert row["headcount"] == 2
        assert row["min_required"] == 1
        # 조회는 학생A로 걸었지만 동석자는 결과에 담긴다 — 이 사실이 없어서 회귀했다
        assert row["coworkers"] == ["학생B"]
        assert row["understaffed_if_removed"] is False
        assert row["work_blocks"] == ["18:00-19:00"]
        assert row["block_aligned"] is True

    def test_solo_block_flags_understaffing(self, db_session, over_cap):
        """목 09:00-12:00 — 혼자 근무라 빼면 최소 인원이 깨진다. 블록 2개에 정확히 걸쳐 있다."""
        result = chat._tool_find_schedules(
            db_session, over_cap["session"], {"student_name": "학생A", "weekday": "목"}
        )
        row = result["schedules"][0]
        assert row["hours"] == 3.0
        assert row["headcount"] == 1
        assert row["coworkers"] == []
        assert row["understaffed_if_removed"] is True
        assert row["work_blocks"] == ["09:00-10:30", "10:30-12:00"]
        assert row["block_aligned"] is True

    def test_partial_block_is_not_aligned(self, db_session, over_cap):
        """토 10:00-12:00 — 09:00-12:00 블록 안에 부분 배정이라 경계에 맞지 않는다."""
        result = chat._tool_find_schedules(
            db_session, over_cap["session"], {"student_name": "학생A", "weekday": "토"}
        )
        row = result["schedules"][0]
        assert row["hours"] == 2.0
        assert row["understaffed_if_removed"] is True
        assert row["work_blocks"] == ["09:00-12:00"]
        assert row["block_aligned"] is False

    def test_headcount_uses_emptiest_slot(self, db_session, over_cap):
        """금 18:00-22:00을 한 행으로 물으면 동석자가 없는 20시대가 기준이 된다.

        슬롯마다 인원이 다를 때 평균이나 최댓값을 쓰면 "빼도 되는 자리"로 잘못
        보인다 — 사람이 제일 적은 순간이 판정 기준이다.
        """
        row = over_cap["rows"]["fri1"]
        row.end_time = _t("22:00")  # 18:00-19:00(2명) + 19:00-22:00(1명)
        db_session.query(models.WorkSchedule).filter(
            models.WorkSchedule.schedule_id == over_cap["rows"]["fri2"].schedule_id
        ).delete()
        db_session.commit()

        result = chat._tool_find_schedules(
            db_session, over_cap["session"], {"student_name": "학생A", "weekday": "금"}
        )
        found = result["schedules"][0]
        assert found["headcount"] == 1
        assert found["coworkers"] == ["학생B"]
        assert found["understaffed_if_removed"] is True

    def test_missing_policy_file_degrades_quietly(self, db_session, over_cap):
        """정책 파일이 없는 부서 — 인원 정보만 빠지고 조회는 실패하지 않는다."""
        db_session.add(models.DepartmentPolicy(
            department_id=over_cap["dept"].department_id,
            availability_mode="weekly_only",
            policy_file_key="없는_부서_정책",
        ))
        db_session.commit()

        result = chat._tool_find_schedules(
            db_session, over_cap["session"], {"student_name": "학생A", "weekday": "금"}
        )
        assert result["count"] == 2
        assert "headcount" not in result["schedules"][0]
        assert result["schedules"][0]["start_time"] == "18:00"
