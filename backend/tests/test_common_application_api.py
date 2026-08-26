"""공통 지원서 API 테스트 (#122).

GET/PUT /api/students/me/common-application — 기본 인적사항(SAINT 학적 정보는
읽기 전용) + 경력·어학·자격증. 세 표는 화면 전체 저장 방식이라 PUT이 학생 소유
행을 전량 교체한다.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

SID = "20220042"
URL = "/api/students/me/common-application"


def _client(db_session, user):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = lambda: user
    return TestClient(app)


@pytest.fixture
def student_client(db_session):
    db_session.add(
        models.Student(
            student_id=SID, name="김현서", password_hash="x",
            department_name="국어국문학과", phone="010-1111-0042",
            email="neulbokim@sogang.ac.kr",
            enroll_status="재학", degree_course="학사", nationality="한국",
            grade_year=4, semester=10, completed_semesters=9,
            birth_date=date(2002, 3, 21), advisor="박슬기",
            interests=["IT/전산"],
        )
    )
    db_session.commit()
    try:
        yield _client(db_session, auth.CurrentUser(id=SID, role="student"))
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def staff_client(db_session):
    db_session.add(models.Student(student_id=SID, name="김현서", password_hash="x"))
    db_session.commit()
    try:
        yield _client(db_session, auth.CurrentUser(id="STF001", role="staff"))
    finally:
        app.dependency_overrides.clear()


def test_get_returns_saint_fields_and_empty_lists(student_client):
    """시드 직후처럼 이력이 없는 학생도 학적 정보는 그대로 내려온다."""
    res = student_client.get(URL)
    assert res.status_code == 200
    body = res.json()

    assert body["basic"]["student_id"] == SID
    assert body["basic"]["department_name"] == "국어국문학과"
    assert body["basic"]["semester"] == 10
    assert body["basic"]["birth_date"] == "2002-03-21"
    assert body["basic"]["email"] == "neulbokim@sogang.ac.kr"
    assert body["basic"]["interests"] == ["IT/전산"]
    assert body["careers"] == []
    assert body["languages"] == []
    assert body["certificates"] == []


def test_put_saves_contact_and_lists(student_client):
    res = student_client.put(URL, json={
        "basic": {"phone": "010-9999-0042", "email": "new@sogang.ac.kr"},
        "careers": [{
            "career_type": "교내근로", "organization": "로욜라도서관", "role": "근로학생",
            "period_start": "2025-09-01", "period_end": "2025-12-31", "detail": "자료 정리",
        }],
        "languages": [{"test_name": "TOEIC", "score": "905", "acquired_at": "2025-11-01"}],
        "certificates": [{"name": "ADsP", "issuer": "한국데이터산업진흥원"}],
    })
    assert res.status_code == 200
    body = res.json()

    assert body["basic"]["phone"] == "010-9999-0042"
    assert body["basic"]["email"] == "new@sogang.ac.kr"
    assert body["careers"][0]["organization"] == "로욜라도서관"
    assert body["careers"][0]["period_start"] == "2025-09-01"
    assert body["languages"][0]["score"] == "905"
    assert body["certificates"][0]["issuer"] == "한국데이터산업진흥원"

    # 재조회해도 그대로 (커밋 확인)
    assert student_client.get(URL).json()["careers"][0]["role"] == "근로학생"


def test_put_ignores_saint_fields(student_client):
    """학과·학기 등은 PUT 스키마가 받지 않으므로 요청에 넣어도 바뀌지 않는다."""
    res = student_client.put(URL, json={
        "basic": {
            "phone": "010-0000-0000",
            "department_name": "경영학과", "semester": 1, "enroll_status": "휴학",
        },
        "careers": [], "languages": [], "certificates": [],
    })
    assert res.status_code == 200
    basic = res.json()["basic"]

    assert basic["phone"] == "010-0000-0000"       # 편집 대상은 반영
    assert basic["department_name"] == "국어국문학과"  # 학적 항목은 그대로
    assert basic["semester"] == 10
    assert basic["enroll_status"] == "재학"


def test_put_replaces_lists_entirely(student_client):
    """부분 갱신이 아니라 전량 교체 — 빈 배열을 보내면 그 표가 비워진다."""
    student_client.put(URL, json={
        "basic": {},
        "careers": [
            {"organization": "A"}, {"organization": "B"}, {"organization": "C"},
        ],
        "languages": [{"test_name": "TOEIC"}], "certificates": [],
    })

    res = student_client.put(URL, json={
        "basic": {}, "careers": [{"organization": "D"}], "languages": [], "certificates": [],
    })
    body = res.json()

    assert [c["organization"] for c in body["careers"]] == ["D"]
    assert body["languages"] == []


def test_list_order_is_preserved(student_client):
    """표에서 정렬한 순서가 sort_order로 저장돼 조회 때 그대로 나온다."""
    orgs = ["세번째", "첫번째", "두번째"]
    student_client.put(URL, json={
        "basic": {},
        "careers": [{"organization": o} for o in orgs],
        "languages": [], "certificates": [],
    })

    assert [c["organization"] for c in student_client.get(URL).json()["careers"]] == orgs


def test_omitted_basic_field_is_untouched(student_client):
    """본문에 없는 필드는 기존 값을 유지한다."""
    student_client.put(URL, json={
        "basic": {"phone": "010-1234-5678"},
        "careers": [], "languages": [], "certificates": [],
    })
    assert student_client.get(URL).json()["basic"]["email"] == "neulbokim@sogang.ac.kr"


def test_explicit_null_clears_field(student_client):
    """null로 보내면 지운 것으로 본다 — 그러지 않으면 이메일을 비울 방법이 없다."""
    student_client.put(URL, json={
        "basic": {"phone": "010-1234-5678", "email": None},
        "careers": [], "languages": [], "certificates": [],
    })
    assert student_client.get(URL).json()["basic"]["email"] is None


def test_staff_is_rejected(staff_client):
    assert staff_client.get(URL).status_code == 403
    assert staff_client.put(URL, json={
        "basic": {}, "careers": [], "languages": [], "certificates": [],
    }).status_code == 403


def test_interests_replaced_as_whole_list(student_client):
    """관심 분야는 보낸 목록으로 통째 교체된다."""
    res = student_client.put(URL, json={
        "basic": {"interests": ["도서/자료 정리", "튜터링/교육"]},
        "careers": [], "languages": [], "certificates": [],
    })
    assert res.json()["basic"]["interests"] == ["도서/자료 정리", "튜터링/교육"]

    cleared = student_client.put(URL, json={
        "basic": {"interests": []}, "careers": [], "languages": [], "certificates": [],
    })
    assert cleared.json()["basic"]["interests"] == []


def test_null_interests_reads_as_empty_list(db_session, student_client):
    """컬럼 추가 전에 만들어진 행은 interests가 NULL이다 — 빈 목록으로 읽혀야 한다."""
    student = db_session.query(models.Student).filter(models.Student.student_id == SID).one()
    student.interests = None
    db_session.commit()

    assert student_client.get(URL).json()["basic"]["interests"] == []
