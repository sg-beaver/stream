"""시간표 검토 챗봇 — 세션·툴 루프·읽기 툴 (#134).

설계: docs/시간표검토_챗봇_설계문서.md v3. 이 모듈은 읽기 툴 3종과 툴 루프
골격까지만 담당한다 — 쓰기 툴(draft 편집)은 #135, 가중치 조정은 #136에서
이 루프에 얹는다.

기존 review/substitute_check는 구조화 출력(response_schema)을 쓰지만, 챗봇은
이 백엔드 첫 함수 호출(tools=) 사례다. draft 근무표 전체를 프롬프트에 넣지
않고 총계만 주고 세부는 툴로 조회하게 한다 — 컨텍스트 절단으로 모델이
존재하지 않는 schedule_id를 지어내는 문제를 구조적으로 없애기 위해서다
(설계 문서 섹션 0.3).
"""

import datetime
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from google import genai
from google.genai import errors, types
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.scheduler import deidentify
from app.scheduler.session_constraints import (
    StudentUnavailable,
    parse_constraints,
    to_minutes,
)
from app.services import (
    get_department_student_ids,
    term_filter,
    term_segments,
)

logger = logging.getLogger(__name__)

# 검토(review.py)와 같은 세대로 맞춘다 (#177). 다만 실측은 검토 케이스 세트로만
# 했고 챗봇 과제로는 재지 않았다 — 이상 징후가 보이면 CHAT_MODEL로 되돌릴 수 있다.
MODEL = os.getenv("CHAT_MODEL") or "gemini-3.7-flash"  # 빈 값 주의 — review.MODEL 참고
RATE_LIMIT_RETRY_DELAY = float(os.getenv("CHAT_RETRY_DELAY", "40.0"))
# 이 챗봇은 창작이 아니라 조회·편집이다 — 같은 데이터에는 같은 답이 나와야 한다.
# 기본값(1.0)으로는 "조회부터 하라"는 지시를 간헐적으로 건너뛰고 없는 배정을
# 지어내는 것이 실사용에서 관측됐다 (#213).
TEMPERATURE = float(os.getenv("CHAT_TEMPERATURE", "0.0"))
# 턴당 툴 호출 상한 (결정 17). 읽기 1~2회 + 쓰기 1~3회 상정 — 실측 후 조정.
STEP_BUDGET = int(os.getenv("CHAT_STEP_BUDGET", "5"))
# 쓰기 툴 한 호출이 건드릴 수 있는 최대 건수 (#222). 예산(STEP_BUDGET)이 아니라
# 이 상한이 이제 "한 번에 얼마나"를 정한다. 근무표 한 주가 보통 30~50건이므로
# 20이면 "한 학생의 이번 달 근무 전부"는 덮고, "근무표를 통째로 비워라"는 덮지
# 않는다 — 되돌리기 한 번으로 감당할 수 있는 크기로 묶어 두려는 것.
MAX_EDIT_ITEMS = int(os.getenv("CHAT_MAX_EDIT_ITEMS", "20"))
# 컨텍스트에 포함할 최근 대화 메시지 수 (결정 10)
RECENT_MESSAGES = int(os.getenv("CHAT_RECENT_MESSAGES", "10"))
# 한 세션에 쌓을 수 있는 근무 불가 조건 수 (#254). 조건이 늘수록 해가 좁아져
# INFEASIBLE에 가까워지고, 컨텍스트에 싣는 목록도 길어진다 — 그 전에 담당자가
# 조건을 정리하게 만드는 상한이다
MAX_SESSION_CONSTRAINTS = int(os.getenv("CHAT_MAX_CONSTRAINTS", "10"))

SYSTEM_PROMPT = (Path(__file__).parent / "chat_system_prompt.md").read_text(
    encoding="utf-8"
)

# 페널티 카테고리의 사람용 이름 (키 어휘는 reporting_html._PENALTY_LABELS와
# 동일한 제약 이름 집합 — 표기 문구는 화면 문맥에 따라 다를 수 있다).
# 키는 반드시 **제약 이름**(Constraint.name)이어야 한다 — penalty_events의
# name, soft_weight_scales의 키(add_penalty → penalty_scale), 관리자 UI
# 슬라이더 키가 전부 이 어휘를 쓴다. soft_weights의 가중치 키(meal_missed 등)와
# 혼동하지 말 것 — 그 키로는 배율이 적용되지 않고 이벤트도 조회되지 않는다.
PENALTY_LABELS = {
    "understaffing": "최소 인원 미달",
    "preferred_staffing": "선호 인원 미충족",
    "preference_match": "희망 외 시간 배정",
    "contiguity": "근무 블록 분절",
    "meal_break": "식사 시간 미확보",
    "morning_rules": "아침 근무 규칙 위반",
    "exam_proximity": "시험 직전 배정",
    "avoid_range": "회피 요청 시간 배정",
    "non_campus_day": "비등교일 배정",
    "fair_hours": "주간 목표 시간 미달",
}


class ChatUnavailable(Exception):
    """LLM 미설정·호출 실패 — 라우터가 조용한 실패로 매핑한다."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


# ---------------------------------------------------------------------------
# 읽기 툴 — solve를 돌리지 않는다. 스텝 예산 안에서 자유 호출 (결정 16의 1층).
# 각 핸들러는 (db, session, args) → JSON 직렬화 가능한 dict를 반환하고,
# 실패는 ValueError로 던진다 — 루프가 사유를 모델에 돌려주고 턴을 계속한다.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# 배정 한 건의 인원·블록 맥락 (#195)
#
# find_schedules를 student_name으로 걸면 그 학생 행만 온다 — 같은 시간에 누가
# 더 있는지, 그 자리를 비우면 최소 인원이 깨지는지는 결과에 없었다. 그래서
# "주 상한을 넘었으니 한 시간 줄이자"류 요청에서 모델은 후보 배정을 전부 등가로
# 보고, 혼자 근무하는 토요일이나 블록을 쪼개야 하는 3시간 배정을, 다른 근무자가
# 있는 1시간짜리 블록보다 먼저 추천했다 (실제 화면에서 관측).
#
# 고친 뒤에 알려 주는 것으로는 늦다 — 최소 인원 미달은 warning이라
# _apply_edits_via_service의 new_violations(critical만)에 담기지 않는다. 그래서
# 고르기 **전에** 조회 결과에 붙인다.
# ---------------------------------------------------------------------------


def _minutes_of(t: datetime.time) -> int:
    return t.hour * 60 + t.minute


def _staffing_annotations(db: Session, session: models.ChatSession, rows: list) -> dict:
    """schedule_id → 그 배정의 인원·근무 블록 맥락.

    정책·캘린더는 솔버·검증(verify._build_context)과 같은 창구로 읽는다 —
    실제 배정에 쓰인 값과 다른 값을 근거로 설명하지 않게 하기 위해서다.
    정책 파일이 없는 부서면 빈 dict를 돌려주고 조회는 인원 정보 없이 나간다.
    """
    if not rows:
        return {}

    from app.scheduler.config import load_academic_calendar, load_department_policy
    from app.scheduler.domain import resolve_slot_staffing
    from app.scheduler.domain.calendar import OpeningHoursResolver
    from app.scheduler.service import (
        apply_department_overrides,
        resolve_policy_file_key,
    )

    dates = sorted({r.work_date for r in rows})
    try:
        policy = apply_department_overrides(
            db,
            session.department_id,
            load_department_policy(resolve_policy_file_key(db, session.department_id)),
        )
        resolver = OpeningHoursResolver(
            policy, load_academic_calendar(session.period_start.year)
        )
    except FileNotFoundError:
        logger.warning(
            "부서 %s의 정책·캘린더가 없어 인원 정보 없이 조회합니다.",
            session.department_id,
        )
        return {}

    slot_minutes = policy.slot_minutes
    # 같은 날짜의 **전원** 배정을 읽는다 — 동시 근무 인원은 조회 필터(학생·요일)와
    # 무관하게 그 슬롯에 있는 사람 전부로 세야 맞는다
    peers = (
        db.query(models.WorkSchedule)
        .filter(
            models.WorkSchedule.batch_id == session.batch_id,
            models.WorkSchedule.work_date.in_(dates),
        )
        .all()
    )
    occupancy: dict[tuple, set] = {}
    for peer in peers:
        for minute in range(
            _minutes_of(peer.start_time), _minutes_of(peer.end_time), slot_minutes
        ):
            occupancy.setdefault((peer.work_date, minute), set()).add(peer.student_id)
    names = _student_names(db, {p.student_id for p in peers})
    day_blocks = {day: resolver.resolve_work_blocks(day) for day in dates}

    annotations = {}
    for row in rows:
        start, end = _minutes_of(row.start_time), _minutes_of(row.end_time)
        headcounts, requirements, coworkers = [], [], set()
        understaffed_if_removed = False
        for minute in range(start, end, slot_minutes):
            assigned = occupancy.get((row.work_date, minute), set())
            others = assigned - {row.student_id}
            min_required, _max_per_slot = resolve_slot_staffing(
                day_blocks.get(row.work_date, []), policy.staffing, minute
            )
            headcounts.append(len(assigned))
            requirements.append(min_required)
            coworkers |= others
            if min_required > 0 and len(others) < min_required:
                understaffed_if_removed = True
        blocks = [
            b
            for b in day_blocks.get(row.work_date, [])
            if b.start_min < end and b.end_min > start
        ]
        annotations[row.schedule_id] = {
            "hours": round((end - start) / 60, 2),
            # 슬롯마다 인원이 다르면 가장 빈 슬롯 기준으로 답한다 — 이 배정을 빼도
            # 되는지는 사람이 제일 적은 순간이 정한다
            "headcount": min(headcounts) if headcounts else 0,
            "min_required": max(requirements) if requirements else 0,
            "coworkers": sorted(names.get(sid, sid) for sid in coworkers),
            "understaffed_if_removed": understaffed_if_removed,
            # 부서 정의 근무 블록 (#89). 배정이 블록 경계에 맞아떨어지면
            # block_aligned=true — 경계를 벗어나게 줄이면 블록이 쪼개진다
            "work_blocks": [
                f"{_hhmm(b.start_min)}-{_hhmm(b.end_min)}" for b in blocks
            ],
            "block_aligned": bool(blocks)
            and blocks[0].start_min == start
            and blocks[-1].end_min == end,
        }
    return annotations


_FIND_SCHEDULES_ARGS = frozenset(
    {"student_name", "student_id", "weekday", "work_date", "date_from", "date_to"}
)


# ---------------------------------------------------------------------------
# 재원별 근로시간 합계 (#260)
#
# 조회 결과에 재원 구분도 합계도 없어서, 모델이 "2주 교비 총 시간"을 물으면
# 60건을 눈으로 더한 뒤 교비·국가를 섞어 답했다 — 실제 교비 185.5h짜리 근무표를
# 214h(부서 전체)로 답하고 교비 상한 190h와 비교해 "24시간 초과"라고 결론냈다.
# 2주 총합 상한(HC-TIME-4)은 교비만 대상이라, 재원을 못 가르면 이 질문에는
# 구조적으로 옳게 답할 수 없다. day·headcount를 서버가 붙이는 것과 같은 이유로
# (모델이 계산하면 틀린다, #213) 합계도 서버가 계산해 넘긴다.
# ---------------------------------------------------------------------------

_FUNDING_TYPES = ("gyobi", "gukga")
# 비었거나 모르는 값이면 상한이 더 낮은 교비로 폴백 — 솔버(service._DEFAULT_FUNDING_TYPE)와
# 같은 규칙이다. 여기서만 다르게 처리하면 챗봇이 말하는 재원과 실제 배정에 쓰인 재원이 갈린다.
_FUNDING_FALLBACK = "gyobi"


def _funding_by_student(db: Session, student_ids) -> dict:
    """학번 → 재원 구분(gyobi/gukga)."""
    ids = {sid for sid in student_ids if sid}
    if not ids:
        return {}
    rows = db.query(models.Student.student_id, models.Student.funding_type).filter(
        models.Student.student_id.in_(ids)
    )
    return {
        r.student_id: (
            r.funding_type if r.funding_type in _FUNDING_TYPES else _FUNDING_FALLBACK
        )
        for r in rows
    }


def _row_hours(row) -> float:
    return (_minutes_of(row.end_time) - _minutes_of(row.start_time)) / 60


def _gyobi_biweekly_limit(db: Session, department_id: int) -> float | None:
    """부서에 적용되는 2주 교비 총합 상한 (HC-TIME-4). 정책 파일이 없으면 None."""
    from app.scheduler.config import load_department_policy
    from app.scheduler.service import (
        apply_department_overrides,
        resolve_policy_file_key,
    )

    try:
        policy = apply_department_overrides(
            db,
            department_id,
            load_department_policy(resolve_policy_file_key(db, department_id)),
        )
    except FileNotFoundError:
        return None
    return float(policy.hour_limits.gyobi_biweekly_dept_total_max_hours)


def _batch_hour_totals(db: Session, session: models.ChatSession) -> dict:
    """배치 전체의 재원별·주차별 근로시간 합계 — 조회 필터와 무관하다.

    필터를 걸어 조회해도 이 값은 배치 전체 기준이다. 부분 합계를 부서 상한과
    비교하는 것이 정확히 이 툴이 틀렸던 방식이라, 상한과 나란히 놓을 수 있는
    값은 처음부터 전체 기준 하나만 준다.

    주차는 기간 시작일부터 7일씩 끊는다 — 화면의 주차 구분(splitWeeks)·
    get_period_calendar의 weeks와 같은 기준이어야 담당자가 보는 표와 맞는다.
    """
    rows = (
        db.query(models.WorkSchedule)
        .filter(models.WorkSchedule.batch_id == session.batch_id)
        .all()
    )
    funding = _funding_by_student(db, {r.student_id for r in rows})
    weeks: dict = {}
    totals = {"hours": 0.0, "gyobi_hours": 0.0, "gukga_hours": 0.0, "count": 0}
    for row in rows:
        index = max(0, (row.work_date - session.period_start).days) // 7
        bucket = weeks.setdefault(
            index,
            {
                "week": index + 1,
                "start": (
                    session.period_start + datetime.timedelta(days=index * 7)
                ).isoformat(),
                "hours": 0.0,
                "gyobi_hours": 0.0,
                "gukga_hours": 0.0,
                "count": 0,
            },
        )
        hours = _row_hours(row)
        key = f"{funding.get(row.student_id, _FUNDING_FALLBACK)}_hours"
        for target in (totals, bucket):
            target["hours"] += hours
            target[key] += hours
            target["count"] += 1
    limit = _gyobi_biweekly_limit(db, session.department_id)
    return {
        "period_start": session.period_start.isoformat(),
        "period_end": session.period_end.isoformat(),
        **{
            k: (round(v, 2) if isinstance(v, float) else v) for k, v in totals.items()
        },
        "gyobi_biweekly_limit_hours": limit,
        "by_week": [
            {
                k: (round(v, 2) if isinstance(v, float) else v)
                for k, v in weeks[i].items()
            }
            for i in sorted(weeks)
        ],
    }


def _tool_find_schedules(
    db: Session, session: models.ChatSession, args: dict
) -> dict:
    """세션의 현재 draft 배치에서 조건에 맞는 배정을 조회한다.

    담당자는 학번이 아니라 이름으로 말한다("조수현 학생 월요일 근무") — 그래서
    student_name 필터를 받고 결과에도 이름을 함께 담는다. 이게 없으면 모델이
    이름↔학번을 알 방법이 없어 학번을 하나씩 찍어보다 스텝 예산을 소진한다
    (실제 화면 검증에서 관측된 실패, #137).
    """
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")
    # 모르는 필터는 조용히 무시하지 않는다 (#213). 무시하면 결과가 필터 없이
    # 넓어지는데, 모델은 자기가 건 조건대로 걸러진 줄 알고 그 배정들을 "그 조건의
    # 근무"라고 설명한다 — 없는 요일 근무를 지어내는 경로가 정확히 이것이다.
    unknown = set(args) - _FIND_SCHEDULES_ARGS
    if unknown:
        raise ValueError(
            f"모르는 인자입니다: {', '.join(sorted(unknown))}."
            f" 사용 가능한 인자는 {', '.join(sorted(_FIND_SCHEDULES_ARGS))}뿐입니다."
        )
    query = db.query(models.WorkSchedule).filter(
        models.WorkSchedule.batch_id == session.batch_id
    )
    if args.get("student_name"):
        name = args["student_name"].strip()
        ids = [
            s.student_id
            for s in db.query(models.Student).filter(models.Student.name == name)
        ]
        if not ids:
            raise ValueError(f"이름이 '{name}'인 학생을 찾을 수 없습니다.")
        query = query.filter(models.WorkSchedule.student_id.in_(ids))
    if args.get("student_id"):
        query = query.filter(models.WorkSchedule.student_id == args["student_id"])
    weekday = _parse_weekday(args.get("weekday"))
    if args.get("work_date"):
        query = query.filter(
            models.WorkSchedule.work_date == datetime.date.fromisoformat(args["work_date"])
        )
    if args.get("date_from"):
        query = query.filter(
            models.WorkSchedule.work_date >= datetime.date.fromisoformat(args["date_from"])
        )
    if args.get("date_to"):
        query = query.filter(
            models.WorkSchedule.work_date <= datetime.date.fromisoformat(args["date_to"])
        )
    rows = query.order_by(
        models.WorkSchedule.work_date, models.WorkSchedule.start_time
    ).all()
    if weekday is not None:
        rows = [r for r in rows if r.work_date.isoweekday() == weekday]
    names = {
        s.student_id: s.name
        for s in db.query(models.Student).filter(
            models.Student.student_id.in_([r.student_id for r in rows] or [""])
        )
    }
    # 인원·블록 맥락은 서버가 붙인다 (#195) — 이 필터로는 같은 시간대의 다른
    # 근무자가 결과에 없어, 모델이 "빼도 되는 자리"를 고를 근거가 없다
    staffing = _staffing_annotations(db, session, rows)
    funding = _funding_by_student(db, {r.student_id for r in rows})
    return {
        "count": len(rows),
        # 조회 결과의 시간 합계 — 몇 건이든 모델이 직접 더하지 않게 한다
        "result_hours": round(sum(_row_hours(r) for r in rows), 2),
        # 재원별·주차별 합계는 배치 전체 기준이다 (필터와 무관, #260)
        "batch_totals": _batch_hour_totals(db, session),
        "schedules": [
            {
                "schedule_id": r.schedule_id,
                "student_id": r.student_id,
                "student_name": names.get(r.student_id, r.student_id),
                # 재원 구분 — 근로시간 상한이 재원마다 다르고, 2주 총합 상한은
                # 교비만 대상이다. 이게 없으면 모델이 재원을 섞어 답한다 (#260)
                "funding_type": funding.get(r.student_id, _FUNDING_FALLBACK),
                "work_date": r.work_date.isoformat(),
                # 요일은 서버가 붙인다 — 담당자는 요일로 말하는데(#213) 날짜만
                # 주면 모델이 날짜→요일을 스스로 계산하다 틀린다.
                "day": _DAY_NAMES.get(r.work_date.isoweekday()),
                "start_time": r.start_time.strftime("%H:%M"),
                "end_time": r.end_time.strftime("%H:%M"),
                **staffing.get(r.schedule_id, {}),
            }
            for r in rows
        ],
    }


def _tool_explain_penalty(
    db: Session, session: models.ChatSession, args: dict
) -> dict:
    """그 카테고리의 실제 위반 이벤트(학생·날짜·시각·비용)를 반환한다 (결정 18).

    generate가 solver_summary.penalty_events로 저장한 이벤트를 읽는다 —
    solve를 다시 돌리지 않으므로 싸고 빠르다.
    """
    category = args.get("category", "")
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")
    batch = (
        db.query(models.ScheduleBatch)
        .filter(models.ScheduleBatch.batch_id == session.batch_id)
        .first()
    )
    summary = (batch.solver_summary or {}) if batch else {}
    events = [
        ev for ev in summary.get("penalty_events", []) if ev.get("name") == category
    ]
    if not events and category not in summary.get("penalty_summary", {}):
        return {
            "category": category,
            "label": PENALTY_LABELS.get(category, category),
            "events": [],
            "note": "이 카테고리의 위반이 현재 근무표에 없습니다.",
        }
    # 이벤트에 학생 이름을 붙인다 — 담당자에게 학번만 말하면 알아듣기 어렵다
    names = {
        s.student_id: s.name
        for s in db.query(models.Student).filter(
            models.Student.student_id.in_(
                [ev.get("student_id") for ev in events if ev.get("student_id")] or [""]
            )
        )
    }
    return {
        "category": category,
        "label": PENALTY_LABELS.get(category, category),
        "total_cost": sum(ev.get("cost", 0) for ev in events),
        "events": [
            {**ev, "student_name": names.get(ev.get("student_id"))} for ev in events
        ],
    }


_DAY_NAMES = {1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토", 7: "일"}
_DAY_NUMBERS = {name: num for num, name in _DAY_NAMES.items()}


def _parse_weekday(value) -> Optional[int]:
    """요일 인자를 isoweekday(월=1)로 바꾼다. 없으면 None, 못 읽으면 ValueError.

    담당자 발화는 "이화정 수요일 근무 다 빼줘"처럼 요일 단위인데 배정은 날짜로만
    저장된다. 모델이 그 변환을 스스로 하면 간헐적으로 틀려, 없는 요일 근무를
    "삭제했다"고 지어내는 데까지 간다 (#213). 변환은 서버가 한다.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("요일"):
        text = text[:-2]
    if text in _DAY_NUMBERS:
        return _DAY_NUMBERS[text]
    raise ValueError(
        f"요일을 알 수 없습니다: '{value}'. 월·화·수·목·금·토·일 중 하나로 지정하세요."
    )


def _exception_applies(exception_type: str, availability_mode: str) -> bool:
    """부서 정책이 그 날짜별 예외를 실제 배정에 반영하는지.

    loader.availability.materialize_availability와 같은 판정이다 — 거기서
    걸러지는 예외를 여기서 그냥 보여주면, 모델이 솔버가 보지도 않은 행을
    근거로 "이 날은 불가 신고가 있어서 뺐다"고 설명하게 된다. 모르는 모드는
    materialize_availability처럼 weekly_only로 fail-closed 처리한다.
    """
    if exception_type == "UNAVAILABLE":
        return availability_mode in ("weekly_with_unavailable", "weekly_with_exceptions")
    if exception_type == "AVAILABLE":
        return availability_mode == "weekly_with_exceptions"
    return False


def _exceptions_note(exceptions: list[dict], availability_mode: str) -> str:
    """예외 목록을 어떻게 읽어야 하는지 한 줄 — 없음/무시됨/반영됨을 구분한다."""
    if not exceptions:
        return (
            "이 기간에 이 학생이 낸 날짜별 예외가 없다 —"
            " 요일 반복 시간표가 기간 내내 그대로 적용된다."
            " (학사 캘린더의 휴일·폐관일은 별개다: get_period_calendar로 확인하라.)"
        )
    if not any(e["applied"] for e in exceptions):
        return (
            f"이 부서의 가능시간 정책은 '{availability_mode}'라 아래 예외는"
            " 배정에 반영되지 않는다 — 학생이 신고는 했지만 솔버는 보지 않았다."
        )
    return (
        "applied=true인 예외만 배정에 반영된다."
        " 그 날짜의 가능 시간은 같은 요일의 반복 시간표와 다르다."
    )


def _tool_get_student_availability(
    db: Session, session: models.ChatSession, args: dict
) -> dict:
    """그 학생의 요일 반복 시간표 + 세션 기간 안의 날짜별 예외.

    세션 부서 소속 학생만 조회할 수 있다 — 다른 툴은 batch_id로 스코프가
    걸리지만 이 툴은 학번 직접 조회라, 부서 검증이 없으면 타부서 학생의
    시간표가 대화로 유출된다 (REQ-SCHED-002/007과 같은 부서 경계).

    요일 반복만 돌려주던 때는 모델이 볼 수 있는 창이 요일 표 하나뿐이라,
    "주차별 입력이 완전히 같다"처럼 확인하지 않은 것을 단정했다. 솔버는
    AvailabilityException을 날짜 단위로 반영하므로(service._load_students)
    같은 요일도 주차마다 다를 수 있다 — 그 근거를 같은 툴에서 함께 준다.
    학사 캘린더(휴일·폐관일)는 학생별 데이터가 아니라 get_period_calendar가 맡는다.
    """
    student_id = args.get("student_id", "")
    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == student_id)
        .first()
    )
    if student is None:
        raise ValueError(f"학생 {student_id}을(를) 찾을 수 없습니다.")
    if student_id not in get_department_student_ids(db, session.department_id):
        raise ValueError(f"학생 {student_id}은(는) 이 부서 소속이 아닙니다.")

    # 기간이 학기 경계를 넘으면 날짜마다 읽을 학기가 달라진다 — 시작일 학기
    # 하나만 보면 다음 학기 주차의 시간표가 통째로 빠진다 (#156의 솔버 규칙,
    # _student_notes_lines와 같은 처리).
    segments = term_segments(session.period_start, session.period_end)
    term_keys = list(dict.fromkeys(t for t, _, _ in segments))

    def _rows(model):
        return (
            db.query(model)
            .filter(
                model.student_id == student_id,
                or_(*[term_filter(model.term, t) for t in term_keys]),
            )
            .order_by(model.day_of_week, model.start_time)
            .all()
        )

    policy_row = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == session.department_id)
        .first()
    )
    mode = policy_row.availability_mode if policy_row else "weekly_only"

    exception_rows = (
        db.query(models.AvailabilityException)
        .filter(
            models.AvailabilityException.student_id == student_id,
            models.AvailabilityException.exception_date >= session.period_start,
            models.AvailabilityException.exception_date <= session.period_end,
        )
        .order_by(
            models.AvailabilityException.exception_date,
            models.AvailabilityException.start_time,
        )
        .all()
    )
    exceptions = [
        {
            "date": r.exception_date.isoformat(),
            "day": _DAY_NAMES.get(r.exception_date.isoweekday()),
            "type": r.exception_type,
            "all_day": r.start_time is None and r.end_time is None,
            "start_time": r.start_time.strftime("%H:%M") if r.start_time else None,
            "end_time": r.end_time.strftime("%H:%M") if r.end_time else None,
            "preference": r.preference,
            "applied": _exception_applies(r.exception_type, mode),
        }
        for r in exception_rows
    ]

    return {
        "student_id": student_id,
        "student_name": student.name,
        "term": term_keys[0] if term_keys else None,
        "terms": [
            {"term": t, "start": s.isoformat(), "end": e.isoformat()}
            for t, s, e in segments
        ],
        "period": {
            "start": session.period_start.isoformat(),
            "end": session.period_end.isoformat(),
        },
        "available_times": [
            {
                "term": r.term,
                "day": _DAY_NAMES.get(r.day_of_week, str(r.day_of_week)),
                "start_time": r.start_time.strftime("%H:%M"),
                "end_time": r.end_time.strftime("%H:%M"),
                "preference": r.preference,
            }
            for r in _rows(models.AvailableTime)
        ],
        "class_times": [
            {
                "term": r.term,
                "day": _DAY_NAMES.get(r.day_of_week, str(r.day_of_week)),
                "start_time": r.start_time.strftime("%H:%M"),
                "end_time": r.end_time.strftime("%H:%M"),
            }
            for r in _rows(models.ClassTime)
        ],
        "availability_mode": mode,
        "availability_exceptions": exceptions,
        "availability_exceptions_note": _exceptions_note(exceptions, mode),
    }


# 기간이 길면 날짜를 하나씩 담지 않고 특이일만 담는다 — 주차 비교에 필요한 것은
# 주차 요약이고, 평범한 날 60개는 컨텍스트만 먹는다.
CALENDAR_DAY_LIMIT = int(os.getenv("CHAT_CALENDAR_DAY_LIMIT", "45"))


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _tool_get_period_calendar(
    db: Session, session: models.ChatSession, args: dict
) -> dict:
    """세션 기간의 날짜별 학사 일정 — 공휴일·교내 휴강일·폐관일·시험 기간·개관 시간.

    솔버는 이 캘린더를 날짜 단위로 적용한다(OpeningHoursResolver) — 폐관일은
    배정이 0건이고 학기 중 공휴일·교내 휴강일은 단축 개관이다. 그래서 같은
    요일이라도 주차마다 배정 가능한 시간이 다르다. 이 창이 없으면 모델은
    요일 반복 표만 보고 "주차별 조건이 같다"고 단정하게 된다.

    캘린더·정책은 솔버·검증(verify._build_context)과 같은 창구로 읽는다 —
    실제 배정에 쓰인 값과 다른 값을 근거로 설명하지 않게 하기 위해서다.
    """
    from app.scheduler.config import load_academic_calendar, load_department_policy
    from app.scheduler.domain import OpeningHoursResolver, PeriodType
    from app.scheduler.service import (
        apply_department_overrides,
        resolve_policy_file_key,
    )

    start, end = session.period_start, session.period_end
    if args.get("date_from"):
        start = max(start, datetime.date.fromisoformat(args["date_from"]))
    if args.get("date_to"):
        end = min(end, datetime.date.fromisoformat(args["date_to"]))
    if start > end:
        raise ValueError(
            f"조회 범위가 세션 기간({session.period_start.isoformat()}~"
            f"{session.period_end.isoformat()}) 밖입니다."
        )

    # 솔버와 같은 규칙 — 기간 시작 연도의 캘린더 파일 하나로 기간 전체를 본다
    year = session.period_start.year
    try:
        calendar = load_academic_calendar(year)
    except FileNotFoundError:
        raise ValueError(f"{year}년 학사 캘린더가 없어 날짜별 일정을 조회할 수 없습니다.")

    try:
        resolver = OpeningHoursResolver(
            apply_department_overrides(
                db,
                session.department_id,
                load_department_policy(resolve_policy_file_key(db, session.department_id)),
            ),
            calendar,
        )
    except FileNotFoundError:
        # 정책 파일이 없는 부서 — 개관 시간은 모른다고 두고 학사 일정만 답한다
        resolver = None

    days = []
    day = start
    while day <= end:
        open_ranges = resolver.resolve(day) if resolver else None
        notes = []
        if calendar.is_closed(day):
            notes.append("폐관일")
        if calendar.is_public_holiday(day):
            notes.append("공휴일")
        if calendar.is_school_only_holiday(day):
            notes.append("교내 휴강일")
        if calendar.is_exam_period(day):
            notes.append("시험 기간")
        if calendar.is_exam_extended_weekend(day):
            notes.append("시험 기간 연장 주말")
        term = calendar.term_for(day)
        days.append(
            {
                "date": day.isoformat(),
                "day": _DAY_NAMES.get(day.isoweekday()),
                "week": (day - start).days // 7 + 1,
                "period_type": (
                    "학기 중"
                    if calendar.period_type(day) == PeriodType.SEMESTER
                    else "방학 중"
                ),
                "term": term.key if term else None,
                "notes": notes,
                "department_open": None if open_ranges is None else bool(open_ranges),
                "open_hours": (
                    None
                    if open_ranges is None
                    else [f"{_hhmm(s)}-{_hhmm(e)}" for s, e in open_ranges]
                ),
            }
        )
        day += datetime.timedelta(days=1)

    by_week: dict[int, list[dict]] = {}
    for entry in days:
        by_week.setdefault(entry["week"], []).append(entry)

    weeks = [
        {
            "week": index,
            "start": week_days[0]["date"],
            "end": week_days[-1]["date"],
            "open_days": (
                None
                if resolver is None
                else sum(1 for d in week_days if d["department_open"])
            ),
            "special_days": [
                f"{d['date']}({d['day']}) {', '.join(d['notes'])}"
                for d in week_days
                if d["notes"]
            ],
        }
        for index, week_days in sorted(by_week.items())
    ]

    truncated = len(days) > CALENDAR_DAY_LIMIT
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "calendar_year": year,
        "weeks": weeks,
        "days": [d for d in days if d["notes"]] if truncated else days,
        "days_note": (
            f"기간이 {len(days)}일이라 특이일만 담았다 — 주차별 비교는 weeks를 보라."
            if truncated
            else None
        ),
        "note": (
            "week는 기간 시작일부터 7일씩 끊은 주차다."
            " special_days가 비어 있는 주차는 학사 캘린더상 특이일이 없다는 뜻이며,"
            " 학생별 날짜 예외까지 같다는 뜻은 아니다 —"
            " 그건 get_student_availability로 따로 확인하라."
        ),
    }


# ---------------------------------------------------------------------------
# 제약 검증 (#195) — LLM 없이 결정적으로 채점하는 verify_batch를 챗봇에 연결한다.
#
# 챗봇의 쓰기 툴은 apply_draft_edit를 거치는데, 거기서 보는 것은 겹침·개관 시간
# (HC-OPEN)·주간 상한(HC-TIME-1/2 + 부서 운영 상한)뿐이다 — 개관 시간은 #216에서
# app/opening_hours.py를 공용으로 빼면서 이 경로에도 붙었다(되돌리기만
# skip_policy_checks=True로 개관 시간·주간 상한을 건너뛴다). 가능 시간
# (HC-CLASS-1)·활동 기간(HC-CLASS-6)·슬롯 인원(HC-STAFF-1/2)·국가근로 월 상한
# (HC-TIME-3)·부서 교비 2주 총합(HC-TIME-4)은 그대로 통과한다 — 즉 대화로 고친
# draft가 규정을 어겨도 아무도 막지 않았다. verify_batch는 솔버와 같은 로더로 다시
# 채점하므로 그 구멍을 그대로 덮는다. 실측 25~37ms(2주·55행)라 편집마다 돌려도 된다.
# ---------------------------------------------------------------------------

# 툴 결과에 담는 위반 최대 건수 — 컨텍스트를 잡아먹지 않게 자르고 나머지는 수만 알린다.
VIOLATION_LIMIT = int(os.getenv("CHAT_VIOLATION_LIMIT", "10"))


def _violation_key(v: dict) -> tuple:
    """같은 위반인지 가리는 키 — 편집 전후 비교용. message는 문구가 흔들릴 수
    있어 넣지 않고, 무엇이 어디서 깨졌는지만 본다."""
    return (v["rule"], v["severity"], v["student_id"], v["date"], v["start_time"], v["end_time"])


def _student_names(db: Session, student_ids) -> dict:
    ids = {sid for sid in student_ids if sid}
    if not ids:
        return {}
    return {
        s.student_id: s.name
        for s in db.query(models.Student).filter(models.Student.student_id.in_(ids)).all()
    }


def _format_violations(db: Session, violations: list, limit: int = VIOLATION_LIMIT) -> dict:
    """위반 목록을 모델이 사람 말로 옮기기 쉬운 형태로 줄인다.

    담당자는 학번이 아니라 이름으로 말하므로(시스템 프롬프트 원칙) 이름을 함께 담는다.
    critical을 먼저 담아, 잘릴 때 남는 쪽이 덜 중요한 것이 되게 한다.
    """
    ordered = sorted(violations, key=lambda v: 0 if v["severity"] == "critical" else 1)
    names = _student_names(db, (v["student_id"] for v in ordered[:limit]))
    items = []
    for v in ordered[:limit]:
        when = v["date"] or ""
        if v["start_time"]:
            when = f"{when} {v['start_time']}-{v['end_time']}".strip()
        items.append(
            {
                "rule": v["rule"],
                "severity": v["severity"],
                "student": (
                    f"{names.get(v['student_id'], '')}({v['student_id']})".lstrip("(")
                    if v["student_id"]
                    else None
                ),
                "when": when or None,
                "message": v["message"],
            }
        )
    return {
        "critical_count": sum(1 for v in violations if v["severity"] == "critical"),
        "warning_count": sum(1 for v in violations if v["severity"] != "critical"),
        "violations": items,
        "omitted": max(0, len(violations) - limit),
    }


def _verify_violations(db: Session, batch_id: Optional[int]) -> list:
    """현재 draft의 hard 제약 위반 목록. 검증이 불가능하면 빈 목록."""
    if batch_id is None:
        return []
    from app.scheduler.verify import BatchNotFound, verify_batch

    try:
        return verify_batch(db, batch_id)["violations"]
    except BatchNotFound:
        return []
    except Exception:
        # 검증 실패가 편집 자체를 막지는 않는다 — 편집은 이미 적용됐고,
        # 여기서 예외를 올리면 성공한 쓰기가 실패로 보고된다.
        logger.exception("batch %s 제약 검증 실패", batch_id)
        return []


def _tool_verify_schedule(db: Session, session: models.ChatSession, args: dict) -> dict:
    """현재 draft가 SPEC 3장 Hard Constraint를 지키는지 결정적으로 채점한다."""
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")
    violations = _verify_violations(db, session.batch_id)
    return {
        "ok": not any(v["severity"] == "critical" for v in violations),
        **_format_violations(db, violations),
    }


READ_TOOL_HANDLERS: dict[str, Callable[[Session, models.ChatSession, dict], dict]] = {
    "find_schedules": _tool_find_schedules,
    "explain_penalty": _tool_explain_penalty,
    "get_student_availability": _tool_get_student_availability,
    "get_period_calendar": _tool_get_period_calendar,
    "verify_schedule": _tool_verify_schedule,
}


# ---------------------------------------------------------------------------
# 쓰기 툴 — draft 배치만 고친다 (#135, 결정 4·5). 검증·적용·역연산 생성은
# 전부 #133의 apply_draft_edit(REQ-SCHED-018 서비스 계층)를 재사용한다.
# 각 핸들러는 (result, inverses)를 반환하고, inverses는 tool_calls에 기록되어
# 턴 되돌리기(revert)가 역순으로 다시 적용한다.
#
# 호출 하나가 여러 건을 고친다 (#222). 툴이 1건씩만 받던 때는 "다 빼줘"류 요청이
# 턴당 툴 호출 예산(STEP_BUDGET)에 걸려 앞 몇 건만 지워진 채 끝났다 — 다건화의
# 이유가 그것이므로, 다건 호출은 전부 적용되거나 전부 적용되지 않아야 한다.
# ---------------------------------------------------------------------------


def _acting_user(db: Session, session: models.ChatSession):
    """쓰기 툴의 행위자 — 세션을 연 사람. 라우터가 세션 소유권을 이미 강제하므로
    (schedule_chat._get_own_session), 여기서는 그 사람으로 부서 권한을 검사한다.

    직원일 수도, 학생팀장일 수도 있다 (#156). 역할을 세션에 따로 저장하지 않고
    staff 테이블 조회로 판정한다 — 학번과 직원 ID는 형식이 겹치지 않는다.
    """
    from app import auth

    is_staff = (
        db.query(models.Staff).filter(models.Staff.staff_id == session.created_by).first()
        is not None
    )
    return auth.CurrentUser(id=session.created_by, role="staff" if is_staff else "student")


def _check_edit_scope(db: Session, session: models.ChatSession, item) -> None:
    """편집 1건이 세션의 현재 draft 안에 있는지 확인한다.

    apply_draft_edit는 "본인 부서의 draft"까지만 검사하므로, 같은 부서에 draft가
    여럿이면 세션이 보지 않는 배치의 schedule_id도 통과한다. 챗봇의 편집은
    add·move·remove 모두 세션의 현재 draft 안에서만 일어나야 한다
    (읽기 툴 스코프와 대칭).
    """
    if item.op in ("move", "remove") and item.schedule_id is not None:
        row = (
            db.query(models.WorkSchedule)
            .filter(models.WorkSchedule.schedule_id == item.schedule_id)
            .first()
        )
        # 없는 id는 apply_draft_edit가 404 사유로 처리하게 넘긴다
        if row is not None and row.batch_id != session.batch_id:
            raise ValueError(
                "이 세션이 검토 중인 draft 밖의 배정입니다."
                " find_schedules로 확인한 배정만 편집할 수 있습니다."
            )
    elif item.op == "add" and item.batch_id != session.batch_id:
        raise ValueError(
            "이 세션이 검토 중인 draft에만 추가할 수 있습니다."
        )


class _EditItemFailed(Exception):
    """다건 편집 중 한 건이 실패했다 — SAVEPOINT를 되감기 위한 내부 신호.

    사람이 읽을 문구로 바로 변환된다: 모델에 돌아가는 것은 이 문자열뿐이라
    "몇 번째가 왜 실패했고 아무것도 적용되지 않았다"가 한 문장에 있어야 한다.
    """

    def __init__(self, index: int, total: int, item, reason: str):
        where = f"{total}건 중 {index + 1}번째"
        target = (
            f"배정 {item.schedule_id}"
            if item.schedule_id is not None
            else f"{item.work_date} {item.start_time}"
        )
        super().__init__(
            f"{where}({target})에서 실패해 이번 요청은 하나도 적용하지 않았습니다:"
            f" {reason}"
        )


def _apply_edits_via_service(
    db: Session,
    session: models.ChatSession,
    item_kwargs_list: list[dict],
    skip_policy_checks: bool = False,
) -> tuple[dict, list[dict]]:
    """편집 여러 건을 한 덩어리로 적용하고 (result, inverses)를 돌려준다.

    **호출 하나가 전부 적용되거나 전부 적용되지 않는다 (#222).** 한 건이라도
    실패하면 SAVEPOINT를 되감아 이 호출이 손댄 것을 전부 원복하고 ValueError를
    던진다 — 담당자가 "다 빼줘"라고 했는데 앞 몇 건만 지워진 상태로 남는 것을
    막는 것이 이 툴을 다건화한 이유이기 때문이다. 되감기는 DB 수준이라 살아남은
    배정의 schedule_id도 그대로다(역연산 재적용 방식과 달리).

    되감아도 이 턴의 **앞선** 툴 호출과 사용자 메시지는 남는다 — SAVEPOINT는
    이 함수가 연 지점까지만 되돌리고, 바깥 트랜잭션은 라우터가 커밋한다.

    위반 채점(_verify_violations)은 배치당 한 번씩만 한다 — 건마다 두 번씩
    돌리면 N건 편집에 2N번 채점이 돌아 다건 처리의 이점이 사라진다.
    """
    from fastapi import HTTPException  # apply_draft_edit의 검증 실패(400/404)
    from app import schemas
    from app.routers.schedule import apply_draft_edit

    items = [schemas.DraftEditItem(**kwargs) for kwargs in item_kwargs_list]
    for item in items:
        _check_edit_scope(db, session, item)

    # 편집 전 위반을 먼저 찍어 둔다 — 원래 있던 위반과 이번 편집이 만든 위반을
    # 가르기 위해서다. 모델이 verify를 부를지에 기대지 않고 항상 알려준다.
    before = {
        _violation_key(v)
        for v in _verify_violations(db, session.batch_id)
        if v["severity"] == "critical"
    }

    applied_rows = []
    inverses: list[dict] = []
    try:
        with db.begin_nested():
            for index, item in enumerate(items):
                try:
                    applied = apply_draft_edit(
                        db,
                        _acting_user(db, session),
                        item,
                        skip_policy_checks=skip_policy_checks,
                    )
                except HTTPException as e:
                    raise _EditItemFailed(index, len(items), item, str(e.detail))
                except ValueError as e:
                    raise _EditItemFailed(index, len(items), item, str(e))
                applied_rows.append(applied)
                inverses.append(applied.inverse.model_dump(mode="json", exclude_none=True))
    except _EditItemFailed as e:
        # SAVEPOINT가 이미 되감겼다 — 적용된 것이 없으므로 역연산도 남기지 않는다
        raise ValueError(str(e)) from None

    names = {
        s.student_id: s.name
        for s in db.query(models.Student).filter(
            models.Student.student_id.in_({a.student_id for a in applied_rows})
        )
    }
    result: dict = {
        "ok": True,
        "applied_count": len(applied_rows),
        "applied": [
            {
                "schedule_id": a.schedule_id,
                "student_id": a.student_id,
                "student_name": names.get(a.student_id, a.student_id),
                "work_date": a.work_date.isoformat(),
                # 요일은 서버가 붙인다 (#213) — 모델이 날짜→요일을 계산하면 틀린다
                "day": _DAY_NAMES.get(a.work_date.isoweekday()),
                "start_time": a.start_time.strftime("%H:%M"),
                "end_time": a.end_time.strftime("%H:%M"),
            }
            for a in applied_rows
        ],
    }

    # apply_draft_edit가 보는 것은 겹침·개관 시간·주간 상한뿐이다. 나머지 hard
    # 제약(HC-CLASS-1/6·HC-STAFF-1/2·HC-TIME-3/4)은 여기서 채점해, 이번 편집이
    # 새로 만든 위반만 결과에 얹는다.
    #
    # critical만 본다 — 최소 인원 미달(warning)은 근무를 옮기면 거의 항상 자리가
    # 바뀌어 "새 위반"으로 잡힌다. 매 편집마다 경고가 딸려 오면 진짜 규정 위반이
    # 묻히고 컨텍스트만 먹는다. 인원 부족은 explain_penalty와 verify_schedule로
    # 따로 볼 수 있다.
    new_violations = [
        v
        for v in _verify_violations(db, session.batch_id)
        if v["severity"] == "critical" and _violation_key(v) not in before
    ]
    if new_violations:
        result["new_violations"] = _format_violations(db, new_violations)

    return result, inverses


def _apply_edit_via_service(
    db: Session,
    session: models.ChatSession,
    item_kwargs: dict,
    skip_policy_checks: bool = False,
) -> tuple[dict, dict]:
    """편집 1건 — 되돌리기(revert_turn)가 역연산을 하나씩 재적용할 때 쓴다."""
    result, inverses = _apply_edits_via_service(
        db, session, [item_kwargs], skip_policy_checks=skip_policy_checks
    )
    return result, inverses[0]


def _edit_targets(args: dict, plural_key: str, singular_key: str) -> list:
    """쓰기 툴의 대상 목록을 꺼낸다 — 배열 인자를 쓰되 단수도 받아 준다.

    단수를 받는 이유는 관용이 아니라 회귀 방지다. 툴이 다건이 된 뒤에도 모델은
    학습된 형태대로 `schedule_id` 하나를 보낼 때가 있는데, 그때 "모르는 인자"로
    막으면 예산만 태우고 아무것도 못 고친다.
    """
    values = args.get(plural_key)
    if values is None and args.get(singular_key) is not None:
        values = [args[singular_key]]
    if values is None:
        raise ValueError(f"{plural_key}가 필요합니다.")
    if not isinstance(values, (list, tuple)):
        values = [values]
    # 중복은 조용히 접는다 — 같은 배정을 두 번 지우려 하면 두 번째가 404로
    # 실패해 호출 전체가 무산된다. 모델이 목록을 겹쳐 만드는 것은 흔한 실수다.
    unique = list(dict.fromkeys(values))
    if not unique:
        raise ValueError(f"{plural_key}가 비어 있습니다. 대상을 하나 이상 지정하세요.")
    if len(unique) > MAX_EDIT_ITEMS:
        raise ValueError(
            f"한 번에 {MAX_EDIT_ITEMS}건까지만 고칠 수 있습니다"
            f" (요청 {len(unique)}건). 나눠서 요청하세요."
        )
    return unique


def _tool_move_schedule(
    db: Session, session: models.ChatSession, args: dict
) -> tuple[dict, list[dict]]:
    """배정 여러 건의 시각을 한 번에 옮긴다 (#222).

    work_date(옮겨 갈 날짜)는 대상이 1건일 때만 받는다 — 여러 건을 같은 날 같은
    시각으로 보내면 서로 겹쳐 어차피 전부 실패한다. 여러 건 요청의 정상적인
    형태는 "각자 자기 날짜에 그대로 두고 시각만 바꾸기"다.
    """
    ids = _edit_targets(args, "schedule_ids", "schedule_id")
    work_date = args.get("work_date")
    if work_date and len(ids) > 1:
        raise ValueError(
            "여러 건을 같은 날짜로 한꺼번에 옮길 수는 없습니다 — 서로 겹칩니다."
            " 날짜를 바꾸려면 한 건씩 요청하세요."
        )
    return _apply_edits_via_service(db, session, [
        {
            "op": "move",
            "schedule_id": schedule_id,
            "work_date": work_date,
            "start_time": args.get("start_time"),
            "end_time": args.get("end_time"),
        }
        for schedule_id in ids
    ])


def _tool_remove_schedule(
    db: Session, session: models.ChatSession, args: dict
) -> tuple[dict, list[dict]]:
    """배정 여러 건을 한 번에 삭제한다 (#222)."""
    return _apply_edits_via_service(db, session, [
        {"op": "remove", "schedule_id": schedule_id}
        for schedule_id in _edit_targets(args, "schedule_ids", "schedule_id")
    ])


def _tool_add_schedule(
    db: Session, session: models.ChatSession, args: dict
) -> tuple[dict, list[dict]]:
    """한 학생을 여러 날짜에 같은 시각으로 한 번에 추가한다 (#222).

    추가 대상 배치는 모델이 아니라 세션이 정한다 — 세션의 현재 draft 밖으로
    쓸 수 없게 하는 스코프 경계다 (읽기 툴의 batch_id 스코프와 같은 원칙).

    날짜만 배열인 이유는 다건 추가 요청이 실제로 그 형태이기 때문이다
    ("이 학생 매주 수요일 09시에 넣어줘"). 학생·시각까지 제각각인 추가는
    평평한 인자로 표현할 수 없어 한 건씩 부르게 둔다.
    """
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")
    return _apply_edits_via_service(db, session, [
        {
            "op": "add",
            "batch_id": session.batch_id,
            "student_id": args.get("student_id"),
            "work_date": work_date,
            "start_time": args.get("start_time"),
            "end_time": args.get("end_time"),
        }
        for work_date in _edit_targets(args, "work_dates", "work_date")
    ])


WRITE_TOOL_HANDLERS: dict[
    str, Callable[[Session, models.ChatSession, dict], tuple[dict, list[dict]]]
] = {
    "move_schedule": _tool_move_schedule,
    "remove_schedule": _tool_remove_schedule,
    "add_schedule": _tool_add_schedule,
}


# ---------------------------------------------------------------------------
# 전역 쓰기 툴 — 재solve를 유발한다 (#136, 결정 13·14·15·16).
# 턴당 1회 상한 (결정 16) — 상한이 없으면 한 턴에 solve가 여러 번 돌고
# 중간 결과가 전부 버려진다. 재solve는 #149 이후 결정적·약 7초.
# ---------------------------------------------------------------------------

# 배율 고정 스텝 (결정 13). down은 정확히 1/UP — 문서의 ×0.67 근사 표기 대신
# 역수를 쓴다: 1.5 × 0.67 = 1.005라 up→down이 원값으로 돌아오지 않아
# 되돌리기(반대 방향 재적용)의 정합이 깨지기 때문.
WEIGHT_STEP_UP = 1.5
# 배율 안전 범위 — 부서 정책 화면의 저장 허용 범위(0~5, schemas의
# DepartmentPolicyUpdate 검증)와 정합해야 한다. 챗봇 세션 배율이 이 범위를
# 넘으면 persist가 화면으로는 만들 수 없는 값을 저장하게 된다.
WEIGHT_SCALE_MIN, WEIGHT_SCALE_MAX = 0.2, 5.0

# understaffing(1000)은 hard에 준하는 값 — 대화형 조정 대상에서 제외 (결정 13).
# 부서 정책 화면 저장(PATCH)의 허용 목록과 단일 어휘를 쓴다
from app.schemas import ADJUSTABLE_PENALTY_CATEGORIES  # noqa: E402

ADJUSTABLE_CATEGORIES = list(ADJUSTABLE_PENALTY_CATEGORIES)


def _violation_amounts(events: list) -> dict[str, int]:
    """penalty_events를 카테고리별 위반량 합으로 접는다 — 배율과 무관한 비교 기준."""
    amounts: dict[str, int] = {}
    for ev in events or []:
        name = ev.get("name")
        if name:
            amounts[name] = amounts.get(name, 0) + int(ev.get("amount", 0))
    return amounts


# 그 턴의 편집이 draft에 더는 남아 있지 않은 상태 — 손실 확인 게이트도
# 되돌리기 버튼도 이 턴들을 건너뛴다. "reverted"는 사람이 되돌린 것,
# "superseded"는 재solve가 draft를 갈아엎어 사라진 것이다.
DISCARDED_TURN_STATUSES = ("reverted", "superseded")

_EDIT_OPS = ("move", "remove", "add")


def _call_edit_count(call: dict) -> int:
    """툴 호출 하나가 실제로 고친 배정 건수 — 한 호출이 여러 건을 고친다 (#222)."""
    return sum(1 for inverse in call_inverses(call) if inverse.get("op") in _EDIT_OPS)


def _mark_edits_superseded(session: models.ChatSession) -> int:
    """재solve로 사라진 지난 턴의 편집을 표시한다. 표시한 턴 수를 반환한다.

    draft를 통째로 교체하면 이 대화로 손수 고쳐 둔 배정은 남지 않는다. 표시하지
    않으면 두 가지가 어긋난 채 세션이 끝날 때까지 간다 — 손실 확인 게이트가 이미
    없는 편집을 계속 세어 가중치 조정마다 확인 턴을 하나씩 더 먹고, 화면의
    되돌리기 버튼은 그대로 떠 있다가 누를 때마다 409로 실패한다.
    """
    marked = 0
    for msg in session.messages or []:
        if msg.role != "assistant" or msg.turn_status in DISCARDED_TURN_STATUSES:
            continue
        if any(_call_edit_count(call) for call in (msg.tool_calls or [])):
            msg.turn_status = "superseded"
            marked += 1
    return marked


def _pending_manual_edit_count(
    session: models.ChatSession, current_turn_calls: list | None = None
) -> int:
    """이 세션에서 **아직 draft에 남아 있는** 수동 편집 건수 — §0.2 경고의 근거.

    재solve가 draft를 통째로 교체하면 그 앞의 편집은 이미 사라졌다. 사라진 것을
    계속 세면 경고가 과하게 나가는 정도가 아니라, 한 번 편집한 세션은 끝까지
    확인을 요구하는 상태로 굳는다 — 되돌려서 지울 수도 없으므로(그 턴은
    superseded다) 탈출구가 "새 대화 시작"뿐이 된다.

    지난 턴은 _mark_edits_superseded가 붙인 turn_status로 거른다. 같은 턴 안의
    편집은 아래 루프가 재solve 성공 지점에서 0으로 되감아 거른다 — 재solve
    시점에 이번 턴의 assistant 메시지는 아직 session.messages에 없어서 두 경로가
    모두 필요하다.

    current_turn_calls: **지금 처리 중인 턴**의 tool_calls 기록. 같은 턴에서 편집
    직후 adjust_weight가 불리는 경우를 놓치지 않으려면 함께 세야 한다.
    """
    def _edit_count(calls) -> int:
        count = 0
        for call in calls or []:
            if call.get("tool") in GLOBAL_TOOL_HANDLERS and (
                call.get("result") or {}
            ).get("ok"):
                count = 0  # 이 재solve가 앞의 편집을 전부 지웠다
                continue
            count += _call_edit_count(call)
        return count

    count = _edit_count(current_turn_calls)
    for msg in session.messages or []:
        if msg.role != "assistant" or msg.turn_status in DISCARDED_TURN_STATUSES:
            continue
        count += _edit_count(msg.tool_calls)
    return count


def _confirm_loss_gate(
    session: models.ChatSession, args: dict, current_turn_calls: list | None
) -> Optional[dict]:
    """재solve가 이 대화의 수동 편집을 지운다는 확인 게이트 — 재solve 툴 셋이 함께 쓴다 (§0.2 순서 강제)."""
    pending = _pending_manual_edit_count(session, current_turn_calls)
    if pending > 0 and not args.get("confirm_loss"):
        return {
            "confirmation_required": True,
            "pending_manual_edits": pending,
            "message": (
                f"재생성하면 이 대화에서 적용한 수동 수정 {pending}건이 사라집니다."
                " 사용자에게 진행 여부를 확인한 뒤, 동의하면 confirm_loss=true로"
                " 다시 호출하세요."
            ),
        }
    return None


class ResolveFailed(ValueError):
    """재solve를 실제로 시도했다가 실패한 경우 — 검증 단계 거부(ValueError)와
    구분한다. 루프가 이 예외를 받으면 전역 툴 턴당 1회를 소진 처리해,
    실패를 반복하며 한 턴에 solve를 여러 번 돌리는 우회를 막는다."""


def _current_penalties(db: Session, session: models.ChatSession) -> tuple[dict, dict]:
    """현재 draft의 (penalty_summary, 카테고리별 위반량) — 재solve 전후 비교의 기준."""
    batch = (
        db.query(models.ScheduleBatch)
        .filter(models.ScheduleBatch.batch_id == session.batch_id)
        .first()
    )
    summary = (batch.solver_summary or {}) if batch else {}
    return (
        summary.get("penalty_summary", {}),
        _violation_amounts(summary.get("penalty_events", [])),
    )


def session_constraints(session: models.ChatSession) -> list[StudentUnavailable]:
    """세션에 쌓인 근무 불가 조건 (#254)."""
    return parse_constraints(session.session_constraints)


def _resolve_draft(
    db: Session,
    session: models.ChatSession,
    *,
    scales: dict[str, float],
    constraints: list[StudentUnavailable],
) -> tuple[dict, int]:
    """세션 상태(배율 + 근무 불가 조건)로 다시 풀고 draft를 통째로 교체한다.

    **두 상태를 항상 함께 실어 보낸다** — 배율만 보내면 이 세션에 걸린 제약이
    조용히 풀리고, 제약만 보내면 조정한 배율이 풀린다. 재solve를 유발하는 툴이
    늘어날수록 여기 한 곳으로 모아 두는 것이 유일한 방어다.

    실패는 ResolveFailed로 올린다 — 호출자가 세션 상태를 반영하기 **전에**
    터지므로, 실패한 조정·제약이 세션에 남지 않는다.
    """
    from app.routers.schedule import _replace_draft_batch
    from app.scheduler.service import (
        GenerateRequest,
        ScheduleInfeasible,
        ScheduleTimeout,
        generate_schedule,
    )

    num_days = (session.period_end - session.period_start).days + 1
    try:
        response = generate_schedule(
            GenerateRequest(
                department_id=session.department_id,
                start_date=session.period_start,
                num_days=num_days,
                extra_weight_scales=scales,
                extra_student_constraints=constraints,
            ),
            db,
        )
    except (ScheduleInfeasible, ScheduleTimeout) as e:
        # ResolveFailed = solve를 실제로 소모했으므로 턴당 1회를 소진시킨다
        raise ResolveFailed(f"재생성에 실패했습니다: {e}")

    batch_id, saved_count = _replace_draft_batch(
        db,
        department_id=session.department_id,
        period_start=session.period_start,
        period_end=session.period_end,
        created_by=session.created_by,
        schedules=response["schedules"],
        solver_summary={
            "status": response["status"],
            "solve_time_seconds": response["solve_time_seconds"],
            "objective_value": response.get("objective_value"),
            "best_objective_bound": response.get("best_objective_bound"),
            "shortages": response["shortages"],
            "penalty_summary": response["penalty_summary"],
            "penalty_events": response.get("penalty_events", []),
            "per_student": response["per_student"],
            # 어떤 세션 상태로 생성됐는지 남긴다 — 사후 추적용
            "session_weight_scales": scales,
            "session_constraints": [c.to_dict() for c in constraints],
        },
    )
    session.batch_id = batch_id
    # 옛 draft와 함께 사라진 편집을 여기서 한 번에 표시한다 — 재solve를 유발하는
    # 툴이 늘어도 이 한 곳만 지나므로 표시가 빠질 자리가 없다
    _mark_edits_superseded(session)
    return response, saved_count


def _tool_adjust_weight(
    db: Session,
    session: models.ChatSession,
    args: dict,
    current_turn_calls: list | None = None,
) -> tuple[dict, dict]:
    """soft constraint 배율을 한 스텝 조정하고 결정적으로 재solve한다.

    - 배율은 세션 안에만 머문다 (결정 15) — 부서 정책은 persist 엔드포인트로만 변경
    - 수동 편집이 남아 있으면 confirm_loss 없이 실행하지 않는다 (§0.2 순서 강제).
      같은 턴에서 방금 적용한 편집도 current_turn_calls로 함께 센다
    - 결과에 penalty before/after를 담아 모델이 트레이드오프를 설명하게 한다
    """
    category = args.get("category", "")
    direction = args.get("direction", "")
    if category not in ADJUSTABLE_CATEGORIES:
        raise ValueError(
            f"조정할 수 없는 카테고리입니다: {category}."
            f" 가능한 값: {', '.join(ADJUSTABLE_CATEGORIES)}"
        )
    if direction not in ("up", "down"):
        raise ValueError("direction은 up 또는 down이어야 합니다.")
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")

    # solve를 돌리지 않고 확인만 요청 — 모델이 사용자에게 물은 뒤
    # 다음 턴에 confirm_loss=true로 다시 호출한다
    gate = _confirm_loss_gate(session, args, current_turn_calls)
    if gate is not None:
        return gate, None  # type: ignore[return-value]  # 확인 요청은 쓰기가 아니다

    scales = dict(session.session_weight_scales or {})
    before_scale = float(scales.get(category, 1.0))
    step = WEIGHT_STEP_UP if direction == "up" else 1.0 / WEIGHT_STEP_UP
    after_scale = before_scale * step
    if not (WEIGHT_SCALE_MIN <= after_scale <= WEIGHT_SCALE_MAX):
        raise ValueError(
            f"{PENALTY_LABELS[category]} 배율이 허용 범위"
            f"({WEIGHT_SCALE_MIN}~{WEIGHT_SCALE_MAX})를 벗어납니다."
            f" (현재 {before_scale:.2f})"
        )
    scales[category] = after_scale

    before_penalty, before_violations = _current_penalties(db, session)
    response, saved_count = _resolve_draft(
        db, session, scales=scales, constraints=session_constraints(session)
    )
    session.session_weight_scales = scales
    db.flush()

    result = {
        "ok": True,
        "category": category,
        "label": PENALTY_LABELS[category],
        "scale": {"before": round(before_scale, 4), "after": round(after_scale, 4)},
        # 위반 건수 기준 비교 — 배율을 바꾸면 비용(penalty_diff)은 위반이 그대로여도
        # 부풀거나 줄어들어 오독을 부른다. 트레이드오프 설명은 이 값을 기준으로.
        "violation_diff": {
            "before": before_violations,
            "after": _violation_amounts(response.get("penalty_events", [])),
        },
        # 비용 기준 비교 — 배율이 다른 두 시점의 비용이라 직접 비교 금물
        "penalty_diff": {
            "before": before_penalty,
            "after": response["penalty_summary"],
        },
        "solver": {
            "status": response["status"],
            "solve_time_seconds": response["solve_time_seconds"],
        },
        "saved_count": saved_count,
    }
    # 되돌리기 = 반대 방향 재조정 (재solve 한 번 더). 이미 사용자가 확인한
    # 손실이므로 confirm_loss를 함께 실어 확인 게이트를 다시 밟지 않는다
    inverse = {
        "op": "adjust_weight",
        "category": category,
        "direction": "down" if direction == "up" else "up",
        "confirm_loss": True,
    }
    return result, inverse


# ---------------------------------------------------------------------------
# 근무 불가 조건 (#254) — "김현서 학생은 월요일에 근무하지 않도록 해줘"
#
# 이런 요청은 개별 배정 편집이 아니라 **제약조건 추가**다. 지우기만 하면 빈
# 자리를 아무도 채우지 않고, 다음 재생성에서 그 근무가 되살아난다. 조건을
# 세션에 쌓고 CP-SAT 문제를 처음부터 다시 푼다 — adjust_weight와 같은 규약
# (턴당 1회, 수동 편집 손실 확인, 실패 시 세션 미반영)을 따른다.
# ---------------------------------------------------------------------------


def _resolve_student(db: Session, session: models.ChatSession, name: str) -> tuple[str, str]:
    """이름 → (학번, 이름). 부서 소속으로 한정한다 — 담당자가 관리하지 않는
    학생에게 조건을 걸면 그 부서 근무표에서는 아무 효과가 없다."""
    name = (name or "").strip()
    if not name:
        raise ValueError("어느 학생인지 이름을 지정해주세요.")
    department_ids = set(get_department_student_ids(db, session.department_id))
    rows = [
        s
        for s in db.query(models.Student).filter(models.Student.name == name)
        if s.student_id in department_ids
    ]
    if not rows:
        raise ValueError(f"이 부서 근무표에 '{name}' 학생이 없습니다.")
    if len(rows) > 1:
        ids = ", ".join(r.student_id for r in rows)
        raise ValueError(
            f"'{name}' 학생이 여러 명입니다({ids}). 어느 학생인지 담당자에게 확인해주세요."
        )
    return rows[0].student_id, rows[0].name


def _build_constraint(
    db: Session, session: models.ChatSession, args: dict
) -> StudentUnavailable:
    """툴 인자 → 근무 불가 조건. 되돌리기는 저장해 둔 `constraint`를 그대로 쓴다."""
    if args.get("constraint"):
        return StudentUnavailable.from_dict(args["constraint"])

    student_id, student_name = _resolve_student(db, session, args.get("student_name"))
    weekday = _parse_weekday(args.get("weekday"))
    raw_dates = args.get("dates") or ([args["work_date"]] if args.get("work_date") else [])
    if bool(weekday) == bool(raw_dates):
        raise ValueError("요일(weekday)과 날짜(dates) 중 정확히 하나만 지정해주세요.")
    try:
        dates = tuple(datetime.date.fromisoformat(d) for d in raw_dates)
    except ValueError:
        raise ValueError("날짜는 YYYY-MM-DD 형식이어야 합니다.")

    constraint = StudentUnavailable(
        student_id=student_id,
        student_name=student_name,
        weekday=weekday,
        dates=dates,
        start_min=to_minutes(args["start_time"]) if args.get("start_time") else 0,
        end_min=to_minutes(args["end_time"]) if args.get("end_time") else 24 * 60,
    )
    # 기간 밖 조건은 받지 않는다 — 저장해 두면 "적용했다"고 보고한 조건이 실제로는
    # 어느 날짜에도 걸리지 않아, 담당자는 반영된 줄 알고 넘어간다
    if not constraint.days_within(session.period_start, session.period_end):
        raise ValueError(
            f"이 근무표 기간({session.period_start}~{session.period_end})에"
            " 해당하는 날짜가 없습니다."
        )
    return constraint


def _constraint_result(
    db: Session,
    session: models.ChatSession,
    constraint: StudentUnavailable,
    before_penalty: dict,
    before_violations: dict,
    before_blocked: int,
    response: dict,
    saved_count: int,
    verb: str,
) -> dict:
    return {
        "ok": True,
        "action": verb,
        "constraint": constraint.describe(),
        "active_constraints": [c.describe() for c in session_constraints(session)],
        # 조건 구간에 남은 그 학생의 배정 — 조건이 실제로 먹었는지의 근거.
        # 0이 아니면 무언가 잘못된 것이니 "반영했다"고 말하면 안 된다
        "blocked_window_assignments": {
            "before": before_blocked,
            "after": _assignments_in_window(db, session, constraint),
        },
        "violation_diff": {
            "before": before_violations,
            "after": _violation_amounts(response.get("penalty_events", [])),
        },
        "penalty_diff": {
            "before": before_penalty,
            "after": response["penalty_summary"],
        },
        "solver": {
            "status": response["status"],
            "solve_time_seconds": response["solve_time_seconds"],
        },
        "saved_count": saved_count,
    }


def _assignments_in_window(
    db: Session, session: models.ChatSession, constraint: StudentUnavailable
) -> int:
    """현재 draft에서 그 조건 구간에 남아 있는 그 학생의 배정 건수."""
    if session.batch_id is None:
        return 0
    days = set(constraint.days_within(session.period_start, session.period_end))
    if not days:
        return 0
    rows = (
        db.query(models.WorkSchedule)
        .filter(
            models.WorkSchedule.batch_id == session.batch_id,
            models.WorkSchedule.student_id == constraint.student_id,
        )
        .all()
    )
    return sum(
        1
        for r in rows
        if r.work_date in days
        and _minutes_of(r.start_time) < constraint.end_min
        and _minutes_of(r.end_time) > constraint.start_min
    )


def _tool_add_constraint(
    db: Session,
    session: models.ChatSession,
    args: dict,
    current_turn_calls: list | None = None,
) -> tuple[dict, Optional[dict]]:
    """근무 불가 조건을 세션에 추가하고 그 조건을 반영해 다시 푼다."""
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")

    constraint = _build_constraint(db, session, args)
    existing = session_constraints(session)
    if any(c.key == constraint.key for c in existing):
        raise ValueError(f"이미 적용 중인 조건입니다: {constraint.describe()}")
    if len(existing) >= MAX_SESSION_CONSTRAINTS:
        raise ValueError(
            f"한 세션에 걸 수 있는 조건은 {MAX_SESSION_CONSTRAINTS}개까지입니다."
            " 필요 없는 조건을 먼저 걷어주세요."
        )

    gate = _confirm_loss_gate(session, args, current_turn_calls)
    if gate is not None:
        return gate, None  # 확인 요청은 쓰기가 아니다 — inverse 없음

    before_penalty, before_violations = _current_penalties(db, session)
    before_blocked = _assignments_in_window(db, session, constraint)
    updated = existing + [constraint]
    response, saved_count = _resolve_draft(
        db,
        session,
        scales=dict(session.session_weight_scales or {}),
        constraints=updated,
    )
    session.session_constraints = [c.to_dict() for c in updated]
    db.flush()

    result = _constraint_result(
        db, session, constraint, before_penalty, before_violations,
        before_blocked, response, saved_count, verb="added",
    )
    # 되돌리기 = 같은 조건을 걷고 재solve. 손실은 이미 확인받았다
    inverse = {
        "op": "remove_constraint",
        "constraint": constraint.to_dict(),
        "confirm_loss": True,
    }
    return result, inverse


def _tool_remove_constraint(
    db: Session,
    session: models.ChatSession,
    args: dict,
    current_turn_calls: list | None = None,
) -> tuple[dict, Optional[dict]]:
    """걸어 둔 근무 불가 조건을 걷고 그 상태로 다시 푼다."""
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")

    existing = session_constraints(session)
    if not existing:
        raise ValueError("이 대화에서 건 근무 불가 조건이 없습니다.")

    if args.get("constraint"):
        target_key = StudentUnavailable.from_dict(args["constraint"]).key
        target = next((c for c in existing if c.key == target_key), None)
    else:
        number = args.get("constraint_number")
        if not isinstance(number, int) or not 1 <= number <= len(existing):
            listing = "; ".join(
                f"{i}. {c.describe()}" for i, c in enumerate(existing, start=1)
            )
            raise ValueError(
                f"걷을 조건 번호를 1~{len(existing)} 중에서 지정해주세요. 현재 조건: {listing}"
            )
        target = existing[number - 1]
    if target is None:
        raise ValueError("그 조건은 지금 적용 중이 아닙니다.")

    gate = _confirm_loss_gate(session, args, current_turn_calls)
    if gate is not None:
        return gate, None

    before_penalty, before_violations = _current_penalties(db, session)
    before_blocked = _assignments_in_window(db, session, target)
    updated = [c for c in existing if c.key != target.key]
    response, saved_count = _resolve_draft(
        db,
        session,
        scales=dict(session.session_weight_scales or {}),
        constraints=updated,
    )
    # 빈 목록을 None으로 접지 않는다 — JSONB에 JSON null이 들어가
    # SQL NULL과 갈라진다. 읽기는 어느 쪽이든 []로 떨어지지만 조회가 헷갈린다
    session.session_constraints = [c.to_dict() for c in updated]
    db.flush()

    result = _constraint_result(
        db, session, target, before_penalty, before_violations,
        before_blocked, response, saved_count, verb="removed",
    )
    inverse = {
        "op": "add_constraint",
        "constraint": target.to_dict(),
        "confirm_loss": True,
    }
    return result, inverse


GLOBAL_TOOL_HANDLERS: dict[
    str, Callable[[Session, models.ChatSession, dict], tuple[dict, dict]]
] = {
    "adjust_weight": _tool_adjust_weight,
    "add_constraint": _tool_add_constraint,
    "remove_constraint": _tool_remove_constraint,
}


def persist_session_scales(db: Session, session: models.ChatSession) -> dict:
    """세션 임시 배율을 부서 기본값으로 저장한다 (결정 15).

    기존 PATCH 경로(routers/schedule.py의 soft_weight_scales 갱신)와 같은
    합성 규칙 — 부서 저장 배율 × 세션 배율, 1.0은 저장하지 않는다.
    """
    from sqlalchemy.orm.attributes import flag_modified

    scales = dict(session.session_weight_scales or {})
    if not scales:
        raise ValueError("이 세션에서 조정한 배율이 없습니다.")

    policy_row = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == session.department_id)
        .first()
    )
    if policy_row is None:
        policy_row = models.DepartmentPolicy(
            department_id=session.department_id, availability_mode="weekly_only"
        )
        db.add(policy_row)
        db.flush()

    merged = dict(policy_row.soft_weight_scales or {})
    for category, scale in scales.items():
        merged[category] = round(merged.get(category, 1.0) * float(scale), 4)
        # 화면 저장(PATCH policy)과 같은 규칙 — 0~5 밖 값은 저장 거부.
        # 부서 저장값이 이미 높은 상태에서 세션 배율을 곱하면 넘을 수 있다
        if not 0 <= merged[category] <= 5:
            raise ValueError(
                f"{PENALTY_LABELS.get(category, category)}의 최종 배율"
                f"({merged[category]})이 저장 허용 범위(0~5)를 벗어납니다."
                " 부서 기본값을 먼저 낮추거나 세션 배율을 되돌려주세요."
            )
    policy_row.soft_weight_scales = {k: v for k, v in merged.items() if v != 1.0}
    flag_modified(policy_row, "soft_weight_scales")

    # 부서 기본값에 흡수됐으므로 세션 임시 배율은 초기화 — 이중 적용 방지
    session.session_weight_scales = None
    return {"saved": policy_row.soft_weight_scales}


def call_inverses(call: dict) -> list[dict]:
    """툴 호출 기록 하나에 담긴 역연산 목록 — **적용된 순서대로** 돌려준다.

    다건 쓰기(#222) 이후의 기록은 `inverses`(배열)를 쓴다. `inverse`(단건)는
    #222 이전에 저장된 이력을 위해 계속 읽는다 — 이미 저장된 턴도 되돌릴 수
    있어야 하기 때문이다. "되돌릴 것이 있는 호출인가" 판정도 이 함수로 한다.
    """
    if call.get("inverses"):
        return list(call["inverses"])
    if call.get("inverse"):
        return [call["inverse"]]
    return []


def revert_turn(db: Session, session: models.ChatSession, message) -> int:
    """한 턴의 쓰기 툴 호출을 역순으로 일괄 취소한다 (결정 11). 되돌린 건수 반환.

    커밋하지 않는다 — 도중 하나라도 실패하면(그 사이 다른 편집이 끼어든 경우 등)
    HTTPException이 그대로 올라가고, 라우터가 롤백해 부분 복구 상태를 남기지
    않는다. remove의 복원은 add라 새 schedule_id가 발급되므로, 같은 턴에서
    같은 행을 여러 번 고친 경우 이전 id를 가리키는 역연산이 실패할 수 있다 —
    그 경우도 전체 실패로 처리된다 (설계 문서 §3 revert).

    adjust_weight의 역연산은 반대 방향 재조정이라 재solve를 한 번 더
    유발한다 (#136) — 되돌리기에도 solve 시간(#149 이후 약 7초)이 든다.
    근무 불가 조건(#254)도 같다: 걸었던 조건을 걷고 다시 푼다. 조건이 사라진
    문제를 새로 푸는 것이라 배정이 편집 전과 글자 그대로 같지는 않다 —
    되돌아가는 것은 "그 조건이 없던 문제"이지 "그때 나온 그 표"가 아니다.
    """
    reverted = 0
    for call in reversed(message.tool_calls or []):
        # 한 호출이 여러 건을 고쳤을 수 있다 (#222) — 그 안에서도 역순이어야
        # 앞 편집이 만든 상태를 뒤 편집이 되돌린 뒤에 되돌린다
        for inverse in reversed(call_inverses(call)):
            op = inverse.get("op")
            if op == "adjust_weight":
                _tool_adjust_weight(db, session, inverse)
            elif op == "add_constraint":
                _tool_add_constraint(db, session, inverse)
            elif op == "remove_constraint":
                _tool_remove_constraint(db, session, inverse)
            else:
                # 되돌리기는 직전 상태 복원이라 주간 상한을 새로 위반하지 않는다 —
                # 검사하면 되돌릴 수 없는 배정이 생긴다 (#137)
                _apply_edit_via_service(db, session, inverse, skip_policy_checks=True)
            reverted += 1
    return reverted

_TOOL_DECLARATIONS = [
    types.FunctionDeclaration(
        name="find_schedules",
        description=(
            "현재 draft 근무표에서 배정을 조회한다. 배정을 언급하거나 고치기 전에"
            " 반드시 이 툴로 대상을 확인하라 — schedule_id를 추측하지 마라."
            " 결과의 각 배정에는 그 날짜의 요일(day)이 함께 담긴다."
            " 요일로 요청받았으면 weekday 인자를 써라 — 날짜에서 요일을 직접 계산하지 마라."
            " 각 배정에는 인원·블록 맥락도 함께 온다:"
            " hours(그 배정의 시간), headcount(그 시간대 동시 근무 인원, 자기 포함),"
            " min_required(그 시간대에 있어야 하는 최소 인원),"
            " coworkers(함께 근무하는 다른 학생 이름),"
            " understaffed_if_removed(이 배정을 빼면 최소 인원이 깨지는가),"
            " work_blocks(이 배정이 걸친 부서 근무 블록),"
            " block_aligned(배정이 블록 경계에 맞아떨어지는가),"
            " funding_type(재원: gyobi=교비, gukga=국가)."
            " 어느 배정을 뺄지·줄일지 고를 때는 이 값들을 근거로 삼아라."
            " 시간 합계는 서버가 계산해 함께 담는다 — 배정을 하나씩 더하지 마라."
            " result_hours는 이번 조회 결과의 합계이고,"
            " batch_totals는 조회 필터와 무관한 근무표 전체 합계다:"
            " hours(전체), gyobi_hours(교비만), gukga_hours(국가만),"
            " gyobi_biweekly_limit_hours(부서 2주 교비 총합 상한),"
            " by_week(기간 시작일부터 7일씩 끊은 주차별 같은 항목)."
            " 부서 상한과 견줄 수 있는 값은 batch_totals의 gyobi_hours뿐이다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "student_name": types.Schema(
                    type=types.Type.STRING,
                    description="학생 이름으로 필터. 담당자가 이름으로 말하면 이 인자를 쓴다",
                ),
                "student_id": types.Schema(type=types.Type.STRING, description="학번으로 필터"),
                "weekday": types.Schema(
                    type=types.Type.STRING,
                    enum=["월", "화", "수", "목", "금", "토", "일"],
                    description=(
                        "요일로 필터. 담당자가 '수요일 근무'처럼 요일로 말하면"
                        " 반드시 이 인자를 쓴다 — 날짜를 요일로 직접 환산하지 마라"
                    ),
                ),
                "work_date": types.Schema(type=types.Type.STRING, description="특정 날짜 (YYYY-MM-DD)"),
                "date_from": types.Schema(type=types.Type.STRING, description="기간 시작 (YYYY-MM-DD)"),
                "date_to": types.Schema(type=types.Type.STRING, description="기간 끝 (YYYY-MM-DD)"),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="explain_penalty",
        description=(
            "soft constraint 카테고리 하나의 실제 위반 내역(학생·날짜·비용)을"
            " 조회한다. '왜 이렇게 배정됐나'류 질문에 근거를 대는 용도."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "category": types.Schema(
                    type=types.Type.STRING,
                    enum=list(PENALTY_LABELS.keys()),
                    description="조회할 페널티 카테고리",
                ),
            },
            required=["category"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_student_availability",
        description=(
            "학생 한 명의 요일 반복 시간표(근무 가능 시간·수업)와 이 기간의"
            " 날짜별 예외(특정일 근무 불가·날짜별 수정)를 조회한다."
            " 주차별로 배정이 다른 이유를 설명하려면 이 툴로 날짜별 예외를"
            " 먼저 확인하라 — 요일 표만 보고 '주차별 입력이 같다'고 단정하지 마라."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "student_id": types.Schema(type=types.Type.STRING, description="학번"),
            },
            required=["student_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_period_calendar",
        description=(
            "이 기간의 날짜별 학사 일정(공휴일·교내 휴강일·폐관일·시험 기간·"
            "학기/방학)과 부서 개관 시간을 조회한다. 주차마다 배정이 다른"
            " 이유를 설명하기 전에 이 툴로 날짜별 차이를 확인하라 —"
            " 같은 요일이라도 폐관일이면 배정이 0건이고 공휴일이면 단축 개관이다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "date_from": types.Schema(
                    type=types.Type.STRING,
                    description="조회 시작일 (YYYY-MM-DD, 생략 시 기간 시작일)",
                ),
                "date_to": types.Schema(
                    type=types.Type.STRING,
                    description="조회 종료일 (YYYY-MM-DD, 생략 시 기간 종료일)",
                ),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="verify_schedule",
        description=(
            "현재 draft가 규정(개관 시간, 학생 가능 시간, 슬롯 인원, 근로시간"
            " 상한)을 지키는지 검사한다. AI 판단이 아니라 결정적 검증이다."
            " '규정 지키나', '문제 없나'류 질문에 쓴다. 근무표를 고친 뒤에는"
            " 새로 생긴 위반이 쓰기 툴 결과에 함께 오므로 다시 부를 필요가 없다."
        ),
        parameters=types.Schema(type=types.Type.OBJECT, properties={}),
    ),
    # ---- 쓰기 툴 (#135) — draft만 고친다. 즉시 적용되며 턴 단위로 되돌릴 수 있다 ----
    types.FunctionDeclaration(
        name="move_schedule",
        description=(
            "draft 배정의 시각을 바꾼다. 여러 건을 한 번에 옮길 수 있다 —"
            " 대상이 여러 건이면 schedule_ids에 모두 담아 **한 번만** 호출하라."
            " 한 건씩 나눠 부르면 호출 예산이 모자라 중간에 멈춘다."
            " 반드시 find_schedules로 schedule_id를 확인한 뒤 호출하라. 즉시 적용된다."
            " 한 건이라도 실패하면 그 호출은 아무것도 적용하지 않는다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "schedule_ids": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.INTEGER),
                    description="find_schedules로 확인한 배정 ID 목록. 한 건이어도 배열로 넣는다",
                ),
                "work_date": types.Schema(
                    type=types.Type.STRING,
                    description=(
                        "새 날짜 (YYYY-MM-DD). 생략하면 각 배정이 원래 날짜에 그대로 있고"
                        " 시각만 바뀐다 — 여러 건을 옮길 때는 생략해야 한다"
                    ),
                ),
                "start_time": types.Schema(type=types.Type.STRING, description="새 시작 시각 (HH:MM)"),
                "end_time": types.Schema(type=types.Type.STRING, description="새 종료 시각 (HH:MM)"),
            },
            required=["schedule_ids", "start_time", "end_time"],
        ),
    ),
    types.FunctionDeclaration(
        name="remove_schedule",
        description=(
            "draft 배정을 삭제한다. 여러 건을 한 번에 지울 수 있다 — '다 빼줘'처럼"
            " 대상이 여러 건이면 schedule_ids에 모두 담아 **한 번만** 호출하라."
            " 한 건씩 나눠 부르면 호출 예산이 모자라 일부만 지워진 채로 끝난다."
            " 반드시 find_schedules로 schedule_id를 확인한 뒤 호출하라. 즉시 적용된다."
            " 한 건이라도 실패하면 그 호출은 아무것도 지우지 않는다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "schedule_ids": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.INTEGER),
                    description="find_schedules로 확인한 배정 ID 목록. 한 건이어도 배열로 넣는다",
                ),
            },
            required=["schedule_ids"],
        ),
    ),
    types.FunctionDeclaration(
        name="add_schedule",
        description=(
            "현재 draft 근무표에 한 학생의 배정을 추가한다. 같은 시각이면 여러 날짜에"
            " 한 번에 넣을 수 있다 — work_dates에 날짜를 모두 담아 **한 번만** 호출하라."
            " 학생이나 시각이 서로 다르면 그때만 나눠 호출한다."
            " 학생의 가능 시간을 get_student_availability로 확인한 뒤 호출하는 것이 좋다."
            " 즉시 적용되며, 한 건이라도 실패하면 그 호출은 아무것도 추가하지 않는다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "student_id": types.Schema(type=types.Type.STRING, description="학번"),
                "work_dates": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.STRING),
                    description="날짜 목록 (YYYY-MM-DD). 하루여도 배열로 넣는다",
                ),
                "start_time": types.Schema(type=types.Type.STRING, description="시작 시각 (HH:MM)"),
                "end_time": types.Schema(type=types.Type.STRING, description="종료 시각 (HH:MM)"),
            },
            required=["student_id", "work_dates", "start_time", "end_time"],
        ),
    ),
    # ---- 전역 쓰기 툴 (#136) — 가중치 조정 + 재생성. 턴당 1회 ----
    types.FunctionDeclaration(
        name="adjust_weight",
        description=(
            "soft constraint 카테고리 하나의 중요도를 한 단계 올리거나 내리고"
            " 근무표를 다시 생성한다. 결과에 조정 전후 penalty 비교가 담긴다."
            " 배율 크기는 시스템이 정한다 — 숫자를 지정할 수 없다."
            " 이 대화에서 수동으로 고친 배정이 있으면 먼저 확인을 요구한다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "category": types.Schema(
                    type=types.Type.STRING,
                    enum=ADJUSTABLE_CATEGORIES,
                    description="조정할 페널티 카테고리 (understaffing은 조정 불가)",
                ),
                "direction": types.Schema(
                    type=types.Type.STRING,
                    enum=["up", "down"],
                    description="up = 더 중요하게(위반 줄이기), down = 덜 중요하게",
                ),
                "confirm_loss": types.Schema(
                    type=types.Type.BOOLEAN,
                    description=(
                        "수동 수정 손실을 사용자가 확인한 경우에만 true."
                        " 확인 없이 true로 보내지 마라."
                    ),
                ),
            },
            required=["category", "direction"],
        ),
    ),
    # ---- 전역 쓰기 툴 (#254) — 근무 불가 조건 + 재생성. 턴당 1회 ----
    types.FunctionDeclaration(
        name="add_constraint",
        description=(
            "특정 학생이 특정 요일 또는 특정 날짜에 근무하지 않도록 조건을 걸고,"
            " 그 조건을 반영해 근무표를 처음부터 다시 생성한다."
            " '월요일에는 근무하지 않도록 해줘', '이 학생 오전은 빼줘'처럼"
            " 앞으로도 계속 지켜야 할 규칙일 때 쓴다 — 빠진 자리는 솔버가"
            " 다른 학생으로 다시 채운다. 특정 근무 한 건만 빼는 것이면"
            " remove_schedule이 맞다. 이 대화에서 수동으로 고친 배정이 있으면"
            " 먼저 확인을 요구한다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "student_name": types.Schema(
                    type=types.Type.STRING, description="조건을 걸 학생 이름"
                ),
                "weekday": types.Schema(
                    type=types.Type.STRING,
                    enum=list(_DAY_NUMBERS),
                    description=(
                        "근무하지 않을 요일 (월·화·수·목·금·토·일)."
                        " 기간 안의 그 요일 전부에 적용된다. dates와 함께 쓸 수 없다."
                    ),
                ),
                "dates": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.STRING),
                    description=(
                        "근무하지 않을 날짜 목록 (YYYY-MM-DD)."
                        " weekday와 함께 쓸 수 없다."
                    ),
                ),
                "start_time": types.Schema(
                    type=types.Type.STRING,
                    description="구간 시작 (HH:MM). 비우면 종일 근무 불가",
                ),
                "end_time": types.Schema(
                    type=types.Type.STRING,
                    description="구간 끝 (HH:MM). 비우면 종일 근무 불가",
                ),
                "confirm_loss": types.Schema(
                    type=types.Type.BOOLEAN,
                    description=(
                        "수동 수정 손실을 사용자가 확인한 경우에만 true."
                        " 확인 없이 true로 보내지 마라."
                    ),
                ),
            },
            required=["student_name"],
        ),
    ),
    types.FunctionDeclaration(
        name="remove_constraint",
        description=(
            "이 대화에서 걸어 둔 근무 불가 조건 하나를 걷고 근무표를 다시 생성한다."
            " 조건 번호는 컨텍스트의 '적용 중인 근무 불가 조건' 목록에 있다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "constraint_number": types.Schema(
                    type=types.Type.INTEGER,
                    description="걷을 조건의 번호 (컨텍스트 목록 기준, 1부터)",
                ),
                "confirm_loss": types.Schema(
                    type=types.Type.BOOLEAN,
                    description="수동 수정 손실을 사용자가 확인한 경우에만 true",
                ),
            },
            required=["constraint_number"],
        ),
    ),
]


# ---------------------------------------------------------------------------
# LLM 호출 — 한 스텝. 테스트는 이 함수를 monkeypatch해 툴 루프를 mock으로 돈다.
# ---------------------------------------------------------------------------


@dataclass
class LlmStep:
    """Gemini 응답 한 번 분량. raw_content는 프로덕션에서 대화 이력에 다시
    붙일 types.Content — mock에서는 None이어도 루프가 동작한다."""

    text: Optional[str] = None
    function_calls: list[tuple[str, dict]] = field(default_factory=list)
    raw_content: Any = None
    # 이 스텝의 토큰 사용량 {"input_tokens", "output_tokens", "total_tokens"}.
    # 비용 축을 재는 eval 하네스(scripts/eval_chat.py)만 읽는다 — 프로덕션 루프는
    # 쓰지 않으므로 mock에서 None이어도 동작에 영향이 없다.
    usage: Optional[dict] = None


def _get_gemini_client() -> Optional[genai.Client]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def _llm_step(contents: list) -> LlmStep:
    client = _get_gemini_client()
    if client is None:
        raise ChatUnavailable("not_configured")

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=[types.Tool(function_declarations=_TOOL_DECLARATIONS)],
        temperature=TEMPERATURE,
    )
    try:
        response = client.models.generate_content(
            model=MODEL, contents=contents, config=config
        )
    except errors.APIError as e:
        if e.code != 429:
            logger.error("Gemini 챗봇 호출 실패: %s", e)
            raise ChatUnavailable("ai_error") from e
        logger.warning("429 사용량 제한 — %.0f초 대기 후 재시도", RATE_LIMIT_RETRY_DELAY)
        time.sleep(RATE_LIMIT_RETRY_DELAY)
        try:
            response = client.models.generate_content(
                model=MODEL, contents=contents, config=config
            )
        except errors.APIError as e2:
            logger.error("Gemini 챗봇 재시도 실패: %s", e2)
            raise ChatUnavailable("ai_error") from e2

    calls = [
        (fc.name, dict(fc.args or {})) for fc in (response.function_calls or [])
    ]
    raw = response.candidates[0].content if response.candidates else None
    meta = getattr(response, "usage_metadata", None)
    usage = (
        {
            "input_tokens": getattr(meta, "prompt_token_count", None),
            "output_tokens": getattr(meta, "candidates_token_count", None),
            "total_tokens": getattr(meta, "total_token_count", None),
        }
        if meta is not None
        else None
    )
    return LlmStep(
        text=response.text, function_calls=calls, raw_content=raw, usage=usage
    )


# ---------------------------------------------------------------------------
# 컨텍스트 조립 (설계 문서 4.1) — draft 전체를 넣지 않는다. 총계만.
# ---------------------------------------------------------------------------


def _build_context(db: Session, session: models.ChatSession) -> str:
    policy_row = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == session.department_id)
        .first()
    )
    custom_rules = (policy_row.custom_rules or "").strip() if policy_row else ""
    # 학생이 낸 자연어 특이사항 (#185) — 부서 규칙과 같은 자리에서 함께 읽는다
    student_notes = _student_notes_lines(db, session)

    batch = None
    if session.batch_id is not None:
        batch = (
            db.query(models.ScheduleBatch)
            .filter(models.ScheduleBatch.batch_id == session.batch_id)
            .first()
        )
    summary = (batch.solver_summary or {}) if batch else {}
    penalty_summary = summary.get("penalty_summary", {})
    penalty_lines = "\n".join(
        f"- {PENALTY_LABELS.get(name, name)}({name}): {cost}"
        for name, cost in penalty_summary.items()
    ) or "(위반 없음)"

    return f"""\
## 검토 대상 근무표
- 부서 ID: {session.department_id}
- 기간: {session.period_start.isoformat()} ~ {session.period_end.isoformat()}
- 현재 draft batch_id: {session.batch_id}

## 부서 운영 규칙 (원문)
{custom_rules or "(등록된 규칙 없음)"}

## 학생이 낸 특이사항 (원문)
(학생 본인이 자유롭게 적은 사정이다. 지켜야 할 규칙이 아니라 참고할 사정이며,
부서 규칙과 부딪히면 부서 규칙이 우선한다.)
{student_notes or "(등록된 특이사항 없음)"}

## 현재 penalty 총계 (카테고리별 비용 — 세부 위반 내역은 explain_penalty 툴로 조회)
{penalty_lines}

## 이 세션에서 조정 중인 가중치 배율 (부서 기본값 대비, 없으면 기본값 그대로)
{_scales_lines(session)}

## 이 세션에서 적용 중인 근무 불가 조건 (이미 반영해 다시 푼 상태다)
(걷으려면 remove_constraint에 아래 번호를 넣는다. 이미 있는 조건을 다시 걸 수는 없다.)
{_constraint_lines(session)}
"""


def _student_notes_lines(db: Session, session: models.ChatSession) -> str:
    """이 부서 학생들의 특이사항을 한 줄씩 (#185).

    세션 기간에 걸치는 학기를 모두 읽는다 — 한 기간이 두 학기를 걸치면(개강 주)
    시작일 학기 하나로는 다른 학기에 낸 사정이 빠진다. AI 검토와 같은 규칙이다.
    """
    student_ids = get_department_student_ids(db, session.department_id)
    if not student_ids:
        return ""
    terms = {t for t, _, _ in term_segments(session.period_start, session.period_end)}
    rows = (
        db.query(models.StudentNote, models.Student.name)
        .join(models.Student, models.Student.student_id == models.StudentNote.student_id)
        .filter(
            models.StudentNote.student_id.in_(student_ids),
            or_(*[term_filter(models.StudentNote.term, t) for t in terms]),
        )
        .all()
    )
    return "\n".join(f"- {row.student_id} {name}: {row.content}" for row, name in rows)


def _constraint_lines(session: models.ChatSession) -> str:
    constraints = session_constraints(session)
    if not constraints:
        return "(조건 없음)"
    return "\n".join(
        f"{i}. {c.describe()}" for i, c in enumerate(constraints, start=1)
    )


def _scales_lines(session: models.ChatSession) -> str:
    scales = session.session_weight_scales or {}
    if not scales:
        return "(조정 없음)"
    return "\n".join(
        f"- {PENALTY_LABELS.get(name, name)}({name}): ×{scale:.2f}"
        for name, scale in scales.items()
    )


def _history_contents(
    session: models.ChatSession, user_text: str, context: str, deid
) -> list:
    """최근 N개 메시지 + 이번 발화를 Gemini contents로 변환한다 (결정 10).

    저장된 이력은 담당자가 읽는 형태(실명)로 남아 있으므로, 보낼 때마다 다시
    가린다 (#200). DB를 별칭으로 바꾸지 않는 이유는 매핑이 요청 단위여서
    다음 요청에는 같은 별칭이 무엇이었는지 알 수 없기 때문이다.
    """
    contents = []
    recent = (session.messages or [])[-RECENT_MESSAGES:]
    for msg in recent:
        role = "user" if msg.role == "user" else "model"
        contents.append(
            types.Content(role=role, parts=[types.Part(text=deid.mask(msg.content))])
        )
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part(text=f"{context}\n\n## 직원 발화\n{deid.mask(user_text)}")],
        )
    )
    return contents


def _restore_tool_args(args: dict, deid) -> dict:
    """모델이 별칭으로 부른 툴 인자를 실제 값으로 되돌린다 (#200).

    student_name만 이름으로 되돌린다 — find_schedules가 `Student.name`으로
    조회하기 때문이다. 이름으로 되돌리면 동명이인 조회도 지금과 똑같이 동작한다.
    """
    return {
        key: deid.restore_data(value, style="name" if key == "student_name" else "id")
        for key, value in (args or {}).items()
    }


# ---------------------------------------------------------------------------
# 툴 루프 (설계 문서 5.1)
# ---------------------------------------------------------------------------


def run_turn(
    db: Session, session: models.ChatSession, user_text: str
) -> tuple[str, list[dict], Optional[str]]:
    """한 턴 실행 — (응답 텍스트, tool_calls 기록, turn_status)를 반환한다.

    툴 실패는 예외로 턴을 끝내지 않고 사유를 결과로 모델에 돌려준다 —
    모델이 남은 예산 안에서 다른 방법을 시도하거나 사용자에게 설명한다.
    """
    from fastapi import HTTPException  # apply_draft_edit의 검증 실패(400/404)를 결과로 변환

    # 비식별화 (#200) — 부서 학생 전원을 매핑에 넣는다. 컨텍스트·이력·직원 발화·
    # 툴 결과가 전부 이 매핑을 거쳐 나가고, 모델 응답과 툴 인자는 되돌아온다.
    deid = deidentify.build_for_department(db, session.department_id)
    context = deid.mask(_build_context(db, session))
    contents = _history_contents(session, user_text, context, deid)
    calls_record: list[dict] = []
    calls_used = 0
    writes_ok = writes_failed = 0
    global_solved = False  # 재solve 유발 툴은 턴당 1회 (결정 16)

    def _finish_status() -> Optional[str]:
        """쓰기 결과에 따른 턴 상태 (결정 11) — 쓰기가 없던 턴은 None."""
        if writes_failed:
            return "partial_failed"
        if writes_ok:
            return "applied"
        return None

    # 예산(결정 17)은 LLM 왕복 수가 아니라 실제 툴 호출 수를 센다 — Gemini가
    # 한 스텝에 병렬로 여러 함수를 부를 수 있고, 반대로 마지막 툴 결과를 받아
    # 답을 마무리할 스텝은 예산과 무관하게 필요하기 때문. LLM 스텝은 예산 소진
    # 통보 후 마무리 답변 기회 1번을 더해 STEP_BUDGET + 2로 막는다.
    for _ in range(STEP_BUDGET + 2):
        step = _llm_step(contents)

        if not step.function_calls:
            # 담당자는 이름으로 읽는다(시스템 프롬프트 원칙) — 별칭을 이름으로 되돌린다
            return deid.restore(step.text, style="name"), calls_record, _finish_status()

        if step.raw_content is not None:
            contents.append(step.raw_content)

        response_parts = []
        for name, args in step.function_calls:
            # 핸들러·기록(되돌리기 근거)은 실제 학번을 본다. 모델에 돌려주는
            # 결과만 다시 가린다.
            args = _restore_tool_args(args, deid)
            inverses: list[dict] = []
            if calls_used >= STEP_BUDGET:
                result: dict = {
                    "error": (
                        f"툴 호출 예산(턴당 {STEP_BUDGET}회)을 소진했습니다."
                        " 지금까지의 결과로 답하세요."
                    )
                }
            elif name in GLOBAL_TOOL_HANDLERS:
                calls_used += 1
                if global_solved:
                    result = {
                        "error": (
                            "재생성을 유발하는 조정은 턴당 1회만 가능합니다."
                            " 추가 조정은 결과를 본 뒤 다음 메시지로 요청하세요."
                        )
                    }
                    writes_failed += 1
                else:
                    try:
                        result, inverse = GLOBAL_TOOL_HANDLERS[name](
                            db, session, args, calls_record
                        )
                        inverses = [inverse] if inverse is not None else []
                        if result.get("ok"):
                            global_solved = True  # 확인 요청 반환은 solve가 안 돈 것
                            writes_ok += 1
                    except ResolveFailed as e:
                        # solve를 실제로 소모한 실패 — 턴당 1회를 소진시켜
                        # 실패 반복으로 한 턴에 solve가 여러 번 도는 우회를 막는다
                        result = {"error": str(e)}
                        writes_failed += 1
                        global_solved = True
                    except ValueError as e:
                        result = {"error": str(e)}
                        writes_failed += 1
                    except Exception:
                        logger.exception("전역 툴 %s 실행 중 예상 밖 오류", name)
                        result = {"error": "툴 실행에 실패했습니다."}
                        writes_failed += 1
            elif name in WRITE_TOOL_HANDLERS:
                calls_used += 1
                try:
                    result, inverses = WRITE_TOOL_HANDLERS[name](db, session, args)
                    # 성공한 편집 건수를 센다 — 한 호출이 여러 건을 고칠 수 있어
                    # "호출 1회 = 변경 1건"이 더는 성립하지 않는다 (#222)
                    writes_ok += result.get("applied_count", 1)
                except HTTPException as e:
                    # 겹침·주간 상한·draft 아님 등 — 사유를 모델에 돌려주고 계속
                    result = {"error": str(e.detail)}
                    writes_failed += 1
                except ValueError as e:
                    result = {"error": str(e)}
                    writes_failed += 1
                except Exception:
                    logger.exception("쓰기 툴 %s 실행 중 예상 밖 오류", name)
                    result = {"error": "툴 실행에 실패했습니다."}
                    writes_failed += 1
            else:
                calls_used += 1
                handler = READ_TOOL_HANDLERS.get(name)
                if handler is None:
                    result = {"error": f"알 수 없는 툴입니다: {name}"}
                else:
                    try:
                        result = handler(db, session, args)
                    except ValueError as e:
                        result = {"error": str(e)}
                    except Exception:
                        logger.exception("툴 %s 실행 중 예상 밖 오류", name)
                        result = {"error": "툴 실행에 실패했습니다."}
            entry = {"tool": name, "args": args, "result": result}
            if inverses:
                entry["inverses"] = inverses  # 되돌리기의 근거 — 쓰기 성공에만 존재
            calls_record.append(entry)
            response_parts.append(
                types.Part.from_function_response(
                    name=name, response=deid.mask_data(result)
                )
            )
        contents.append(types.Content(role="user", parts=response_parts))

    # 예산 소진 통보 후에도 모델이 툴 호출을 고집한 경우 (섹션 6.4) —
    # 이미 적용된 쓰기는 남아 있으므로 사용자가 턴을 통째로 되돌릴 수 있다
    return (
        "요청이 너무 커서 중간에 멈췄습니다. 지금까지 적용된 변경은 되돌릴 수 있습니다."
        if writes_ok
        else "요청이 너무 커서 중간에 멈췄습니다. 더 작게 나눠서 다시 요청해주세요.",
        calls_record,
        "budget_exceeded",
    )
