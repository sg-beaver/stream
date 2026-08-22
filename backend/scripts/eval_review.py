"""근무표 AI 검토 프롬프트 검출력 평가 스크립트 (이슈 #80).

tests/scheduler/test_review_live.py가 핵심 케이스의 합격/불합격을 보는
통합 테스트라면, 이 스크립트는 더 넓은 위반 케이스 세트를 실제 Gemini로
돌려 검출률과 오탐(위반 없는데 critical) 여부를 측정한다. CI 밖 수동 실행용.

DB 없이 동작한다 — _build_prompt가 쓰는 필드만 채운 가짜 객체로 프롬프트를
만들고 _call_gemini를 직접 부른다.

케이스는 코드가 아니라 scripts/eval_review_cases.json에서 관리한다 — 케이스
추가·수정에 코드 변경이 필요 없다 (필드 설명은 그 파일의 _readme 참고).

사용법 (backend/ 디렉토리에서, GEMINI_API_KEY는 .env 또는 환경변수):
    python3 scripts/eval_review.py               # 각 케이스 1회
    python3 scripts/eval_review.py --repeat 3    # 케이스당 3회 돌려 검출률 측정
    python3 scripts/eval_review.py --verbose     # AI 응답 전문 출력
    python3 scripts/eval_review.py --out output/eval_2026-08-24.json
                                                 # 결과를 JSON으로 저장 (프롬프트
                                                 # 수정 전후 검출률 비교용)
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from app.scheduler import review as review_module  # noqa: E402
from app.scheduler.review import ReviewResult, ReviewUnavailable  # noqa: E402

CASES_PATH = Path(__file__).with_name("eval_review_cases.json")

# 케이스에 period를 명시하지 않으면 쓰는 기본 기간.
# 2026-08-01(토) ~ 2026-08-07(금). 일요일=08-02, 월요일=08-03.
DEFAULT_PERIOD_START = date(2026, 8, 1)
DEFAULT_PERIOD_END = date(2026, 8, 7)


@dataclass
class Case:
    id: str  # ASCII 식별자 — pytest -k / --case 선택용 (한글 name은 표시용)
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
    period_start: date = DEFAULT_PERIOD_START
    period_end: date = DEFAULT_PERIOD_END


def load_cases(path: Path = CASES_PATH) -> list[Case]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    cases = []
    for item in raw["cases"]:
        cases.append(
            Case(
                id=item["id"],
                name=item["name"],
                custom_rules=item["custom_rules"],
                schedules=[
                    (
                        s["student_id"],
                        date.fromisoformat(s["date"]),
                        time.fromisoformat(s["start"]),
                        time.fromisoformat(s["end"]),
                    )
                    for s in item["schedules"]
                ],
                per_student=item.get("per_student", []),
                policy=item.get("policy", {}),
                expect_hits=item.get("expect_hits", []),
                forbid_critical=item.get("forbid_critical", False),
                expect_summary=item.get("expect_summary", []),
                period_start=date.fromisoformat(
                    item.get("period_start", DEFAULT_PERIOD_START.isoformat())
                ),
                period_end=date.fromisoformat(
                    item.get("period_end", DEFAULT_PERIOD_END.isoformat())
                ),
            )
        )
    return cases


def _fake_inputs(case: Case):
    batch = SimpleNamespace(
        period_start=case.period_start,
        period_end=case.period_end,
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


def check_result(case: Case, result: "ReviewResult") -> list[str]:
    """케이스 기대치 대비 검토 결과의 문제 목록 — 비어 있으면 통과.

    tests/scheduler/test_review_live.py도 이 함수를 가져다 써서, 케이스와
    판정 기준이 eval/테스트 간에 어긋나지 않게 한다.
    """
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

    return problems


def run_case(case: Case, verbose: bool) -> tuple[bool, list[str], "ReviewResult"]:
    """(성공 여부, 실패 사유 목록, AI 검토 결과)를 돌려준다."""
    batch, schedules, policy = _fake_inputs(case)
    contents = review_module._build_prompt(batch, case.custom_rules, schedules, policy)
    result = review_module._call_gemini(contents)
    if verbose:
        print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
    problems = check_result(case, result)
    return (not problems), problems, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=1, help="케이스당 반복 횟수")
    parser.add_argument("--verbose", action="store_true", help="AI 응답 전문 출력")
    parser.add_argument("--case", help="id나 이름에 이 문자열이 들어간 케이스만 실행")
    parser.add_argument(
        "--out",
        help="실행 결과(케이스별 판정·AI 응답 전문·검출률)를 저장할 JSON 파일 경로 — "
        "프롬프트 수정 전후의 검출률 비교용",
    )
    args = parser.parse_args()

    cases = [
        c
        for c in load_cases()
        if not args.case or args.case in c.name or args.case in c.id
    ]
    if not cases:
        print(f"'{args.case}'와 일치하는 케이스가 없습니다.")
        return 1

    # 쿼터 소진 등 AI 호출 실패는 검출 실패가 아니므로 분모에서 뺀다 —
    # 무료 티어(일 20회) 특성상 반복 측정 중 흔히 만난다.
    total_runs = 0
    total_pass = 0
    total_error = 0
    lines = []
    case_reports = []
    for case in cases:
        passes = 0
        errors = 0
        reasons = []
        runs = []
        for i in range(args.repeat):
            print(f"[{case.name}] {i + 1}/{args.repeat} 실행 중...", flush=True)
            try:
                ok, problems, result = run_case(case, args.verbose)
            except ReviewUnavailable as exc:
                errors += 1
                reasons.append(f"AI 호출 실패({exc.reason}) — 검출률 집계에서 제외")
                runs.append({"ok": None, "error": exc.reason, "problems": [], "review": None})
                continue
            passes += ok
            reasons.extend(problems)
            runs.append(
                {"ok": ok, "error": None, "problems": problems, "review": result.model_dump()}
            )
        completed = args.repeat - errors
        total_runs += completed
        total_pass += passes
        total_error += errors
        mark = "PASS" if passes == completed else ("SKIP" if completed == 0 else "FAIL")
        lines.append(f"  [{mark}] {case.name}: {passes}/{completed} (호출 실패 {errors}건)")
        for r in reasons:
            lines.append(f"         - {r}")
        case_reports.append(
            {"id": case.id, "name": case.name, "pass": passes, "completed": completed, "runs": runs}
        )

    print("\n=== 검출력 평가 결과 ===")
    print("\n".join(lines))
    if total_runs:
        print(f"\n검출률: {total_pass}/{total_runs} ({total_pass / total_runs:.0%})", end="")
    else:
        print("\n검출률: 측정 불가 (완료된 호출 없음)", end="")
    print(f" / AI 호출 실패 {total_error}건")

    if args.out:
        report = {
            "started_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "model": review_module.MODEL,
            "repeat": args.repeat,
            "case_filter": args.case,
            "detect_pass": total_pass,
            "detect_total": total_runs,
            "call_errors": total_error,
            "cases": case_reports,
        }
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"결과 저장: {out_path}")

    return 0 if total_runs and total_pass == total_runs else 1


if __name__ == "__main__":
    sys.exit(main())
