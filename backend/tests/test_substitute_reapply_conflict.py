"""재확정 시 승인 대타 재적용이 대타 학생을 이중 배정하지 않는지 (#230의 빈 구멍).

#230이 "확정 배치 = 솔버 배정 + 승인된 대타"로 단일화하면서, 확정 때
`apply_approved_substitutes`가 원 근무자의 행을 쪼개 대타 학생에게 넘긴다.
그런데 확정 직전 겹침 검증(`_validate_confirm_no_overlaps`)은 **보내온 목록만**
보고 끝나고 재적용은 그 뒤에 일어난다. 새 계획에서 솔버가 대타 학생을 같은
시간에 이미 배정해 뒀다면 재적용이 겹치는 행을 하나 더 만들었고,
확정 응답은 그 사실을 한 글자도 알리지 않았다 (#178과 같은 종류의 침묵).

얹을 수 없으면 '해제됨'으로 돌리고 담당자에게 알린다 — #231이 만들어 둔 길이다.
"""

from datetime import date, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

# 개관 시간 안(월요일 14~18시)이어야 확정이 통과한다
WORK_DATE = date(2026, 9, 7)


def _client_as(db_session, user_id, role):
    def _get_db():
        yield db_session

    def _user():
        return auth.CurrentUser(id=user_id, role=role)

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[auth.get_current_user] = _user
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def scenario(db_session):
    """A의 14~18시가 확정돼 있고, 그중 15~17시가 B에게 승인된 상태."""
    dept = models.Department(name="정보서비스팀")
    db_session.add(dept)
    db_session.flush()
    db_session.add(models.Staff(
        staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"))
    for sid, name in (("20221111", "학생A"), ("20222222", "학생B")):
        db_session.add(models.Student(student_id=sid, name=name, password_hash="x"))
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    for sid in ("20221111", "20222222"):
        db_session.add(models.Application(
            student_id=sid, posting_id=posting.posting_id, status="합격"))

    batch = models.ScheduleBatch(
        department_id=dept.department_id, status="confirmed",
        period_start=WORK_DATE, period_end=WORK_DATE)
    db_session.add(batch)
    db_session.flush()
    row = models.WorkSchedule(
        batch_id=batch.batch_id, student_id="20221111", department_id=dept.department_id,
        work_date=WORK_DATE, start_time=time(14, 0), end_time=time(18, 0))
    db_session.add(row)
    db_session.flush()
    request = models.SubstituteRequest(
        schedule_id=row.schedule_id, work_date=WORK_DATE, department_id=dept.department_id,
        start_time=time(15, 0), end_time=time(17, 0), requester_id="20221111",
        substitute_id="20222222", status="승인", approved_by="STF001")
    db_session.add(request)
    db_session.commit()
    return {"department_id": dept.department_id, "request": request}


def _confirm(db_session, scenario, schedules):
    client = _client_as(db_session, "STF001", "staff")
    return client.post("/api/schedule/confirm", json={
        "department_id": scenario["department_id"],
        "period_start": WORK_DATE.isoformat(),
        "period_end": WORK_DATE.isoformat(),
        "schedules": schedules,
    })


def _row(student_id, start, end):
    return {"student_id": student_id, "date": WORK_DATE.isoformat(),
            "start_time": start, "end_time": end}


def _rows_of(db_session, batch_id, student_id):
    return (db_session.query(models.WorkSchedule)
            .filter(models.WorkSchedule.batch_id == batch_id,
                    models.WorkSchedule.student_id == student_id)
            .order_by(models.WorkSchedule.start_time).all())


def test_reapply_does_not_double_book_the_substitute(db_session, scenario):
    """새 계획이 대타 학생을 같은 시간에 이미 쓰고 있으면 얹지 않는다."""
    res = _confirm(db_session, scenario, [
        _row("20221111", "14:00", "18:00"),
        _row("20222222", "15:00", "17:00"),  # 솔버가 B를 따로 배정했다
    ])
    assert res.status_code == 201, res.text
    batch_id = res.json()["batch_id"]

    rows = _rows_of(db_session, batch_id, "20222222")
    overlaps = [
        (a, b) for i, a in enumerate(rows) for b in rows[i + 1:]
        if a.start_time < b.end_time and b.start_time < a.end_time
    ]
    assert not overlaps, f"대타 재적용으로 이중 배정됨: {[(str(r.start_time), str(r.end_time)) for r in rows]}"


def test_the_conflicting_approval_is_released_and_reported(db_session, scenario):
    """조용히 넘어가지 않는다 — 해제하고 확정 응답에 실어 담당자에게 알린다 (#231)."""
    res = _confirm(db_session, scenario, [
        _row("20221111", "14:00", "18:00"),
        _row("20222222", "15:00", "17:00"),
    ])
    released = res.json()["released_substitutes"]
    assert len(released) == 1, res.json()
    assert released[0]["request_id"] == scenario["request"].request_id
    assert released[0]["substitute_id"] == "20222222"

    db_session.refresh(scenario["request"])
    assert scenario["request"].status == "해제됨"


def test_reapply_still_works_when_there_is_no_conflict(db_session, scenario):
    """과잉 차단이 아니어야 한다 — 겹치지 않으면 종전대로 얹힌다."""
    res = _confirm(db_session, scenario, [_row("20221111", "14:00", "18:00")])
    assert res.status_code == 201, res.text
    batch_id = res.json()["batch_id"]
    assert res.json()["released_substitutes"] == []

    assert [(str(r.start_time), str(r.end_time)) for r in _rows_of(db_session, batch_id, "20222222")] == [
        ("15:00:00", "17:00:00")
    ]
    assert [(str(r.start_time), str(r.end_time)) for r in _rows_of(db_session, batch_id, "20221111")] == [
        ("14:00:00", "15:00:00"), ("17:00:00", "18:00:00")
    ]
