"""_get_relevant_clarification_answers()의 구조화된 키 매칭 단위 테스트 (LLM 호출 없음).

student/department는 대상 ID로 좁혀 매칭하고, rule_interpretation은 대상 ID
개념이 없어 저장된 전부를 가져온다는 설계문서 5번 섹션의 규칙만 검증한다.
"""

from datetime import datetime, timedelta

from app import models
from app.scheduler.review import (
    _build_prompt,
    _confirmed_info_section,
    _confirmed_rule_interpretation_section,
    _get_relevant_clarification_answers,
)


def _add_answer(
    db_session,
    target_type,
    target_id,
    field_name,
    question="q",
    answer="a",
    answered_at=None,
):
    row = models.ClarificationAnswer(
        target_type=target_type,
        target_id=target_id,
        field_name=field_name,
        question=question,
        answer=answer,
        answered_by="STF001",
    )
    if answered_at is not None:
        row.answered_at = answered_at
    db_session.add(row)
    db_session.commit()
    return row


class TestStudentMatching:
    def test_only_relevant_student_ids_included(self, db_session):
        _add_answer(db_session, "student", "20221234", "tenure_start_date", answer="2023-03-02")
        _add_answer(db_session, "student", "20229999", "tenure_start_date", answer="다른 학생 답변")

        result = _get_relevant_clarification_answers(db_session, department_id=1, student_ids={"20221234"})

        assert result["student"] == {"20221234": {"tenure_start_date": "2023-03-02"}}

    def test_multiple_fields_for_same_student(self, db_session):
        _add_answer(db_session, "student", "20221234", "tenure_start_date", answer="2023-03-02")
        _add_answer(db_session, "student", "20221234", "some_other_field", answer="값")

        result = _get_relevant_clarification_answers(db_session, department_id=1, student_ids={"20221234"})

        assert result["student"]["20221234"] == {
            "tenure_start_date": "2023-03-02",
            "some_other_field": "값",
        }

    def test_empty_student_ids_skips_query(self, db_session):
        _add_answer(db_session, "student", "20221234", "tenure_start_date", answer="2023-03-02")

        result = _get_relevant_clarification_answers(db_session, department_id=1, student_ids=set())

        assert result["student"] == {}

    def test_later_answer_overwrites_earlier_for_same_field(self, db_session):
        base = datetime(2026, 8, 1, 9, 0)
        _add_answer(
            db_session, "student", "20221234", "tenure_start_date",
            answer="오답(먼저 저장)", answered_at=base,
        )
        _add_answer(
            db_session, "student", "20221234", "tenure_start_date",
            answer="정답(나중 저장)", answered_at=base + timedelta(hours=1),
        )

        result = _get_relevant_clarification_answers(db_session, department_id=1, student_ids={"20221234"})

        assert result["student"]["20221234"]["tenure_start_date"] == "정답(나중 저장)"


class TestDepartmentMatching:
    def test_only_matching_department_id_included(self, db_session):
        _add_answer(db_session, "department", "1", "biweekly_max_hours", answer="190")
        _add_answer(db_session, "department", "2", "biweekly_max_hours", answer="다른 부서 답변")

        result = _get_relevant_clarification_answers(db_session, department_id=1, student_ids=set())

        assert result["department"] == {"biweekly_max_hours": "190"}

    def test_department_id_is_cast_to_string_for_lookup(self, db_session):
        # target_id 컬럼은 String이라 department_id(int)를 str로 캐스팅해 비교해야 매칭된다.
        _add_answer(db_session, "department", "3", "min_per_slot", answer="1")

        result = _get_relevant_clarification_answers(db_session, department_id=3, student_ids=set())

        assert result["department"] == {"min_per_slot": "1"}


class TestRuleInterpretationMatching:
    def test_all_rows_returned_regardless_of_department(self, db_session):
        _add_answer(db_session, "rule_interpretation", None, None, question="Q1", answer="A1")
        _add_answer(db_session, "rule_interpretation", None, None, question="Q2", answer="A2")
        # student/department 답변은 rule_interpretation 목록에 섞이면 안 된다
        _add_answer(db_session, "student", "20221234", "tenure_start_date", answer="2023-03-02")

        result = _get_relevant_clarification_answers(db_session, department_id=99, student_ids=set())

        assert result["rule_interpretation"] == [
            {"question": "Q1", "answer": "A1"},
            {"question": "Q2", "answer": "A2"},
        ]


class TestConfirmedSections:
    def test_confirmed_info_section_lists_student_and_department_answers(self):
        answers = {
            "student": {"20221234": {"tenure_start_date": "2023-03-02"}},
            "department": {"biweekly_max_hours": "190"},
        }
        text = _confirmed_info_section(answers)
        assert "20221234의 tenure_start_date: 2023-03-02" in text
        assert "부서의 biweekly_max_hours: 190" in text

    def test_confirmed_info_section_empty_is_none_marker(self):
        assert _confirmed_info_section({}) == "(없음)"

    def test_confirmed_rule_interpretation_section_lists_qa_pairs(self):
        answers = {"rule_interpretation": [{"question": "Q1", "answer": "A1"}]}
        text = _confirmed_rule_interpretation_section(answers)
        assert "Q: Q1" in text
        assert "A: A1" in text

    def test_confirmed_rule_interpretation_section_empty_is_none_marker(self):
        assert _confirmed_rule_interpretation_section({}) == "(없음)"


class TestBuildPromptInjectsConfirmedSections:
    def test_prompt_includes_confirmed_info_and_rule_interpretation(self, db_session):
        from datetime import date

        db_session.add(models.Department(department_id=1, name="정보서비스팀"))
        db_session.commit()
        batch = models.ScheduleBatch(
            department_id=1, period_start=date(2026, 8, 1), period_end=date(2026, 8, 7),
            status="draft",
        )
        db_session.add(batch)
        db_session.commit()
        db_session.refresh(batch)

        _add_answer(db_session, "department", "1", "biweekly_max_hours", answer="190")
        _add_answer(db_session, "rule_interpretation", None, None, question="Q1", answer="A1")
        clarification_answers = _get_relevant_clarification_answers(
            db_session, department_id=1, student_ids=set()
        )

        prompt = _build_prompt(batch, "아무 규칙", [], None, None, None, clarification_answers)

        assert "부서의 biweekly_max_hours: 190" in prompt
        assert "Q: Q1" in prompt and "A: A1" in prompt
