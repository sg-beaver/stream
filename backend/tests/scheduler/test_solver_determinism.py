"""솔버 재현성 회귀 테스트 (#132·#143).

동일 입력 2회 실행이 동일한 배정을 내야 한다 — interleave_search + 고정
워커 수 + 고정 seed 설정의 회귀 방지. 이 보장이 깨지면 챗봇 가중치 조정
(#136)의 penalty before/after 비교가 solver 노이즈와 구분되지 않는다.

기존 test_work_slot_blocks의 free-grid 동일성 테스트가 이 설정 도입 전
5회 중 1회꼴로 간헐 실패했다 (#132 코멘트의 실측) — 같은 성질을 여기서
명시적으로 고정한다.
"""

from tests.scheduler.test_work_slot_blocks import (  # noqa: F401
    ALL_OPEN,
    make_policy,
    make_student,
    solve,
)


def _assigned_set(result):
    return {
        (sid, day, minute)
        for day, by_slot in result.assignments.items()
        for minute, sids in by_slot.items()
        for sid in sids
    }


def test_same_input_twice_is_identical():
    """동일 입력 2회 → 배정·목적값 완전 일치 (#132 완료 조건)."""
    students = [
        make_student("A", dict(ALL_OPEN)),
        make_student("B", dict(ALL_OPEN)),
        make_student("C", dict(ALL_OPEN)),
    ]
    r1, _ = solve(make_policy(), students)
    r2, _ = solve(make_policy(), students)
    assert r1.is_feasible and r2.is_feasible
    assert r1.objective_value == r2.objective_value
    assert _assigned_set(r1) == _assigned_set(r2)


def test_bound_is_recorded():
    """best_objective_bound가 기록된다 — 격차 한계 종료 시 품질 검증 근거 (#143)."""
    students = [make_student("A", dict(ALL_OPEN))]
    result, _ = solve(make_policy(), students)
    assert result.is_feasible
    assert result.best_objective_bound is not None
    # 하한은 목적값을 넘을 수 없다 (최소화 문제)
    assert result.best_objective_bound <= result.objective_value
