"""대타 승인 AI 적합성 검사(ai-check) 프롬프트 검출력 평가 스크립트.

scripts/eval_review.py와 같은 원칙 — DB 없이 가짜 객체로 프롬프트를 만들고
_call_gemini_check를 직접 부른다. CI 밖 수동 실행용, quota 고려해 케이스
2개만 최소 구성한다 (구현가이드 5단계 2번).

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


def run_case(case_key: str, verbose: bool) -> bool:
    case = CASES[case_key]
    request = _make_request()
    schedule = _make_schedule()
    policy = _make_policy()
    contents = sc_module._build_check_prompt(
        request, schedule, case["custom_rules"], policy, case["student"], case["availabilities"], {}
    )
    try:
        result = sc_module._call_gemini_check(contents)
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
