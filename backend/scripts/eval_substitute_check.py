"""대타 승인 AI 적합성 검사(ai-check) 프롬프트 검출력 평가 스크립트.

scripts/eval_review.py와 같은 원칙 — DB 없이 가짜 객체로 프롬프트를 만들되,
비식별화는 프로덕션(get_ai_check)과 같은 자리에서 한다: 마스킹 → 호출 → 복원.
CI 밖 수동 실행용, quota 고려해 케이스 2개만 최소 구성한다 (구현가이드 5단계 2번).

사용법 (backend/ 디렉토리에서, GEMINI_API_KEY는 .env 또는 환경변수):
    python3 scripts/eval_substitute_check.py                 # 각 케이스 1회
    python3 scripts/eval_substitute_check.py --case ok        # 정상 적합 케이스만
    python3 scripts/eval_substitute_check.py --case clarify   # 되묻기 케이스만
    python3 scripts/eval_substitute_check.py --verbose        # AI 응답 전문 출력
"""

import argparse
import sys
from datetime import date, time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from app.scheduler import deidentify  # noqa: E402
from app.scheduler import substitute_check as sc_module  # noqa: E402
from app.scheduler.review import ReviewUnavailable  # noqa: E402


def _make_request(reason="시험 일정과 겹침", substitute_id="20222222"):
    return SimpleNamespace(
        reason=reason,
        requester_id="20221111",
        requester=SimpleNamespace(student_id="20221111", name="학생A"),
        substitute_id=substitute_id,
    )


def _make_schedule(department_id=1):
    return SimpleNamespace(
        department_id=department_id,
        work_date=date(2026, 8, 7),  # 금요일
        start_time=time(18, 0),
        end_time=time(22, 0),
    )


def _make_policy(**overrides):
    defaults = dict(opening_hours=None, min_per_slot=None, max_per_slot=None, biweekly_max_hours=None)
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


CASES = {
    "ok": {
        "name": "정상 적합 (되묻기 없음)",
        "custom_rules": "대타 학생은 근무 시간대에 가능 시간이 등록되어 있어야 한다.",
        "student": SimpleNamespace(
            student_id="20222222", name="학생B", tenure_start_date=date(2023, 3, 2)
        ),
        "availabilities": [
            SimpleNamespace(day_of_week=5, start_time=time(13, 0), end_time=time(22, 0))
        ],
    },
    "clarify": {
        "name": "학생 데이터 결손 → 되묻기 발생",
        "custom_rules": "금요일 마감 시간대(17시 이후)에는 경험자가 최소 1명 있어야 한다.",
        "student": SimpleNamespace(student_id="20222222", name="학생B", tenure_start_date=None),
        "availabilities": [
            SimpleNamespace(day_of_week=5, start_time=time(13, 0), end_time=time(22, 0))
        ],
    },
}


def _build_deidentifier(case: dict, request) -> "deidentify.Deidentifier":
    """케이스에 나오는 학생 전원으로 비식별화 매핑을 만든다 (#200).

    프로덕션(`get_ai_check`)이 `build_for_department`로 부서 소속 전원을 넣는
    자리에 대응한다. 하네스에는 DB가 없어 부서를 조회할 수 없으므로, 프롬프트에
    실제로 등장하는 두 명 — 대타 후보(케이스 학생)와 원 근무자(요청자) — 을
    직접 넣는다. 하네스가 이걸 빠뜨리면 **실제로는 나가지 않는 프롬프트로
    검출력을 재게 된다**: 프로덕션은 별칭을 보는데 하네스만 실명을 보는 상태.
    """
    student = case["student"]
    requester = request.requester
    return deidentify.build_for_students(
        [
            (student.student_id, getattr(student, "name", None)),
            (requester.student_id, getattr(requester, "name", None)),
        ]
    )


def run_case(case_key: str, verbose: bool) -> bool:
    case = CASES[case_key]
    request = _make_request()
    schedule = _make_schedule()
    policy = _make_policy()
    contents = sc_module._build_check_prompt(
        request, schedule, case["custom_rules"], policy, case["student"], case["availabilities"], {}
    )
    # 프로덕션(get_ai_check)과 같은 자리에서 비식별화한다 (#200, substitute_check.py:182-191).
    # 이 두 줄이 없으면 하네스는 실명 프롬프트를, 서비스는 별칭 프롬프트를 쓰게 되어
    # 여기서 잰 검출력이 실제 검출력이 아니게 된다.
    # `LLM_DEIDENTIFY=0`으로 돌리면 마스킹 없이 같은 케이스를 재서 A/B로 비교할 수 있다.
    deid = _build_deidentifier(case, request)
    contents = deid.mask(contents)
    try:
        # 판정이 학번·되묻기 대상을 실제 값으로 훑으므로 복원은 판정 **전에** 한다.
        result = sc_module._restore_check_result(sc_module._call_gemini_check(contents), deid)
    except ReviewUnavailable as exc:
        print(f"[{case['name']}] AI 호출 실패: {exc.reason}")
        return False

    if verbose:
        import json

        print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))

    if case_key == "ok":
        ok = result.overall_verdict == "적합" and not result.clarification_requests
        if not ok:
            print(
                f"[FAIL] {case['name']}: verdict={result.overall_verdict}, "
                f"clarification_requests={len(result.clarification_requests)}건 (기대: 적합 + 0건)"
            )
        else:
            print(f"[PASS] {case['name']}")
        return ok

    if case_key == "clarify":
        has_student_clarification = any(
            c.target_type == "student" for c in result.clarification_requests
        )
        verdict_forced = result.overall_verdict == "판단불가"
        ok = has_student_clarification and verdict_forced
        if not ok:
            print(
                f"[FAIL] {case['name']}: verdict={result.overall_verdict}, "
                f"student 되묻기 발생={has_student_clarification} (기대: student 되묻기 + 판단불가)"
            )
        else:
            print(f"[PASS] {case['name']}")
        return ok

    raise ValueError(case_key)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=list(CASES), help="이 케이스만 실행")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    keys = [args.case] if args.case else list(CASES)
    results = [run_case(k, args.verbose) for k in keys]
    print(f"\n{sum(results)}/{len(results)} 통과")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
