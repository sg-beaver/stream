"""근무표 AI 검토 프롬프트 검출력 평가 스크립트 (이슈 #80).

tests/scheduler/test_review_live.py가 핵심 케이스의 합격/불합격을 보는
통합 테스트라면, 이 스크립트는 더 넓은 위반 케이스 세트를 실제 Gemini로
돌려 검출률과 오탐(위반 없는데 critical) 여부를 측정한다. CI 밖 수동 실행용.

DB 없이 동작한다 — _build_prompt가 쓰는 필드만 채운 가짜 객체로 프롬프트를
만들고 _call_gemini를 직접 부른다.

사용법 (backend/ 디렉토리에서, GEMINI_API_KEY는 .env 또는 환경변수):
    python3 scripts/eval_review.py               # 각 케이스 1회
    python3 scripts/eval_review.py --repeat 3    # 케이스당 3회 돌려 검출률 측정
    python3 scripts/eval_review.py --verbose     # AI 응답 전문 출력
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import date, time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from app.scheduler import review as review_module  # noqa: E402
from app.scheduler.review import ReviewUnavailable  # noqa: E402

# 2026-08-01(토) ~ 2026-08-07(금). 일요일=08-02, 월요일=08-03, 금요일=08-07.
PERIOD_START = date(2026, 8, 1)
PERIOD_END = date(2026, 8, 7)

OPENING_9_TO_22 = {
    "semester": {str(d): [["09:00", "22:00"]] for d in range(1, 6)}
}


@dataclass
class Case:
    name: str
    custom_rules: str
    schedules: list  # (student_id, work_date, start, end)
    per_student: list = field(default_factory=list)
    policy: dict = field(default_factory=dict)  # opening_hours 등 부서 운영 정보
    # 각 그룹은 "위반 finding(critical/warning) 중 하나에 그룹 내 키워드가 하나라도
    # 포함"되어야 검출 성공. 빈 목록이면 위반이 없는 케이스.
    expect_hits: list = field(default_factory=list)
    forbid_critical: bool = False  # 오탐 검사 — critical이 하나라도 나오면 실패
    expect_summary: list = field(default_factory=list)  # summary에 있어야 할 키워드(any)


CASES = [
    Case(
        name="주당 상한 초과",
        custom_rules="한 학생은 주당 12시간을 초과해 근무할 수 없다",
        schedules=[
            ("20221234", date(2026, 8, d), time(9, 0), time(13, 0))
            for d in (3, 4, 5, 6)  # 16시간
        ]
        + [("20225678", date(2026, 8, 3), time(13, 0), time(17, 0))],  # 4시간
        per_student=[
            {"student_id": "20221234", "total_hours": 16},
            {"student_id": "20225678", "total_hours": 4},
        ],
        expect_hits=[["20221234"]],
    ),
    Case(
        name="일요일 배정 금지",
        custom_rules="일요일에는 근무를 배정하지 않는다",
        schedules=[
            ("20221234", date(2026, 8, 2), time(9, 0), time(13, 0)),  # 일요일
            ("20225678", date(2026, 8, 3), time(9, 0), time(13, 0)),
        ],
        expect_hits=[["08-02", "일요일"]],
    ),
    Case(
        name="오전 최소 인원 미달",
        custom_rules="평일 09:00-13:00에는 최소 2명이 함께 근무해야 한다",
        schedules=[
            ("20221234", date(2026, 8, 3), time(9, 0), time(13, 0)),  # 월 1명 (위반)
            ("20221234", date(2026, 8, 4), time(9, 0), time(13, 0)),  # 화 2명 (준수)
            ("20225678", date(2026, 8, 4), time(9, 0), time(13, 0)),
        ],
        expect_hits=[["08-03", "월요일"]],
    ),
    Case(
        name="마감 시간대 공백 (개관 시간 참조)",
        custom_rules="마감 1시간 전부터는 반드시 1명 이상 근무해야 한다",
        schedules=[
            ("20221234", date(2026, 8, 3), time(9, 0), time(17, 0)),
            ("20225678", date(2026, 8, 4), time(9, 0), time(17, 0)),
        ],
        policy={"opening_hours": OPENING_9_TO_22},
        expect_hits=[["21:00", "마감"]],
    ),
    Case(
        name="하루 연속 근무 상한 초과",
        custom_rules="한 학생을 하루 6시간 초과해 배정하지 않는다",
        schedules=[
            ("20221234", date(2026, 8, 3), time(9, 0), time(17, 0)),  # 8시간
            ("20225678", date(2026, 8, 4), time(9, 0), time(13, 0)),  # 4시간
        ],
        expect_hits=[["20221234"]],
    ),
    Case(
        name="복수 규칙 동시 위반",
        custom_rules=(
            "일요일에는 근무를 배정하지 않는다\n"
            "한 학생은 주당 12시간을 초과해 근무할 수 없다"
        ),
        schedules=[
            ("20221234", date(2026, 8, d), time(9, 0), time(13, 0))
            for d in (3, 4, 5, 6)  # 16시간
        ]
        + [("20225678", date(2026, 8, 2), time(9, 0), time(13, 0))],  # 일요일
        per_student=[
            {"student_id": "20221234", "total_hours": 16},
            {"student_id": "20225678", "total_hours": 4},
        ],
        expect_hits=[["20221234"], ["08-02", "일요일"]],
    ),
    Case(
        name="위반 없음 (오탐 검사)",
        custom_rules="한 학생은 주당 12시간을 초과해 근무할 수 없다",
        schedules=[
            ("20221234", date(2026, 8, 3), time(9, 0), time(13, 0)),
            ("20221234", date(2026, 8, 5), time(9, 0), time(13, 0)),
        ],
        per_student=[{"student_id": "20221234", "total_hours": 8}],
        forbid_critical=True,
    ),
    Case(
        name="확인 불가 규칙 (신입/경력)",
        custom_rules="금요일 마감 시간대엔 경력자가 최소 1명 있어야 한다",
        schedules=[("20221234", date(2026, 8, 7), time(18, 0), time(22, 0))],
        forbid_critical=True,
        expect_summary=["경력", "신입", "확인"],
    ),
]


def _fake_inputs(case: Case):
    batch = SimpleNamespace(
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        solver_summary={
            "shortages": [],
            "penalty_summary": {},
            "per_student": case.per_student,
        },
    )
    schedules = [
        SimpleNamespace(
            student_id=student_id, work_date=work_date, start_time=start, end_time=end
        )
        for student_id, work_date, start, end in case.schedules
    ]
    policy = SimpleNamespace(
        opening_hours=case.policy.get("opening_hours"),
        min_per_slot=case.policy.get("min_per_slot"),
        max_per_slot=case.policy.get("max_per_slot"),
        biweekly_max_hours=case.policy.get("biweekly_max_hours"),
    )
    return batch, schedules, policy


def _finding_text(finding) -> str:
    return " ".join(
        str(v)
        for v in (finding.rule, finding.evidence, finding.message, finding.suggestion)
        if v
    )


def run_case(case: Case, verbose: bool) -> tuple[bool, list[str]]:
    """(성공 여부, 실패 사유 목록)을 돌려준다."""
    batch, schedules, policy = _fake_inputs(case)
    contents = review_module._build_prompt(batch, case.custom_rules, schedules, policy)
    result = review_module._call_gemini(contents)
    if verbose:
        print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))

    problems = []
    violations = [f for f in result.findings if f.severity in ("critical", "warning")]

    for group in case.expect_hits:
        hits = [
            f for f in violations if any(kw in _finding_text(f) for kw in group)
        ]
        if not hits:
            problems.append(f"미검출: {group} 관련 위반 finding 없음")
            continue
        # 완료 기준(근거·대안) — 위반 finding엔 evidence/suggestion이 있어야 한다
        if not hits[0].evidence:
            problems.append(f"근거 누락: {group} finding에 evidence 없음")
        if not hits[0].suggestion:
            problems.append(f"대안 누락: {group} finding에 suggestion 없음")

    if case.forbid_critical:
        criticals = [f for f in result.findings if f.severity == "critical"]
        if criticals:
            problems.append(
                f"오탐: critical {len(criticals)}건 — {_finding_text(criticals[0])[:80]}"
            )

    if case.expect_summary and not any(kw in result.summary for kw in case.expect_summary):
        problems.append(f"summary에 {case.expect_summary} 중 어느 키워드도 없음: {result.summary}")

    return (not problems), problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=1, help="케이스당 반복 횟수")
    parser.add_argument("--verbose", action="store_true", help="AI 응답 전문 출력")
    parser.add_argument("--case", help="이름에 이 문자열이 들어간 케이스만 실행")
    args = parser.parse_args()

    cases = [c for c in CASES if not args.case or args.case in c.name]
    if not cases:
        print(f"'{args.case}'와 일치하는 케이스가 없습니다.")
        return 1

    # 쿼터 소진 등 AI 호출 실패는 검출 실패가 아니므로 분모에서 뺀다 —
    # 무료 티어(일 20회) 특성상 반복 측정 중 흔히 만난다.
    total_runs = 0
    total_pass = 0
    total_error = 0
    lines = []
    for case in cases:
        passes = 0
        errors = 0
        reasons = []
        for i in range(args.repeat):
            print(f"[{case.name}] {i + 1}/{args.repeat} 실행 중...", flush=True)
            try:
                ok, problems = run_case(case, args.verbose)
            except ReviewUnavailable as exc:
                errors += 1
                reasons.append(f"AI 호출 실패({exc.reason}) — 검출률 집계에서 제외")
                continue
            passes += ok
            reasons.extend(problems)
        completed = args.repeat - errors
        total_runs += completed
        total_pass += passes
        total_error += errors
        mark = "PASS" if passes == completed else ("SKIP" if completed == 0 else "FAIL")
        lines.append(f"  [{mark}] {case.name}: {passes}/{completed} (호출 실패 {errors}건)")
        for r in reasons:
            lines.append(f"         - {r}")

    print("\n=== 검출력 평가 결과 ===")
    print("\n".join(lines))
    if total_runs:
        print(f"\n검출률: {total_pass}/{total_runs} ({total_pass / total_runs:.0%})", end="")
    else:
        print("\n검출률: 측정 불가 (완료된 호출 없음)", end="")
    print(f" / AI 호출 실패 {total_error}건")
    return 0 if total_runs and total_pass == total_runs else 1


if __name__ == "__main__":
    sys.exit(main())
