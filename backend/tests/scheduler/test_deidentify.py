"""LLM 전송 데이터 비식별화 (#200).

앞부분은 매핑·치환·복원 자체를, 뒷부분은 실제 프롬프트가 나가는 경로
(review / chat / note_suggest)를 검증한다. **"프롬프트에 실명이 없다"는
단정은 여기서만 검증할 수 있다** — 각 모듈은 프롬프트를 통째로 마스킹하므로
새 섹션이 늘어도 이 테스트가 그대로 지켜준다.
"""

import datetime
import json

import pytest

from app import models
from app.scheduler import chat, deidentify, note_suggest, review as review_module
from app.scheduler.chat import LlmStep
from app.scheduler.deidentify import Deidentifier, build_for_students
from app.scheduler.review import (
    ClarificationRequest,
    ReviewFinding,
    ReviewResult,
    review_batch,
)

MONDAY = datetime.date(2026, 9, 7)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


# ---------------------------------------------------------------------------
# 매핑·치환·복원
# ---------------------------------------------------------------------------


class TestMasking:
    def test_student_id_and_name_become_alias(self):
        deid = build_for_students([("20221234", "김서강")])

        masked = deid.mask("20221234 김서강 학생은 월요일에 근무합니다")

        # 학번과 이름이 나란히 붙으면 같은 별칭 하나로 접힌다
        assert masked == "S01 학생은 월요일에 근무합니다"

    def test_alias_is_stable_for_the_same_input(self):
        """같은 배치를 두 번 검토했을 때 프롬프트가 달라지면 비교가 안 된다."""
        students = [("20221234", "김서강"), ("20220001", "이가천")]

        first = build_for_students(students)
        second = build_for_students(reversed(students))

        assert first.mask("20221234") == second.mask("20221234")
        # 학번 오름차순으로 매긴다
        assert first.mask("20220001") == "S01"

    def test_longer_name_wins_over_its_prefix(self):
        deid = build_for_students([("20220001", "김서"), ("20220002", "김서강")])

        assert deid.mask("김서강 학생") == "S02 학생"

    def test_contacts_are_removed_not_aliased(self):
        """연락처류는 되돌릴 일이 없다 — 별칭을 주지 않고 지운다."""
        deid = build_for_students([("20221234", "김서강")])

        masked = deid.mask("급하면 010-1234-5678이나 abc@sogang.ac.kr로 연락주세요")

        assert "010-1234-5678" not in masked
        assert "abc@sogang.ac.kr" not in masked
        assert "(연락처 삭제)" in masked and "(이메일 삭제)" in masked

    def test_resident_number_is_removed(self):
        deid = Deidentifier()

        assert "990101" not in deid.mask("주민번호 990101-1234567 입니다")

    def test_one_letter_name_is_not_substituted(self):
        """한 글자 이름을 치환 목록에 넣으면 관계없는 낱말 속에서 터진다."""
        deid = build_for_students([("20221234", "김")])

        assert deid.mask("김치를 좋아합니다") == "김치를 좋아합니다"

    def test_unregistered_id_is_not_masked_until_registered(self):
        deid = build_for_students([("20221234", "김서강")])
        assert deid.mask("20229999") == "20229999"

        deid.alias("20229999")
        assert deid.mask("20229999") == "S02"

    def test_student_id_next_to_name_collapses_to_one_alias(self):
        """학번과 이름을 나란히 적은 자리는 둘 다 같은 별칭이 된다 — 접지 않으면
        "S01 S01"이 나가고 복원하면 "김서강 김서강"이 화면에 뜬다."""
        deid = build_for_students([("20221234", "김서강")])

        # 챗봇 툴 결과 형식
        assert deid.mask("김서강(20221234) 09:00-12:00") == "S01 09:00-12:00"
        # 미배정 후보·특이사항 줄 형식
        assert deid.mask("- 20221234 김서강 (근속 시작일: 2025-03-02)") == (
            "- S01 (근속 시작일: 2025-03-02)"
        )
        assert deid.restore("S01 09:00-12:00", style="name") == "김서강 09:00-12:00"

    def test_repeated_alias_across_lines_is_kept(self):
        """같은 학생이 줄마다 반복되는 배정 목록을 합치면 근무 건수가 사라진다."""
        deid = build_for_students([("20221234", "김서강")])

        masked = deid.mask("  - 09:00-13:00 20221234\n  - 14:00-18:00 20221234")

        assert masked == "  - 09:00-13:00 S01\n  - 14:00-18:00 S01"

    def test_mask_data_walks_nested_structures(self):
        deid = build_for_students([("20221234", "김서강")])

        masked = deid.mask_data(
            {"rows": [{"student_id": "20221234", "student_name": "김서강"}], "count": 1}
        )

        assert masked == {"rows": [{"student_id": "S01", "student_name": "S01"}], "count": 1}


class TestRestoring:
    def test_styles(self):
        deid = build_for_students([("20221234", "김서강")])

        assert deid.restore("S01", style="id") == "20221234"
        assert deid.restore("S01", style="name") == "김서강"
        assert deid.restore("S01", style="name_id") == "김서강(20221234)"

    def test_alias_followed_by_korean_particle(self):
        """'S01의'처럼 조사가 붙어도 복원돼야 한다 — 단어 경계로는 못 잡는다."""
        deid = build_for_students([("20221234", "김서강")])

        assert deid.restore("S01의 근무", style="name") == "김서강의 근무"

    @pytest.mark.parametrize(
        "model_wrote, expected",
        [
            # 받침 없는 이름(김찬우) — 모델이 "S03"을 "삼"으로 읽어 받침 조사를 쓴다
            ("S03이랑 같은 시간", "김찬우랑 같은 시간"),
            ("S03를 옮기세요", "김찬우를 옮기세요"),
            ("S03으로 바꿔주세요", "김찬우로 바꿔주세요"),
            # 받침 있는 이름(조수현) — 모델이 "S02"를 "이"로 읽어 받침 없는 조사를 쓴다
            ("S02는 월요일", "조수현은 월요일"),
            ("S02가 배정됐습니다", "조수현이 배정됐습니다"),
            # 으로/로는 ㄹ 받침만 예외 — 조수현(ㄴ)은 "으로"
            ("S02로 바꿔주세요", "조수현으로 바꿔주세요"),
            # 표에 없는 조사는 건드리지 않는다
            ("S03의 근무", "김찬우의 근무"),
            # 조사 뒤에 한글이 이어지면 낱말의 일부다 — 손대지 않는다
            ("S03이라고 했습니다", "김찬우이라고 했습니다"),
        ],
    )
    def test_particle_is_rechosen_for_the_restored_name(self, model_wrote, expected):
        """조사는 별칭을 읽은 발음에 맞춰 나온다 — 이름을 도로 넣으면 어긋난다.

        "S02"는 "에스공이"로 끝나 받침이 없고, "S03"은 "삼"으로 끝나 받침이 있다.
        복원한 이름의 받침을 보고 다시 고른다.
        """
        # 학번 오름차순으로 S01 안희진 / S02 조수현 / S03 김찬우
        deid = build_for_students(
            [("20261001", "안희진"), ("20261002", "조수현"), ("20261003", "김찬우")]
        )

        assert deid.restore(model_wrote, style="name") == expected

    def test_particle_is_left_alone_when_restored_value_is_not_hangul(self):
        """학번으로 복원하면 발음을 알 수 없다 — 틀리게 고치느니 손대지 않는다."""
        deid = build_for_students([("20261003", "김찬우")])

        assert deid.restore("S01은 월요일", style="id") == "20261003은 월요일"

    def test_round_trip_keeps_the_original_sentence(self):
        deid = build_for_students([("20221234", "김서강")])
        original = "김서강 학생은 월요일 오전이 어렵습니다"

        assert deid.restore(deid.mask(original), style="name") == original

    def test_name_without_alias_falls_back_to_student_id(self):
        deid = Deidentifier()
        deid.add("20221234")  # 이름을 모르는 학번

        assert deid.restore("S01", style="name") == "20221234"

    def test_unknown_alias_is_surfaced_not_left_as_code(self):
        """모델이 지어낸 별칭이 화면에 코드로 뜨면 담당자가 해석할 수 없다."""
        deid = build_for_students([("20221234", "김서강")])

        assert deid.restore("S07 학생", style="name") == "(알 수 없는 학생) 학생"

    def test_to_student_id_passes_through_non_alias(self):
        """되묻기 target_id는 학생이 아닐 수도 있다 (부서 ID·규칙 해석)."""
        deid = build_for_students([("20221234", "김서강")])

        assert deid.to_student_id("S01") == "20221234"
        assert deid.to_student_id("3") == "3"
        assert deid.to_student_id(None) is None


class TestSameName:
    """동명이인은 먼저 등록된 쪽 별칭에 이름을 붙인다 — 이름→별칭→이름으로
    되돌리면 같은 이름이 나오므로 이름으로 조회하는 쪽은 지금과 똑같이 동작한다."""

    def test_both_students_are_masked(self):
        deid = build_for_students([("20220001", "김서강"), ("20220002", "김서강")])

        assert deid.mask("20220001 20220002 김서강") == "S01 S02 S01"

    def test_each_alias_restores_to_its_own_student_id(self):
        deid = build_for_students([("20220001", "김서강"), ("20220002", "김서강")])

        assert deid.restore("S02", style="id") == "20220002"


class TestDisabled:
    def test_env_off_passes_values_through(self, monkeypatch):
        monkeypatch.setenv("LLM_DEIDENTIFY", "0")
        deid = build_for_students([("20221234", "김서강")])

        assert deid.mask("20221234 김서강") == "20221234 김서강"
        assert deid.restore("20221234") == "20221234"

    def test_empty_env_value_keeps_the_default_on(self, monkeypatch):
        """.env에 `LLM_DEIDENTIFY=`만 남아 있어도 켜진 채로 있어야 한다."""
        monkeypatch.setenv("LLM_DEIDENTIFY", "")

        assert deidentify.is_enabled() is True


# ---------------------------------------------------------------------------
# 실제 전송 경로
# ---------------------------------------------------------------------------


def _hire(db_session, student_id, name, department_id=1, posting_id=1):
    db_session.add(models.Student(student_id=student_id, name=name, password_hash="x"))
    if not (
        db_session.query(models.JobPosting)
        .filter(models.JobPosting.posting_id == posting_id)
        .first()
    ):
        db_session.add(
            models.JobPosting(
                posting_id=posting_id, department_id=department_id, title="공고"
            )
        )
    db_session.add(
        models.Application(student_id=student_id, posting_id=posting_id, status="합격")
    )
    db_session.commit()


@pytest.fixture
def department(db_session):
    db_session.add(models.Department(department_id=1, name="정보서비스팀"))
    db_session.add(
        models.DepartmentPolicy(
            department_id=1,
            availability_mode="weekly_only",
            custom_rules="김서강 학생은 금요일 마감 근무에서 뺀다",
        )
    )
    db_session.commit()
    return 1


class TestReviewPrompt:
    def _batch(self, db_session):
        batch = models.ScheduleBatch(
            department_id=1,
            period_start=MONDAY,
            period_end=MONDAY + datetime.timedelta(days=6),
            status="draft",
            solver_summary={"shortages": [], "penalty_summary": {}, "per_student": []},
        )
        db_session.add(batch)
        db_session.commit()
        db_session.refresh(batch)
        return batch

    def test_prompt_carries_no_student_id_or_name(
        self, db_session, department, monkeypatch
    ):
        _hire(db_session, "20221234", "김서강")
        _hire(db_session, "20225678", "이가천", posting_id=1)
        db_session.add(
            models.StudentNote(
                student_id="20221234",
                term=None,
                content="이가천이랑 같은 시간은 피하고 싶어요. 급하면 010-1234-5678로 연락주세요",
            )
        )
        batch = self._batch(db_session)
        db_session.add(
            models.WorkSchedule(
                batch_id=batch.batch_id,
                student_id="20221234",
                department_id=1,
                work_date=MONDAY,
                start_time=_t("09:00"),
                end_time=_t("12:00"),
            )
        )
        db_session.commit()

        captured = {}

        def _capture(contents):
            captured["prompt"] = contents
            return ReviewResult(summary="이상 없음", findings=[])

        monkeypatch.setattr(review_module, "_call_gemini", _capture)
        review_batch(db_session, batch.batch_id)

        prompt = captured["prompt"]
        for leaked in ("20221234", "20225678", "김서강", "이가천", "010-1234-5678"):
            assert leaked not in prompt, f"{leaked}이(가) 프롬프트에 남아 있다"
        # 판단에 필요한 내용 자체는 그대로 남는다
        assert "같은 시간은 피하고 싶어요" in prompt
        assert "금요일 마감 근무에서 뺀다" in prompt

    def test_response_is_restored_for_screen_and_db(
        self, db_session, department, monkeypatch
    ):
        _hire(db_session, "20221234", "김서강")
        batch = self._batch(db_session)

        monkeypatch.setattr(
            review_module,
            "_call_gemini",
            lambda contents: ReviewResult(
                summary="S01의 배정을 확인하세요",
                findings=[
                    ReviewFinding(
                        severity="warning",
                        rule="S01 학생은 금요일 마감 근무에서 뺀다",
                        evidence="S01 금요일 17:00-22:00",
                        message="S01이 금요일 마감에 배정됐습니다",
                        suggestion="S01을 다른 시간대로 옮기세요",
                    )
                ],
                clarification_requests=[
                    ClarificationRequest(
                        target_type="student",
                        target_id="S01",
                        field_name="tenure_start_date",
                        question="S01의 근속 시작일이 언제인가요?",
                        reason="경력자 판단 근거가 없습니다",
                    )
                ],
            ),
        )

        review = review_batch(db_session, batch.batch_id)["review"]

        # 사람이 읽는 문장은 이름(학번)으로
        assert review["summary"] == "김서강(20221234)의 배정을 확인하세요"
        finding = review["findings"][0]
        assert finding["message"] == "김서강(20221234)이 금요일 마감에 배정됐습니다"
        assert "김서강(20221234)" in finding["rule"]
        assert "김서강(20221234)" in finding["evidence"]
        assert "김서강(20221234)" in finding["suggestion"]
        # target_id는 ClarificationAnswer의 키라 학번만
        request = review["clarification_requests"][0]
        assert request["target_id"] == "20221234"
        assert request["question"] == "김서강(20221234)의 근속 시작일이 언제인가요?"

    def test_department_target_id_is_left_alone(
        self, db_session, department, monkeypatch
    ):
        _hire(db_session, "20221234", "김서강")
        batch = self._batch(db_session)
        monkeypatch.setattr(
            review_module,
            "_call_gemini",
            lambda contents: ReviewResult(
                summary="확인 필요",
                findings=[],
                clarification_requests=[
                    ClarificationRequest(
                        target_type="department",
                        target_id="1",
                        field_name="biweekly_max_hours",
                        question="2주 상한이 얼마인가요?",
                        reason="규칙에 숫자가 없습니다",
                    )
                ],
            ),
        )

        review = review_batch(db_session, batch.batch_id)["review"]

        assert review["clarification_requests"][0]["target_id"] == "1"


class TestChatTurn:
    @pytest.fixture
    def session_row(self, db_session, department):
        _hire(db_session, "20221111", "학생A")
        batch = models.ScheduleBatch(
            department_id=1,
            period_start=MONDAY,
            period_end=MONDAY + datetime.timedelta(days=13),
            status="draft",
            solver_summary={"penalty_summary": {}, "penalty_events": []},
        )
        db_session.add(batch)
        db_session.flush()
        db_session.add(
            models.WorkSchedule(
                batch_id=batch.batch_id,
                student_id="20221111",
                department_id=1,
                work_date=MONDAY,
                start_time=_t("09:00"),
                end_time=_t("12:00"),
            )
        )
        row = models.ChatSession(
            department_id=1,
            period_start=MONDAY,
            period_end=MONDAY + datetime.timedelta(days=13),
            batch_id=batch.batch_id,
            created_by="STF001",
        )
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        return row

    def _capture_contents(self, monkeypatch, steps):
        seen = []
        queue = list(steps)

        def _step(contents):
            seen.append(contents)
            return queue.pop(0)

        monkeypatch.setattr(chat, "_llm_step", _step)
        return seen

    def test_staff_utterance_and_context_are_masked(
        self, db_session, session_row, monkeypatch
    ):
        db_session.add(
            models.StudentNote(student_id="20221111", term=None, content="목요일 시험")
        )
        db_session.commit()
        seen = self._capture_contents(monkeypatch, [LlmStep(text="확인했습니다.")])

        chat.run_turn(db_session, session_row, "학생A 월요일 근무 빼줘")

        sent = "\n".join(
            part.text or ""
            for content in seen[0]
            for part in content.parts
        )
        assert "학생A" not in sent and "20221111" not in sent
        assert "S01 월요일 근무 빼줘" in sent

    def test_stored_history_is_masked_again_on_the_next_turn(
        self, db_session, session_row, monkeypatch
    ):
        """이력은 담당자가 읽는 실명으로 저장된다 — 보낼 때마다 다시 가려야 한다."""
        db_session.add(
            models.ChatMessage(
                session_id=session_row.session_id,
                role="assistant",
                content="학생A(20221111)는 월요일 근무입니다.",
            )
        )
        db_session.commit()
        db_session.refresh(session_row)
        seen = self._capture_contents(monkeypatch, [LlmStep(text="네.")])

        chat.run_turn(db_session, session_row, "고마워")

        sent = "\n".join(
            part.text or "" for content in seen[0] for part in content.parts
        )
        assert "학생A" not in sent and "20221111" not in sent

    def test_tool_args_are_real_and_tool_results_are_masked(
        self, db_session, session_row, monkeypatch
    ):
        steps = [
            LlmStep(function_calls=[("find_schedules", {"student_name": "S01"})]),
            LlmStep(text="S01은 월요일 09:00-12:00 근무입니다."),
        ]
        self._capture_contents(monkeypatch, steps)

        text, calls, _ = chat.run_turn(db_session, session_row, "S01 근무 알려줘")

        # 툴은 실제 이름으로 조회하고, 기록에도 실제 값이 남는다(되돌리기 근거)
        assert calls[0]["args"] == {"student_name": "학생A"}
        assert calls[0]["result"]["schedules"][0]["student_id"] == "20221111"
        # 담당자에게는 이름으로 돌아온다
        assert text == "학생A은 월요일 09:00-12:00 근무입니다."

    def test_masked_result_reaches_the_model(
        self, db_session, session_row, monkeypatch
    ):
        seen = self._capture_contents(
            monkeypatch,
            [
                LlmStep(function_calls=[("find_schedules", {"student_id": "S01"})]),
                LlmStep(text="확인했습니다."),
            ],
        )

        chat.run_turn(db_session, session_row, "월요일 근무 알려줘")

        # 두 번째 스텝의 contents에 툴 결과(function_response)가 들어 있다
        responses = [
            part.function_response.response
            for content in seen[1]
            for part in (content.parts or [])
            if part.function_response is not None
        ]
        sent = json.dumps(responses, ensure_ascii=False)
        assert "20221111" not in sent and "학생A" not in sent
        assert "S01" in sent


class TestNoteSuggest:
    def test_note_text_is_masked_and_quote_is_restored(
        self, db_session, department, monkeypatch
    ):
        _hire(db_session, "20221234", "김서강")
        _hire(db_session, "20225678", "이가천", posting_id=1)
        db_session.add(
            models.AvailableTime(
                term="2026-2",
                student_id="20221234",
                day_of_week=1,
                start_time=_t("09:00"),
                end_time=_t("12:00"),
                preference=2,
            )
        )
        db_session.commit()

        captured = {}

        def _capture(contents):
            captured["prompt"] = contents
            return note_suggest.NoteSuggestResult(
                suggestions=[],
                unstructured=[
                    note_suggest.UnstructuredSentence(
                        quote="이가천이랑 같은 시간은 피하고 싶어요",
                        reason="특정 슬롯으로 옮길 수 없습니다",
                    )
                ],
            )

        monkeypatch.setattr(note_suggest, "_call_gemini_suggest", _capture)

        result = note_suggest.suggest_from_note(
            db_session,
            "20221234",
            content="이가천이랑 같은 시간은 피하고 싶어요. 010-1234-5678",
            term="2026-2",
        )

        assert "이가천" not in captured["prompt"]
        assert "010-1234-5678" not in captured["prompt"]
        # quote는 학생이 자기 문장을 알아볼 수 있게 이름으로 되돌린다
        assert result["unstructured"][0]["quote"] == "이가천이랑 같은 시간은 피하고 싶어요"
