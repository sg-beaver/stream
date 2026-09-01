"""배율 반올림으로 상대 우선순위가 틀어지던 문제 회귀 테스트 (#110).

`add_penalty`는 CP-SAT 계수를 정수로 만들어야 해서 `round(weight * scale)`을
썼는데, 가중치가 작을수록 반올림 손실이 커서 **전 항목에 같은 배율을 걸어도
카테고리마다 실효 배율이 달라졌다** — ×0.5에서 non_campus_day 5→2(0.400배),
exam_proximity 25→12(0.480배), preference_match 3→2(0.667배).

수정: 배율이 정수가 아닐 때만 모든 항에 공통 분모(_WEIGHT_PRECISION)를 곱해
해상도를 올리고, 결과를 낼 때 다시 나눠 예전과 같은 단위로 보고한다.
"""

import pytest

from app.schemas import ADJUSTABLE_PENALTY_CATEGORIES
from app.scheduler.engine.solver import ScheduleSolver
from tests.scheduler.test_work_slot_blocks import (
    ALL_OPEN,
    MONDAY,
    make_calendar,
    make_policy,
    make_student,
)

# 반올림 손실이 가장 크게 났던 세 가지 — 작은 가중치일수록 심하다
SAMPLE_WEIGHTS = [
    ("preference_match", 3),
    ("exam_proximity", 25),
    ("non_campus_day", 5),
]


def build_context(scales: dict[str, float]):
    policy = make_policy()
    policy.soft_weight_scales = dict(scales)
    solver = ScheduleSolver(
        policy, make_calendar(), [make_student("A", dict(ALL_OPEN))], MONDAY, 5
    )
    return solver.build_context()


def effective_scales(ctx) -> list[float]:
    """add_penalty가 실제로 적용한 배율 (모델 계수 ÷ 원래 가중치)."""
    start = len(ctx.penalty_terms)
    var = ctx.new_bool("probe")
    for name, weight in SAMPLE_WEIGHTS:
        ctx.add_penalty(name, weight, var)
    added = ctx.penalty_terms[start:]
    return [
        term.weight / (weight * ctx.weight_precision)
        for term, (_, weight) in zip(added, SAMPLE_WEIGHTS)
    ]


@pytest.mark.parametrize("scale", [0.5, 1.5])
def test_uniform_fractional_scale_stays_uniform(scale):
    """전 항목에 같은 소수 배율 → 실효 배율도 전부 같아야 한다 (수정 전 0.400~0.667)."""
    ctx = build_context({c: scale for c in ADJUSTABLE_PENALTY_CATEGORIES})
    assert effective_scales(ctx) == [scale, scale, scale]


def test_repeating_decimal_scale_error_stays_under_one_percent():
    """챗봇의 '한 단계 내리기'(1/1.5)처럼 딱 떨어지지 않는 배율도 오차가 작아야 한다."""
    scale = 1.0 / 1.5
    ctx = build_context({c: scale for c in ADJUSTABLE_PENALTY_CATEGORIES})
    for effective in effective_scales(ctx):
        assert abs(effective - scale) / scale < 0.01


def test_integer_scales_keep_policy_weight_units():
    """정수 배율만 쓰면 공통 분모를 곱하지 않는다 — 기존 목적값이 그대로 유지된다."""
    assert build_context({}).weight_precision == 1
    assert build_context({c: 1.0 for c in ADJUSTABLE_PENALTY_CATEGORIES}).weight_precision == 1
    assert build_context({"meal_break": 2.0}).weight_precision == 1
    assert build_context({"meal_break": 0.5}).weight_precision > 1


def test_reported_numbers_use_policy_weight_units():
    """소수 배율을 써도 목적값·페널티 내역은 정책 파일 가중치 단위로 보고한다.

    공통 분모가 그대로 새어 나가면 화면의 '총 페널티'가 100배로 뛴다.
    """
    policy = make_policy()
    policy.soft_weight_scales = {c: 0.5 for c in ADJUSTABLE_PENALTY_CATEGORIES}
    students = [make_student(sid, dict(ALL_OPEN)) for sid in ("A", "B")]
    scaled, _ = ScheduleSolver(
        policy, make_calendar(), students, MONDAY, 5
    ).solve()
    plain, _ = ScheduleSolver(
        make_policy(), make_calendar(), students, MONDAY, 5
    ).solve()

    assert scaled.is_feasible and plain.is_feasible
    # 배율 0.5이므로 같은 단위에서 절반 근처여야 한다 — 100배 단위로 새어 나오면 실패
    assert scaled.objective_value <= plain.objective_value
    assert scaled.objective_value * 4 >= plain.objective_value
    # 카테고리 합계도 같은 단위여야 목적값과 견줄 수 있다
    assert sum(scaled.penalty_breakdown.values()) == pytest.approx(
        scaled.objective_value, abs=len(scaled.penalty_breakdown)
    )
