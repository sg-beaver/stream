"""POST /api/schedule/draft/edits API 테스트 (이슈 #133, REQ-SCHED-018).

draft 배정 이동·삭제·추가와 inverse 반환을 다룬다. 핵심 회귀는 두 가지 —
① 편집이 draft 배치만 바꾸고 confirmed·manual(학생 노출 경로)은 건드리지 않는다,
② 다건 편집은 all-or-nothing이라 실패 시 앞 편집도 남지 않는다.
"""

import datetime

import pytest

from app import models
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

# 주간 상한 검증이 학사 캘린더를 읽으므로 캘린더 파일이 있는 2026년의 학기 중
# 평일을 쓴다. 월요일 기준 — 같은 주(월~일) 계산이 명확하다.
MONDAY = datetime.date(2026, 9, 7)
TUESDAY = datetime.date(2026, 9, 8)
WEDNESDAY = datetime.date(2026, 9, 9)


def _t(hhmm: str) -> datetime.time:
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    """부서 2곳, 직원 2명, 학생 2명, draft 배치(배정 2건) + confirmed·manual 배치 각 1건."""
    dept = models.Department(name="정보서비스팀", weekly_hour_limit=14)
    other_dept = models.Department(name="다른 부서")
    db_session.add_all([dept, other_dept])
    db_session.flush()

    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"),
        models.Staff(staff_id="STF002", name="타부서 담당자", department_id=other_dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x", funding_type="gyobi"),
        models.Student(student_id="20222222", name="학생B", password_hash="x", funding_type="gyobi"),
    ])

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=MONDAY + datetime.timedelta(days=13),
    )
    confirmed = models.ScheduleBatch(
        department_id=dept.department_id, status="confirmed",
        period_start=MONDAY, period_end=MONDAY + datetime.timedelta(days=13),
    )
    manual = models.ScheduleBatch(department_id=dept.department_id, status="manual")
    db_session.add_all([draft, confirmed, manual])
    db_session.flush()

    def _row(batch, student_id, day, start, end):
        row = models.WorkSchedule(
            batch_id=batch.batch_id, student_id=student_id,
            department_id=dept.department_id, work_date=day,
            start_time=_t(start), end_time=_t(end),
        )
        db_session.add(row)
        return row

    draft_a = _row(draft, "20221111", MONDAY, "09:00", "12:00")
    draft_b = _row(draft, "20222222", MONDAY, "09:00", "12:00")
    confirmed_row = _row(confirmed, "20221111", TUESDAY, "14:00", "16:00")
    manual_row = _row(manual, "20222222", TUESDAY, "14:00", "16:00")
    db_session.commit()

    return {
        "dept": dept, "draft": draft, "confirmed": confirmed, "manual": manual,
        "draft_a": draft_a, "draft_b": draft_b,
        "confirmed_row": confirmed_row, "manual_row": manual_row,
    }


def _edit(client, edits):
    return client.post("/api/schedule/draft/edits", json={"edits": edits})


class TestSupersededConfirmedHours:
    """draft를 고칠 때 주간 상한은 '이 draft를 확정하면 내려갈 확정 배치'를 빼고 센다.

    같은 기간을 이미 확정해 둔 부서(재생성 흐름)에서는 확정본 + 초안이 이중으로
    세어져, 확정하면 통과할 배정이 편집 단계에서 거부됐다. 확정(confirm)은 이미
    같은 기준(to_be_superseded_ids)으로 검사한다.
    """

    def test_add_ignores_hours_of_confirmed_batch_this_draft_replaces(self, db_session, scenario):
        # 학생A: draft 월 3h + confirmed 화 2h. 부서 상한 14h.
        # 확정본 2h를 빼면 3 + 10 = 13h로 통과해야 한다 (빼지 않으면 15h로 거부).
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["draft"].batch_id,
            "student_id": "20221111", "work_date": WEDNESDAY.isoformat(),
            "start_time": "09:00", "end_time": "19:00",
        }])
        assert res.status_code == 200, res.json()

    def test_add_still_blocked_when_over_limit_without_confirmed(self, db_session, scenario):
        """확정본을 빼도 넘는 배정은 그대로 거부된다 — 제외가 상한을 무력화하지 않는다."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["draft"].batch_id,
            "student_id": "20221111", "work_date": WEDNESDAY.isoformat(),
            "start_time": "08:00", "end_time": "20:00",  # 3h + 12h = 15h > 14h
        }])
        assert res.status_code == 400
        assert "초과" in res.json()["error"]

    def test_manual_batch_hours_still_count(self, db_session, scenario):
        """수동 배치는 확정해도 내려가지 않으므로 계속 합산한다 (학생B: manual 화 2h)."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["draft"].batch_id,
            "student_id": "20222222", "work_date": WEDNESDAY.isoformat(),
            "start_time": "09:00", "end_time": "19:00",  # 3h + 2h(manual) + 10h = 15h
        }])
        assert res.status_code == 400


class TestSupersededConfirmedOverlap:
    """겹침 검사도 '이 draft를 확정하면 내려갈 확정 배치'를 빼고 본다.

    주간 상한은 #212에서 이미 그렇게 고쳤는데(위 TestSupersededConfirmedHours)
    겹침 축에는 같은 규칙이 적용되지 않아, 같은 기간을 이미 확정해 둔 부서에서는
    확정본과 겹치는 자리에 아무것도 넣을 수 없었다. 확정하면 그 확정본은 내려가므로
    실제로 겹치게 되는 일은 없다 — confirm은 이미 같은 기준으로 검사한다.
    """

    def test_add_over_confirmed_row_this_draft_replaces(self, db_session, scenario):
        """학생A는 확정본 화 14:00-16:00이 있다. 같은 자리에 draft 배정을 넣을 수 있어야 한다."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["draft"].batch_id,
            "student_id": "20221111", "work_date": TUESDAY.isoformat(),
            "start_time": "14:00", "end_time": "16:00",
        }])
        assert res.status_code == 200, res.json()

    def test_manual_batch_overlap_still_blocks(self, db_session, scenario):
        """수동 배치는 확정해도 내려가지 않으므로 계속 겹침으로 막는다 — 제외가 검사를
        통째로 무력화하지 않는다 (학생B: manual 화 14:00-16:00)."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["draft"].batch_id,
            "student_id": "20222222", "work_date": TUESDAY.isoformat(),
            "start_time": "15:00", "end_time": "17:00",
        }])
        assert res.status_code == 400
        assert "겹칩니다" in res.json()["error"]

    def test_same_draft_overlap_still_blocks(self, db_session, scenario):
        """같은 draft 안에서의 겹침은 그대로 막는다 (학생A: draft 월 09:00-12:00)."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["draft"].batch_id,
            "student_id": "20221111", "work_date": MONDAY.isoformat(),
            "start_time": "11:00", "end_time": "13:00",
        }])
        assert res.status_code == 400
        assert "겹칩니다" in res.json()["error"]

    def test_move_over_confirmed_row_this_draft_replaces(self, db_session, scenario):
        """이동도 같은 기준이다 — 내려갈 확정본 자리로는 옮길 수 있다."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "work_date": TUESDAY.isoformat(),
            "start_time": "15:00", "end_time": "17:00",
        }])
        assert res.status_code == 200, res.json()

    def test_partial_remove_over_confirmed_batch(self, db_session, scenario):
        """#214의 '칸 하나만 빼기'가 확정본과 겹치는 기간에서도 저장된다.

        화면은 병합 행을 지우고 남는 앞·뒤 구간을 add로 되넣는데(#214), 그 되넣기가
        확정본과 겹쳐 400으로 막혔다 — 화면 확인 중 실제로 밟은 경로다. 담당자에게는
        '이미 ...에 배정이 있어 겹칩니다'라는, 지금 보고 있지도 않은 배치를 가리키는
        메시지만 뜬다.
        """
        merged = models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            department_id=scenario["dept"].department_id, work_date=TUESDAY,
            start_time=_t("09:00"), end_time=_t("18:00"),
        )
        db_session.add(merged)
        db_session.commit()

        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [
            {"op": "remove", "schedule_id": merged.schedule_id},
            {"op": "add", "batch_id": scenario["draft"].batch_id, "student_id": "20221111",
             "work_date": TUESDAY.isoformat(), "start_time": "09:00", "end_time": "12:00"},
            {"op": "add", "batch_id": scenario["draft"].batch_id, "student_id": "20221111",
             "work_date": TUESDAY.isoformat(), "start_time": "13:00", "end_time": "18:00"},
        ])
        assert res.status_code == 200, res.json()

        rows = (
            db_session.query(models.WorkSchedule)
            .filter_by(batch_id=scenario["draft"].batch_id, student_id="20221111", work_date=TUESDAY)
            .order_by(models.WorkSchedule.start_time)
            .all()
        )
        assert [(r.start_time, r.end_time) for r in rows] == [
            (_t("09:00"), _t("12:00")),
            (_t("13:00"), _t("18:00")),
        ]


class TestMove:
    def test_move_returns_inverse_with_old_values(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "start_time": "13:00", "end_time": "16:00",
        }])
        assert res.status_code == 200, res.json()
        result = res.json()["results"][0]
        assert result["start_time"] == "13:00:00"
        assert result["inverse"] == {
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "batch_id": None, "student_id": None,
            "work_date": MONDAY.isoformat(),
            "start_time": "09:00:00", "end_time": "12:00:00",
        }
        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("13:00")

    def test_move_overlapping_own_old_slot_is_allowed(self, db_session, scenario):
        """30분만 미루는 이동 — 새 시간이 옛 시간과 겹쳐도 자기 자신과의 충돌이 아니다."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "start_time": "09:30", "end_time": "12:30",
        }])
        assert res.status_code == 200, res.json()

    def test_move_onto_same_draft_assignment_is_400(self, db_session, scenario):
        """같은 학생의 다른 draft 배정과 겹치는 이동은 거부된다.

        원래 이 테스트는 confirmed 화 14-16을 겹침 대상으로 썼는데, 그 확정본은
        이 draft를 확정하면 내려가는 배치라 이제 겹침으로 보지 않는다
        (TestSupersededConfirmedOverlap). 검사하려던 것 — '이미 찬 자리로는 못
        옮긴다' — 은 실제로 남는 배정으로 그대로 지킨다.
        """
        db_session.add(models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            department_id=scenario["dept"].department_id, work_date=WEDNESDAY,
            start_time=_t("14:00"), end_time=_t("16:00"),
        ))
        db_session.commit()
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "work_date": WEDNESDAY.isoformat(),
            "start_time": "15:00", "end_time": "17:00",
        }])
        assert res.status_code == 400
        assert "겹칩니다" in res.json()["error"]

    def test_move_onto_manual_assignment_is_400(self, db_session, scenario):
        """수동 배치와 겹치는 이동도 거부된다 — 수동은 확정해도 내려가지 않는다
        (학생B: manual 화 14:00-16:00)."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_b"].schedule_id,
            "work_date": TUESDAY.isoformat(),
            "start_time": "15:00", "end_time": "17:00",
        }])
        assert res.status_code == 400
        assert "겹칩니다" in res.json()["error"]

    def test_move_beyond_weekly_limit_is_400(self, db_session, scenario):
        """그 주 합계가 부서 상한(14h)을 넘는 이동은 거부된다.

        시간대는 개관 시간(월 08:00~22:00) 안에 둔다 — 개관 밖으로 늘리면 상한이
        아니라 개관 검사(#216)에 먼저 걸려 다른 이유로 400이 난다. 월요일 개관은
        14시간뿐이라 한 행만으로는 상한을 넘길 수 없어, 같은 주에 12시간을
        미리 깔아두고 3시간 이동으로 15시간을 만든다.
        """
        db_session.add(models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            department_id=scenario["dept"].department_id, work_date=WEDNESDAY,
            start_time=_t("08:00"), end_time=_t("20:00"),  # 12h
        ))
        db_session.commit()

        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "start_time": "08:00", "end_time": "11:00",  # 3h → 주 15h
        }])
        assert res.status_code == 400
        assert "초과" in res.json()["error"]

    def test_move_confirmed_row_is_400(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["confirmed_row"].schedule_id,
            "start_time": "10:00", "end_time": "12:00",
        }])
        assert res.status_code == 400
        assert "draft" in res.json()["error"]

    def test_move_nonexistent_is_404(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": 99999,
            "start_time": "10:00", "end_time": "12:00",
        }])
        assert res.status_code == 404


class TestRemoveAndAdd:
    def test_remove_inverse_is_add(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{"op": "remove", "schedule_id": scenario["draft_a"].schedule_id}])
        assert res.status_code == 200, res.json()
        inverse = res.json()["results"][0]["inverse"]
        assert inverse["op"] == "add"
        assert inverse["batch_id"] == scenario["draft"].batch_id
        assert inverse["student_id"] == "20221111"
        assert inverse["start_time"] == "09:00:00"
        remaining = db_session.query(models.WorkSchedule).filter_by(
            batch_id=scenario["draft"].batch_id
        ).count()
        assert remaining == 1

    def test_add_inverse_is_remove_of_new_id(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["draft"].batch_id,
            "student_id": "20221111", "work_date": TUESDAY.isoformat(),
            "start_time": "09:00", "end_time": "11:00",
        }])
        assert res.status_code == 200, res.json()
        result = res.json()["results"][0]
        assert result["inverse"] == {
            "op": "remove", "schedule_id": result["schedule_id"],
            "batch_id": None, "student_id": None,
            "work_date": None, "start_time": None, "end_time": None,
        }

    def test_add_to_manual_batch_is_400(self, db_session, scenario):
        """manual 배치는 학생 노출 경로 — 이 API로는 절대 쓸 수 없다."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["manual"].batch_id,
            "student_id": "20221111", "work_date": TUESDAY.isoformat(),
            "start_time": "09:00", "end_time": "11:00",
        }])
        assert res.status_code == 400
        assert "draft" in res.json()["error"]

    def test_add_unknown_student_is_404(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "add", "batch_id": scenario["draft"].batch_id,
            "student_id": "99999999", "work_date": TUESDAY.isoformat(),
            "start_time": "09:00", "end_time": "11:00",
        }])
        assert res.status_code == 404

    def test_remove_then_readd_via_inverse_restores_slot(self, db_session, scenario):
        """inverse를 그대로 다시 보내면 원상 복구된다 — 챗봇 되돌리기(#135)의 계약."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{"op": "remove", "schedule_id": scenario["draft_a"].schedule_id}])
        inverse = res.json()["results"][0]["inverse"]

        res2 = _edit(client, [inverse])
        assert res2.status_code == 200, res2.json()
        restored = res2.json()["results"][0]
        assert restored["student_id"] == "20221111"
        assert restored["work_date"] == MONDAY.isoformat()
        assert restored["start_time"] == "09:00:00"

    def test_partial_remove_is_remove_plus_readd_of_leftovers(self, db_session, scenario):
        """행 가운데 한 칸만 빼기 — 화면(#214)이 보내는 remove + add(앞) + add(뒤).

        서버에는 '행 일부 삭제'가 없다. 연속 근무가 한 행으로 합쳐져 저장되므로
        (09:00~12:00 한 행) 10:00~11:00만 빼려면 행을 지우고 남는 앞·뒤를 되넣는다.
        한 요청 안에서 remove가 먼저 적용돼야 되넣기가 겹침 검사에 걸리지 않는다.
        """
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [
            {"op": "remove", "schedule_id": scenario["draft_a"].schedule_id},
            {"op": "add", "batch_id": scenario["draft"].batch_id, "student_id": "20221111",
             "work_date": MONDAY.isoformat(), "start_time": "09:00", "end_time": "10:00"},
            {"op": "add", "batch_id": scenario["draft"].batch_id, "student_id": "20221111",
             "work_date": MONDAY.isoformat(), "start_time": "11:00", "end_time": "12:00"},
        ])
        assert res.status_code == 200, res.json()

        rows = (
            db_session.query(models.WorkSchedule)
            .filter_by(batch_id=scenario["draft"].batch_id, student_id="20221111")
            .order_by(models.WorkSchedule.start_time)
            .all()
        )
        assert [(r.start_time, r.end_time) for r in rows] == [
            (_t("09:00"), _t("10:00")),
            (_t("11:00"), _t("12:00")),
        ]



class TestPermissions:
    def test_other_department_staff_is_403(self, db_session, scenario):
        client = _client_as(db_session, "STF002", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "start_time": "13:00", "end_time": "16:00",
        }])
        assert res.status_code == 403

    def test_student_role_is_403(self, db_session, scenario):
        client = _client_as(db_session, "20221111", "student")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "start_time": "13:00", "end_time": "16:00",
        }])
        assert res.status_code == 403

    def test_other_department_staff_gets_403_not_batch_status(self, db_session, scenario):
        """권한(403)이 draft 확인(400)보다 먼저다 — 타부서 직원이 400/404 차이로
        남의 부서 배치 상태(확정 여부)를 알아낼 수 없어야 한다."""
        client = _client_as(db_session, "STF002", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["confirmed_row"].schedule_id,
            "start_time": "10:00", "end_time": "12:00",
        }])
        assert res.status_code == 403

        res = _edit(client, [{
            "op": "add", "batch_id": scenario["manual"].batch_id,
            "student_id": "20221111", "work_date": TUESDAY.isoformat(),
            "start_time": "09:00", "end_time": "11:00",
        }])
        assert res.status_code == 403


class TestWriteBoundary:
    """설계 문서 사실 A·B 회귀 방지 — 편집은 draft만 바꾸고 학생 노출 경로는 불변."""

    def test_edits_never_touch_confirmed_or_manual(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [
            {"op": "move", "schedule_id": scenario["draft_a"].schedule_id,
             "start_time": "13:00", "end_time": "16:00"},
            {"op": "remove", "schedule_id": scenario["draft_b"].schedule_id},
        ])
        assert res.status_code == 200, res.json()

        db_session.expire_all()
        assert scenario["confirmed_row"].start_time == _t("14:00")
        assert scenario["manual_row"].start_time == _t("14:00")
        statuses = {
            b.status for b in db_session.query(models.ScheduleBatch).all()
        }
        assert statuses == {"draft", "confirmed", "manual"}

    def test_student_schedule_me_unchanged_after_edits(self, db_session, scenario):
        # _client_as는 앱 전역 오버라이드를 바꾸므로 항상 마지막에 만든 클라이언트만
        # 유효하다 — 학생 조회 → 직원 편집 → 학생 재조회 순서로 매번 새로 만든다.
        student = _client_as(db_session, "20221111", "student")
        before = student.get("/api/schedule/me").json()

        staff = _client_as(db_session, "STF001", "staff")
        res = _edit(staff, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "start_time": "13:00", "end_time": "16:00",
        }])
        assert res.status_code == 200

        student = _client_as(db_session, "20221111", "student")
        after = student.get("/api/schedule/me").json()
        assert after == before


class TestAtomicity:
    def test_multi_edit_failure_rolls_back_everything(self, db_session, scenario):
        """[유효한 move, 겹치는 move] — 두 번째가 실패하면 첫 번째도 남지 않는다."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [
            {"op": "move", "schedule_id": scenario["draft_a"].schedule_id,
             "start_time": "13:00", "end_time": "16:00"},
            {"op": "move", "schedule_id": scenario["draft_b"].schedule_id,
             "work_date": TUESDAY.isoformat(),
             "start_time": "15:00", "end_time": "17:00"},  # manual 화 14-16과 겹침
        ])
        assert res.status_code == 400

        db_session.rollback()  # 요청이 버린 세션 상태를 테스트 세션에서도 정리
        assert scenario["draft_a"].start_time == _t("09:00")
        assert scenario["draft_b"].work_date == MONDAY

    def test_later_edit_sees_earlier_edit(self, db_session, scenario):
        """옮겨서 비운 자리에 같은 요청 안에서 다른 학생을 추가할 수 있다."""
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [
            {"op": "move", "schedule_id": scenario["draft_a"].schedule_id,
             "start_time": "13:00", "end_time": "16:00"},
            {"op": "add", "batch_id": scenario["draft"].batch_id,
             "student_id": "20221111", "work_date": MONDAY.isoformat(),
             "start_time": "09:00", "end_time": "12:00"},  # 방금 비운 자리
        ])
        assert res.status_code == 200, res.json()
        assert len(res.json()["results"]) == 2


class TestValidation:
    def test_empty_edits_is_422(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [])
        assert res.status_code == 422

    def test_missing_required_field_per_op_is_422(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{"op": "move"}])  # schedule_id 없음
        assert res.status_code == 422

    def test_end_before_start_is_400(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = _edit(client, [{
            "op": "move", "schedule_id": scenario["draft_a"].schedule_id,
            "start_time": "16:00", "end_time": "13:00",
        }])
        assert res.status_code == 400
