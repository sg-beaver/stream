"""시드의 학적 정보 파생 규칙 테스트 (#122).

학년·학기·이수학기를 하드코딩하지 않고 학번(입학연도)에서 파생하되, 군 복무 등으로
파생값과 다른 학생은 CSV의 semester로 덮어쓴다. 이때 학년도 그 학기 기준으로 다시
계산해야 한다 — 파생 학년을 그대로 두면 6학기인데 4학년으로 나온다.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

_SEED_PATH = Path(__file__).resolve().parents[1] / "scripts" / "seed_mock_data.py"


@pytest.fixture(scope="module")
def seed():
    spec = importlib.util.spec_from_file_location("seed_mock_data", _SEED_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["seed_mock_data"] = module
    spec.loader.exec_module(module)
    return module


def _row(seed, student_id):
    for r in [seed.APPLICANT_STUDENT] + seed.WORKING_STUDENTS:
        if r["student_id"] == student_id:
            return r
    raise AssertionError(f"{student_id} 없음")


def test_semester_derived_from_admission_year(seed):
    """2022학번 · 데모 기준 2026-2학기 → 10학기째, 이수 9, 4학년."""
    assert seed._academic_progress("20220042") == (4, 10, 9)
    assert seed._academic_progress("20240673") == (3, 6, 5)   # 2024학번
    assert seed._academic_progress("20211357") == (4, 12, 11)  # 2021학번


def test_grade_year_capped_at_four(seed):
    """5학년은 없다 — 12학기여도 4학년."""
    grade, semester, _ = seed._academic_progress("20211357")
    assert semester == 12 and grade == 4


def test_email_defaults_to_student_id(seed):
    assert seed._student_email("20220081", None) == "20220081@sogang.ac.kr"
    assert seed._student_email("20220081", "") == "20220081@sogang.ac.kr"


def test_email_override_wins(seed):
    assert _row(seed, "20220042")["email"] == "neulbokim@sogang.ac.kr"


def test_csv_semester_override_recomputes_grade(seed):
    """군 복무로 학기를 줄인 학생 — 학년·이수학기가 줄어든 학기를 따라간다."""
    yoon = _row(seed, "20220091")  # 윤영민: 파생 10학기 → 6학기 (-4)
    assert (yoon["semester"], yoon["completed_semesters"], yoon["grade_year"]) == (6, 5, 3)

    song = _row(seed, "20220077")  # 송형준: 파생 10학기 → 7학기 (-3)
    assert (song["semester"], song["completed_semesters"], song["grade_year"]) == (7, 6, 4)


def test_absolute_semester_override(seed):
    ahn = _row(seed, "20220081")  # 안희진: 8학기·이수 7로 직접 지정
    assert (ahn["semester"], ahn["completed_semesters"]) == (8, 7)


def test_defaults_filled_when_csv_blank(seed):
    row = _row(seed, "20220912")
    assert row["degree_course"] == "학사"
    assert row["nationality"] == "한국"
    assert row["enroll_status"] == "재학"


def test_photo_url_only_when_file_registered(seed):
    """사진 파일을 둔 학생만 photo_url을 갖는다 — 나머지는 화면에서 자리표시자로 떨어진다."""
    assert _row(seed, "20220042")["photo_url"] == "/assets/students/20220042.jpg"
    assert _row(seed, "20220912")["photo_url"] is None


def test_history_seed_split_between_demo_students(seed):
    """안희진은 uiux commonProfile, 김현서는 SAINT 학생활동 기록 기준."""
    assert {c["student_id"] for c in seed.STUDENT_CAREERS} == {"20220081", "20220042"}
    assert len([c for c in seed.STUDENT_CAREERS if c["student_id"] == "20220081"]) == 4
    assert len([c for c in seed.STUDENT_CAREERS if c["student_id"] == "20220042"]) == 9
    assert len(seed.STUDENT_LANGUAGES) == 3   # 안희진 2 + 김현서 1
    assert len(seed.STUDENT_CERTIFICATES) == 5


def test_detail_with_comma_is_not_truncated(seed):
    """세부내용에 쉼표가 있어도 CSV가 한 칸으로 읽혀야 한다 (따옴표 처리)."""
    row = next(
        c for c in seed.STUDENT_CAREERS if "음식점" in (c["organization"] or "")
    )
    assert row["detail"] == "홀서빙 및 손님 응대, 매장 관리"


def test_opic_grade_not_stored_as_score(seed):
    """uiux는 점수 칸에 IH를 넣었지만 스키마에 grade가 따로 있어 나눠 담는다."""
    opic = next(l for l in seed.STUDENT_LANGUAGES if l["test_name"] == "OPIc")
    assert opic["grade"] == "IH" and opic["score"] is None

    toeic = next(l for l in seed.STUDENT_LANGUAGES if l["test_name"] == "TOEIC")
    assert toeic["score"] == "905" and toeic["grade"] is None
