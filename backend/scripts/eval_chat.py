"""시간표 검토 챗봇 툴 사용·안전성 평가 스크립트 (이슈 #195).

검토 하네스(scripts/eval_review.py)의 챗봇판이다. 챗봇에는 지금까지 계측기가
없었다 — tests/scheduler/test_chat_live.py 5건이 전부였고, 그마저 fixture가
깨져 한동안 통째로 에러였다(#195). 챗봇은 검토 AI와 달리 **draft를 직접
고치므로**, 틀렸을 때의 비용이 다르다.

재는 축:
- 툴 선택 정확도 — 물어본 것에 맞는 툴을 부르는가
- find_schedules 선행률 — schedule_id를 추측하지 않고 조회하는가 (설계 0.3)
- 요청하지 않은 수정 비율 — 질문했는데 근무표를 고치는가
- hard 제약을 깨는 편집 비율 — 편집 결과에 new_violations가 붙는가 (#197)
- 예산 소진률 · 턴당 툴 호출 수 · 응답 시간 · 토큰

케이스는 코드가 아니라 scripts/eval_chat_cases.json에서 관리한다
(필드 설명은 그 파일의 _readme 참고).

**케이스마다 in-memory sqlite를 새로 만든다.** 챗봇은 쓰기 툴을 가지고 있어
개발 DB를 그대로 쓰면 실제 draft가 바뀐다 — 테스트(conftest.py)와 같은 격리
방식을 쓴다.

사용법 (backend/ 디렉토리에서, GEMINI_API_KEY 필요):
    python3 scripts/eval_chat.py                      # 케이스당 1회
    python3 scripts/eval_chat.py --repeat 3           # 케이스당 3회 — 비율 측정
    python3 scripts/eval_chat.py --case edit          # id/이름에 포함된 것만
    python3 scripts/eval_chat.py --tier guard         # 층만
    python3 scripts/eval_chat.py --verbose            # 답변·툴 호출 전문
    python3 scripts/eval_chat.py --out output/chat_2026-08-30.json
"""

import argparse
import datetime
import json
import sys
import time as time_module
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):
    """conftest.py와 같은 shim — sqlite에는 JSONB가 없다. 테스트 경로에서만 쓴다."""
    return "JSON"


from app import models  # noqa: E402
from app.database import Base  # noqa: E402
from app.scheduler import chat as chat_module  # noqa: E402

CASES_PATH = Path(__file__).with_name("eval_chat_cases.json")

MONDAY = datetime.date(2026, 9, 7)
PERIOD_END = MONDAY + datetime.timedelta(days=13)


def _t(hhmm: str) -> datetime.time:
    return datetime.time(*map(int, hhmm.split(":")))


@dataclass
class Case:
    id: str
    name: str
    tier: str
    scenario: str
    message: str
    expect_tools: list = field(default_factory=list)
    forbid_tools: list = field(default_factory=list)
    expect_before: Optional[dict] = None
    expect_write: Optional[bool] = None
    expect_text_any: list = field(default_factory=list)
    expect_new_violations: Optional[bool] = None
    expect_final_schedules: Optional[list] = None
    expect_status: Optional[str] = None
    has_expect_status: bool = False  # null 기대와 "검사 안 함"을 구분한다
    fake_solve: bool = False


def load_cases(path: Path = CASES_PATH) -> list[Case]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [
        Case(
            id=item["id"],
            name=item["name"],
            tier=item.get("tier", "basic"),
            scenario=item.get("scenario", "simple"),
            message=item["message"],
            expect_tools=item.get("expect_tools", []),
            forbid_tools=item.get("forbid_tools", []),
            expect_before=item.get("expect_before"),
            expect_write=item.get("expect_write"),
            expect_text_any=item.get("expect_text_any", []),
            expect_new_violations=item.get("expect_new_violations"),
            expect_final_schedules=item.get("expect_final_schedules"),
            expect_status=item.get("expect_status"),
            has_expect_status="expect_status" in item,
            fake_solve=item.get("fake_solve", False),
        )
        for item in raw["cases"]
    ]


# ---------------------------------------------------------------------------
# 시나리오 — 케이스마다 새 in-memory DB에 세운다 (개발 DB 오염 방지)
# ---------------------------------------------------------------------------


def _new_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _scenario_simple(db):
    """학생 2명·가능 시간 월~금 09:00-18:00·draft 배정 3건.

    가능 시간을 채워 두는 것이 중요하다 — 비어 있으면 모든 배정이 HC-CLASS-1
    위반이라 "이번 편집이 새로 만든 위반"을 가려낼 수 없다.
    """
    dept = models.Department(name="정보서비스팀")
    db.add(dept)
    db.flush()
    db.add_all([
        models.Staff(staff_id="STF001", name="담당자",
                     department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="조수현", password_hash="x",
                       funding_type="gyobi"),
        models.Student(student_id="20222222", name="권지영", password_hash="x",
                       funding_type="gyobi"),
    ])
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db.add(posting)
    db.flush()
    db.add_all([
        models.Application(student_id=s, posting_id=posting.posting_id, status="합격")
        for s in ("20221111", "20222222")
    ])
    db.add_all([
        models.AvailableTime(student_id=s, day_of_week=d,
                             start_time=_t("09:00"), end_time=_t("18:00"), preference=2)
        for s in ("20221111", "20222222")
        for d in range(1, 6)
    ])

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END,
        solver_summary={
            "penalty_summary": {"meal_break": 40},
            "penalty_events": [
                {"name": "meal_break", "cost": 20, "amount": 1,
                 "student_id": "20221111", "day": MONDAY.isoformat(), "minute": None},
                {"name": "meal_break", "cost": 20, "amount": 1,
                 "student_id": "20221111",
                 "day": (MONDAY + datetime.timedelta(days=2)).isoformat(), "minute": None},
            ],
        },
    )
    db.add(draft)
    db.flush()
    for student_id, day_offset, start, end in [
        ("20221111", 0, "09:00", "13:00"),
        ("20222222", 1, "13:00", "17:00"),
        ("20222222", 3, "09:00", "12:00"),
    ]:
        db.add(models.WorkSchedule(
            batch_id=draft.batch_id, student_id=student_id,
            department_id=dept.department_id,
            work_date=MONDAY + datetime.timedelta(days=day_offset),
            start_time=_t(start), end_time=_t(end),
        ))
    session = models.ChatSession(
        department_id=dept.department_id, period_start=MONDAY, period_end=PERIOD_END,
        batch_id=draft.batch_id, created_by="STF001",
    )
    db.add(session)
    db.commit()
    return session


def _scenario_tight_staffing(db):
    """simple과 같되 부서 상한을 max_per_slot=1로 좁힌다.

    HC-STAFF-1(인원 초과)을 편집으로 유발하려면 상한이 낮아야 한다 — 기본
    정책(library_info_service)은 2명이라 두 명을 같은 칸에 넣어도 위반이 아니다.
    이 함정에 한 번 걸렸다: 상한을 안 좁힌 채 "인원 초과 편집" 케이스를 만들었더니
    위반이 생기지 않았는데도 모델이 "위반은 없습니다"라고 답했고, 키워드 "위반"이
    그 부정문에 매칭돼 거짓 통과했다.
    """
    session = _scenario_simple(db)
    db.add(models.DepartmentPolicy(
        department_id=session.department_id,
        availability_mode="weekly_only",
        min_per_slot=1,
        max_per_slot=1,
    ))
    db.commit()
    return session


SCENARIOS = {"simple": _scenario_simple, "tight_staffing": _scenario_tight_staffing}


def _install_fake_solve(monkey: list):
    """adjust_weight 케이스용 — 실제 CP-SAT를 돌리지 않는다.

    재solve 자체는 #136에서 검증된 경로이고, 여기서 재는 것은 "모델이 올바른
    카테고리·방향을 고르는가"다. 30초짜리 solve를 케이스마다 돌릴 이유가 없다.
    """
    import app.routers.schedule as schedule_router
    import app.scheduler.service as service_mod

    def _fake_generate(req, db):
        return {
            "status": "OPTIMAL", "solve_time_seconds": 7.0,
            "objective_value": 2100, "best_objective_bound": 2080,
            "schedules": [], "shortages": [],
            "penalty_summary": {"meal_break": 20},
            "penalty_events": [], "per_student": [],
        }

    def _fake_replace(db, *, department_id, period_start, period_end,
                      created_by, schedules, solver_summary):
        batch = models.ScheduleBatch(
            department_id=department_id, status="draft",
            period_start=period_start, period_end=period_end,
            solver_summary=solver_summary,
        )
        db.add(batch)
        db.flush()
        return batch.batch_id, len(schedules)

    monkey.append((service_mod, "generate_schedule", service_mod.generate_schedule))
    monkey.append((schedule_router, "_replace_draft_batch", schedule_router._replace_draft_batch))
    service_mod.generate_schedule = _fake_generate
    schedule_router._replace_draft_batch = _fake_replace


def _restore(monkey: list):
    for obj, name, original in reversed(monkey):
        setattr(obj, name, original)


# ---------------------------------------------------------------------------
# 판정
# ---------------------------------------------------------------------------

WRITE_TOOLS = ("move_schedule", "remove_schedule", "add_schedule", "adjust_weight")


def _successful_writes(calls: list) -> list:
    return [c for c in calls if c["tool"] in WRITE_TOOLS and c["result"].get("ok")]


def _final_schedules(db, session) -> list:
    rows = (
        db.query(models.WorkSchedule)
        .filter(models.WorkSchedule.batch_id == session.batch_id)
        .order_by(models.WorkSchedule.work_date, models.WorkSchedule.start_time)
        .all()
    )
    return [
        {
            "student_id": r.student_id,
            "date": r.work_date.isoformat(),
            "start": r.start_time.strftime("%H:%M"),
            "end": r.end_time.strftime("%H:%M"),
        }
        for r in rows
    ]


def check_result(case: Case, db, session, text: str, calls: list, status) -> list[str]:
    """케이스 기대치 대비 문제 목록 — 비어 있으면 통과."""
    problems = []
    tools = [c["tool"] for c in calls]

    for tool in case.expect_tools:
        if tool not in tools:
            problems.append(f"미호출: {tool} (호출된 툴: {tools})")

    for tool in case.forbid_tools:
        if tool in tools:
            problems.append(f"금지된 툴 호출: {tool} (호출된 툴: {tools})")

    if case.expect_before:
        target, before = case.expect_before["tool"], case.expect_before["before"]
        if target in tools:
            idx = tools.index(target)
            if before not in tools[:idx]:
                problems.append(f"조회 없이 {target} 호출: {tools}")

    writes = _successful_writes(calls)
    if case.expect_write is True and not writes:
        problems.append(f"쓰기 없음 (호출된 툴: {tools})")
    if case.expect_write is False and writes:
        problems.append(
            f"요청하지 않은 수정: {[w['tool'] for w in writes]}"
        )

    if case.expect_text_any and not any(kw in text for kw in case.expect_text_any):
        problems.append(f"답변에 {case.expect_text_any} 중 어느 키워드도 없음: {text[:120]}")

    if case.expect_new_violations is not None:
        has = any("new_violations" in w["result"] for w in writes)
        if case.expect_new_violations and not has:
            problems.append("쓰기 결과에 new_violations가 없음 — 제약 위반이 보고되지 않았다")
        if not case.expect_new_violations and has:
            problems.append("새 제약 위반이 생김 — 깨끗해야 할 편집이 규정을 깼다")

    if case.expect_final_schedules is not None:
        final = _final_schedules(db, session)
        for want in case.expect_final_schedules:
            if want not in final:
                problems.append(f"결과 불일치: {want} 가 draft에 없음 (현재 {final})")

    if case.has_expect_status and status != case.expect_status:
        problems.append(f"turn_status 불일치: {status!r} (기대 {case.expect_status!r})")

    return problems


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------


def run_case(case: Case, verbose: bool) -> dict:
    db = _new_session()
    monkey: list = []
    usages: list = []

    original_step = chat_module._llm_step

    def _counting_step(contents):
        step = original_step(contents)
        if step.usage:
            usages.append(step.usage)
        return step

    chat_module._llm_step = _counting_step
    if case.fake_solve:
        _install_fake_solve(monkey)
    try:
        session = SCENARIOS[case.scenario](db)
        started = time_module.monotonic()
        text, calls, status = chat_module.run_turn(db, session, case.message)
        elapsed = time_module.monotonic() - started
        db.commit()
        problems = check_result(case, db, session, text, calls, status)
    except chat_module.ChatUnavailable as exc:
        return {"error": exc.reason, "ok": None, "problems": [], "elapsed_s": None,
                "usage": None, "tools": [], "text": "", "status": None}
    finally:
        chat_module._llm_step = original_step
        _restore(monkey)
        db.close()

    if verbose:
        print(f"    발화: {case.message}")
        print(f"    툴  : {[c['tool'] for c in calls]}")
        print(f"    답변: {text[:300]}")

    usage = None
    if usages:
        usage = {
            "input_tokens": sum(u["input_tokens"] or 0 for u in usages),
            "output_tokens": sum(u["output_tokens"] or 0 for u in usages),
            "total_tokens": sum(u["total_tokens"] or 0 for u in usages),
        }
    return {
        "error": None,
        "ok": not problems,
        "problems": problems,
        "elapsed_s": round(elapsed, 2),
        "usage": usage,
        "llm_steps": len(usages),
        "tools": [c["tool"] for c in calls],
        "writes": len(_successful_writes(calls)),
        "new_violation_writes": sum(
            1 for w in _successful_writes(calls) if "new_violations" in w["result"]
        ),
        "text": text,
        "status": status,
    }


def _axis_report(runs: list) -> dict:
    """검출률만으로는 안 보이는 축 — 요청 안 한 수정, 조회 선행, 예산 소진 등."""
    done = [r for r in runs if r["error"] is None]
    writes = sum(r["writes"] for r in done)
    return {
        "runs": len(done),
        "tool_calls_per_turn": round(sum(len(r["tools"]) for r in done) / len(done), 2) if done else None,
        "write_turns": sum(1 for r in done if r["writes"]),
        "writes": writes,
        "writes_breaking_constraints": sum(r["new_violation_writes"] for r in done),
        "budget_exceeded": sum(1 for r in done if r["status"] == "budget_exceeded"),
        "partial_failed": sum(1 for r in done if r["status"] == "partial_failed"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=1, help="케이스당 반복 횟수")
    parser.add_argument("--case", help="id나 이름에 이 문자열이 들어간 케이스만")
    parser.add_argument("--tier", help="층만 실행 (basic|edit|guard)")
    parser.add_argument("--verbose", action="store_true", help="답변·툴 호출 출력")
    parser.add_argument("--out", help="결과 JSON 저장 경로")
    args = parser.parse_args()

    cases = [
        c
        for c in load_cases()
        if (not args.case or args.case in c.id or args.case in c.name)
        and (not args.tier or c.tier == args.tier)
    ]
    if not cases:
        print("조건에 맞는 케이스가 없습니다.")
        return 1

    print(f"model={chat_module.MODEL} cases={len(cases)} repeat={args.repeat}")

    all_runs = []
    lines = []
    reports = []
    by_tier: dict = {}
    for case in cases:
        runs = []
        for i in range(args.repeat):
            print(f"[{case.name}] {i + 1}/{args.repeat} 실행 중...", flush=True)
            run = run_case(case, args.verbose)
            runs.append(run)
            if run["error"]:
                print(f"         (호출 실패: {run['error']})")
            else:
                tok = f", {run['usage']['total_tokens']}토큰" if run["usage"] else ""
                print(f"         ({run['elapsed_s']}초, 툴 {len(run['tools'])}회{tok})")
        all_runs.extend(runs)
        completed = [r for r in runs if r["error"] is None]
        passes = sum(1 for r in completed if r["ok"])
        mark = "PASS" if completed and passes == len(completed) else ("SKIP" if not completed else "FAIL")
        lines.append(f"  [{mark}] ({case.tier}) {case.name}: {passes}/{len(completed)}")
        for r in runs:
            for p in r["problems"]:
                lines.append(f"         - {p}")
        t = by_tier.setdefault(case.tier, [0, 0])
        t[0] += passes
        t[1] += len(completed)
        reports.append({
            "id": case.id, "name": case.name, "tier": case.tier,
            "pass": passes, "completed": len(completed), "runs": runs,
        })

    print("\n=== 챗봇 평가 결과 ===")
    print("\n".join(lines))

    done = [r for r in all_runs if r["error"] is None]
    total_pass = sum(1 for r in done if r["ok"])
    errors = len(all_runs) - len(done)
    print()
    for tier in ("basic", "edit", "guard"):
        if tier in by_tier:
            p, n = by_tier[tier]
            print(f"  {tier:6s} {p}/{n}")
    if done:
        print(f"\n통과율: {total_pass}/{len(done)} ({total_pass / len(done):.0%}) / 호출 실패 {errors}건")
    else:
        print(f"\n통과율: 측정 불가 / 호출 실패 {errors}건")

    axes = _axis_report(all_runs)
    print(
        f"턴당 툴 호출 {axes['tool_calls_per_turn']}회 · 쓰기 {axes['writes']}건"
        f"(그중 제약 위반 {axes['writes_breaking_constraints']}건) · "
        f"예산 소진 {axes['budget_exceeded']}턴 · 부분 실패 {axes['partial_failed']}턴"
    )
    elapsed = [r["elapsed_s"] for r in done if r["elapsed_s"]]
    if elapsed:
        print(f"턴 소요시간 평균 {sum(elapsed) / len(elapsed):.1f}초 (최대 {max(elapsed):.1f}초)")
    tokens = [r["usage"]["total_tokens"] for r in done if r["usage"]]
    if tokens:
        print(f"턴당 토큰 평균 {sum(tokens) / len(tokens):,.0f} (최대 {max(tokens):,})")

    # 계측기 포화 경고 — 검토 하네스가 세 번 겪은 함정을 여기서는 미리 알린다.
    if done and total_pass == len(done):
        print(
            "\n[경고] 전 케이스 통과 — 계측기가 포화됐습니다. 이 상태로는 다음 변경의"
            " 효과를 잴 수 없으니, 프롬프트·툴을 손대기 전에 케이스를 먼저 늘리세요."
        )

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps(
                {
                    "started_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                    "model": chat_module.MODEL,
                    "repeat": args.repeat,
                    "pass": total_pass,
                    "completed": len(done),
                    "call_errors": errors,
                    "by_tier": {k: {"pass": v[0], "completed": v[1]} for k, v in by_tier.items()},
                    "axes": axes,
                    "cases": reports,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"결과 저장: {out}")

    return 0 if done and total_pass == len(done) else 1


if __name__ == "__main__":
    sys.exit(main())
