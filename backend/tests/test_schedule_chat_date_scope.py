"""챗봇이 보는 창을 날짜 단위로 넓힌 회귀 테스트 (LLM 호출 없음).

문제 — `get_student_availability`가 요일 반복(AvailableTime/ClassTime)만
돌려주던 때, 모델은 자기가 볼 수 있는 유일한 창(요일 표)의 모양을 근거로
"1주차와 2주차의 입력 데이터는 완전히 같습니다"를 단정했다. 솔버는 같은
기간을 날짜 단위로 본다 — `AvailabilityException`(날짜별 근무 가능/불가)과
학사 캘린더(공휴일·교내 휴강일·폐관일)를 날짜마다 적용하므로, 같은 요일도
주차마다 조건이 다를 수 있다.

이 파일이 지키는 것 —
① `get_student_availability`가 기간 안의 날짜별 예외를 함께 돌려주고,
   부서 정책이 그 예외를 실제로 반영하는지(applied)까지 구분한다,
② `get_period_calendar`가 주차별 학사 일정·개관 시간 차이를 돌려준다,
③ 부서 경계(타부서 학생 조회 거부)는 그대로다.
"""

import datetime

import pytest

from app import models
from app.scheduler import chat
from app.scheduler.chat import LlmStep
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

# 2주차에 학사 캘린더 차이가 있는 기간을 일부러 고른다 —
# 1주차: 9/24~26 폐관(하계 집중 휴무 후속), 2주차: 10/1·10/3 공휴일 단축 개관
PERIOD_START = datetime.date(2026, 9, 21)  # 월
PERIOD_END = datetime.date(2026, 10, 4)  # 일
WEEK2_MONDAY = datetime.date(2026, 9, 28)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    dept = models.Department(name="정보서비스팀")
    other_dept = models.Department(name="다른 부서")
    db_session.add_all([dept, other_dept])
    db_session.flush()

    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자",
                     department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x"),
        models.Student(student_id="20229999", name="타부서 학생", password_hash="x"),
    ])
    # 날짜별 예외를 실제로 반영하는 부서 (weekly_only면 솔버가 예외를 보지 않는다)
    db_session.add(models.DepartmentPolicy(
        department_id=dept.department_id, availability_mode="weekly_with_exceptions",
    ))

    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    other_posting = models.JobPosting(
        department_id=other_dept.department_id, title="타부서 공고", status="모집중")
    db_session.add_all([posting, other_posting])
    db_session.flush()
    db_session.add_all([
        models.Application(student_id="20221111", posting_id=posting.posting_id, status="합격"),
        models.Application(student_id="20229999", posting_id=other_posting.posting_id,
                           status="합격"),
    ])

    # 요일 반복은 두 주차가 완전히 같다 — 차이는 날짜별 예외에만 있다
    db_session.add_all([
        models.AvailableTime(term="2026-2", student_id="20221111", day_of_week=d,
                             start_time=_t("09:00"), end_time=_t("18:00"), preference=2)
        for d in range(1, 6)
    ])
    db_session.add_all([
        # 1주차 화요일 오전만 불가 (부분 UNAVAILABLE)
        models.AvailabilityException(
            student_id="20221111", exception_date=datetime.date(2026, 9, 22),
            exception_type="UNAVAILABLE", start_time=_t("09:00"), end_time=_t("12:00")),
        # 2주차 월요일 종일 불가
        models.AvailabilityException(
            student_id="20221111", exception_date=WEEK2_MONDAY,
            exception_type="UNAVAILABLE", start_time=None, end_time=None),
        # 2주차 금요일 저녁 추가 가능
        models.AvailabilityException(
            student_id="20221111", exception_date=datetime.date(2026, 10, 2),
            exception_type="AVAILABLE", start_time=_t("18:00"), end_time=_t("20:00"),
            preference=3),
        # 기간 밖 — 돌려주면 안 된다
        models.AvailabilityException(
            student_id="20221111", exception_date=datetime.date(2026, 10, 10),
            exception_type="UNAVAILABLE", start_time=None, end_time=None),
    ])

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=PERIOD_START, period_end=PERIOD_END, solver_summary={},
    )
    db_session.add(draft)
    db_session.flush()
    db_session.add(models.WorkSchedule(
        batch_id=draft.batch_id, student_id="20221111",
        department_id=dept.department_id, work_date=PERIOD_START,
        start_time=_t("09:00"), end_time=_t("12:00"),
    ))
    db_session.commit()
    return {"dept": dept, "draft": draft}


def _session(scenario, start=PERIOD_START, end=PERIOD_END):
    """툴을 직접 부르기 위한 세션 객체 (DB에 넣지 않는다 — 툴은 필드만 읽는다)."""
    return models.ChatSession(
        department_id=scenario["dept"].department_id,
        period_start=start, period_end=end,
        batch_id=scenario["draft"].batch_id, created_by="STF001",
    )


def _set_mode(db_session, scenario, mode):
    row = (
        db_session.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == scenario["dept"].department_id)
        .first()
    )
    row.availability_mode = mode
    db_session.commit()


def _by_date(result):
    return {e["date"]: e for e in result["availability_exceptions"]}


class TestAvailabilityExceptions:
    def test_exceptions_are_scoped_to_the_session_period(self, db_session, scenario):
        result = chat._tool_get_student_availability(
            db_session, _session(scenario), {"student_id": "20221111"})
        assert set(_by_date(result)) == {"2026-09-22", "2026-09-28", "2026-10-02"}
        assert result["period"] == {"start": "2026-09-21", "end": "2026-10-04"}

    def test_exception_rows_carry_date_type_and_times(self, db_session, scenario):
        result = chat._tool_get_student_availability(
            db_session, _session(scenario), {"student_id": "20221111"})
        rows = _by_date(result)

        all_day = rows["2026-09-28"]
        assert (all_day["type"], all_day["all_day"], all_day["day"]) == ("UNAVAILABLE", True, "월")
        assert all_day["start_time"] is None and all_day["end_time"] is None

        partial = rows["2026-09-22"]
        assert partial["all_day"] is False
        assert (partial["start_time"], partial["end_time"]) == ("09:00", "12:00")

        added = rows["2026-10-02"]
        assert (added["type"], added["preference"]) == ("AVAILABLE", 3)

    def test_weekly_pattern_alone_would_look_identical_across_weeks(self, db_session, scenario):
        """요일 표만 보면 두 주차가 같다 — 차이는 날짜별 예외에만 있다.

        이 대비가 원래 문제의 핵심이다: 요일 표만 돌려주던 툴로는 주차 간
        차이를 확인할 방법 자체가 없었다.
        """
        result = chat._tool_get_student_availability(
            db_session, _session(scenario), {"student_id": "20221111"})
        assert {r["day"] for r in result["available_times"]} == {"월", "화", "수", "목", "금"}
        assert _by_date(result)["2026-09-28"]["applied"] is True

    def test_weekly_with_exceptions_applies_both_types(self, db_session, scenario):
        result = chat._tool_get_student_availability(
            db_session, _session(scenario), {"student_id": "20221111"})
        assert result["availability_mode"] == "weekly_with_exceptions"
        assert all(e["applied"] for e in result["availability_exceptions"])
        assert "applied=true" in result["availability_exceptions_note"]

    def test_weekly_with_unavailable_ignores_available_rows(self, db_session, scenario):
        """materialize_availability와 같은 판정 — 이 모드는 AVAILABLE을 무시한다."""
        _set_mode(db_session, scenario, "weekly_with_unavailable")
        rows = _by_date(chat._tool_get_student_availability(
            db_session, _session(scenario), {"student_id": "20221111"}))
        assert rows["2026-09-28"]["applied"] is True
        assert rows["2026-10-02"]["applied"] is False

    def test_weekly_only_marks_every_exception_unapplied(self, db_session, scenario):
        """신고는 남아 있어도 솔버는 보지 않는다 — 모델이 배정 근거로 삼으면 안 된다."""
        _set_mode(db_session, scenario, "weekly_only")
        result = chat._tool_get_student_availability(
            db_session, _session(scenario), {"student_id": "20221111"})
        assert not any(e["applied"] for e in result["availability_exceptions"])
        assert "반영되지 않는다" in result["availability_exceptions_note"]

    def test_note_without_exceptions_points_to_the_calendar(self, db_session, scenario):
        """예외가 없다고 '주차별 조건이 같다'는 뜻은 아니다 — 캘린더를 가리킨다."""
        db_session.query(models.AvailabilityException).delete()
        db_session.commit()
        result = chat._tool_get_student_availability(
            db_session, _session(scenario), {"student_id": "20221111"})
        assert result["availability_exceptions"] == []
        assert "get_period_calendar" in result["availability_exceptions_note"]

    def test_term_boundary_keeps_both_terms_visible(self, db_session, scenario):
        """기간이 학기 경계를 넘으면 두 학기의 요일 표가 모두 필요하다 (#156과 같은 규칙).

        시작일 학기 하나만 읽으면 다음 학기 주차의 가능 시간이 통째로 빠져,
        모델이 "그 주에는 낸 시간이 없다"고 잘못 말하게 된다.
        """
        db_session.add(models.AvailableTime(
            term="2026-summer", student_id="20221111", day_of_week=3,
            start_time=_t("13:00"), end_time=_t("17:00"), preference=2))
        db_session.commit()
        result = chat._tool_get_student_availability(
            db_session,
            _session(scenario, datetime.date(2026, 8, 25), datetime.date(2026, 9, 7)),
            {"student_id": "20221111"},
        )
        assert [t["term"] for t in result["terms"]] == ["2026-summer", "2026-2"]
        assert {r["term"] for r in result["available_times"]} == {"2026-summer", "2026-2"}

    def test_other_department_student_is_still_refused(self, db_session, scenario):
        """부서 경계는 그대로 — 날짜별 예외까지 유출되면 더 나쁘다."""
        with pytest.raises(ValueError, match="부서 소속이 아닙니다"):
            chat._tool_get_student_availability(
                db_session, _session(scenario), {"student_id": "20229999"})


class TestPeriodCalendar:
    def test_tool_is_registered_and_declared(self):
        assert "get_period_calendar" in chat.READ_TOOL_HANDLERS
        assert "get_period_calendar" in [d.name for d in chat._TOOL_DECLARATIONS]

    def test_weeks_differ_by_closure_and_holiday(self, db_session, scenario):
        result = chat._tool_get_period_calendar(db_session, _session(scenario), {})
        week1, week2 = result["weeks"]

        assert (week1["start"], week1["end"]) == ("2026-09-21", "2026-09-27")
        assert [d.split()[0] for d in week1["special_days"]] == [
            "2026-09-24(목)", "2026-09-25(금)", "2026-09-26(토)"]
        assert all("폐관일" in d for d in week1["special_days"])

        assert (week2["start"], week2["end"]) == ("2026-09-28", "2026-10-04")
        assert [d.split()[0] for d in week2["special_days"]] == [
            "2026-10-01(목)", "2026-10-03(토)"]
        assert all("공휴일" in d for d in week2["special_days"])

        # 두 주차의 근무 가능한 날 수가 실제로 다르다 — "입력이 같다"의 반례
        assert (week1["open_days"], week2["open_days"]) == (3, 6)

    def test_days_carry_open_hours_and_period_type(self, db_session, scenario):
        days = {d["date"]: d for d in
                chat._tool_get_period_calendar(db_session, _session(scenario), {})["days"]}
        assert len(days) == 14

        holiday = days["2026-10-01"]
        assert holiday["notes"] == ["공휴일"]
        assert holiday["department_open"] is True
        assert holiday["open_hours"] == ["09:00-17:00"]  # 학기 중 공휴일 단축 개관

        closed = days["2026-09-24"]
        assert closed["department_open"] is False and closed["open_hours"] == []

        normal = days["2026-09-21"]
        assert normal["notes"] == [] and normal["open_hours"] == ["08:00-22:00"]
        assert (normal["period_type"], normal["term"], normal["week"]) == ("학기 중", "2026-2", 1)

    def test_range_is_clamped_to_the_session_period(self, db_session, scenario):
        result = chat._tool_get_period_calendar(
            db_session, _session(scenario),
            {"date_from": "2026-09-01", "date_to": "2026-09-23"},
        )
        assert result["period"] == {"start": "2026-09-21", "end": "2026-09-23"}
        assert len(result["days"]) == 3

    def test_range_outside_the_period_is_an_error(self, db_session, scenario):
        with pytest.raises(ValueError, match="세션 기간"):
            chat._tool_get_period_calendar(
                db_session, _session(scenario), {"date_from": "2026-11-01"})

    def test_missing_calendar_year_is_a_readable_error(self, db_session, scenario):
        session = _session(
            scenario, datetime.date(2030, 1, 7), datetime.date(2030, 1, 20))
        with pytest.raises(ValueError, match="학사 캘린더가 없어"):
            chat._tool_get_period_calendar(db_session, session, {})


class TestToolLoop:
    def test_model_can_call_the_calendar_tool_in_a_turn(
        self, db_session, scenario, monkeypatch
    ):
        """툴 루프를 실제로 통과하는지 — 등록만 되고 못 불리는 툴이 되지 않게."""
        queue = [
            LlmStep(function_calls=[("get_period_calendar", {})]),
            LlmStep(text="2주차에는 공휴일이 이틀 있어 개관 시간이 다릅니다."),
        ]
        monkeypatch.setattr(chat, "_llm_step", lambda contents: queue.pop(0))

        client = _client_as(db_session, "STF001", "staff")
        created = client.post("/api/schedule/chat/sessions", json={
            "department_id": scenario["dept"].department_id,
            "period_start": PERIOD_START.isoformat(),
            "period_end": PERIOD_END.isoformat(),
        })
        assert created.status_code == 201, created.json()
        res = client.post(
            f"/api/schedule/chat/sessions/{created.json()['session_id']}/messages",
            json={"content": "1주차랑 2주차가 왜 다른가요?"},
        )
        assert res.status_code == 201, res.json()
        call = res.json()["tool_calls"][0]
        assert call["tool"] == "get_period_calendar"
        assert [w["open_days"] for w in call["result"]["weeks"]] == [3, 6]
