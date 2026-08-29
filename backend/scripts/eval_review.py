"""근무표 AI 검토 프롬프트 검출력 평가 스크립트 (이슈 #80, #114).

tests/scheduler/test_review_live.py가 핵심 케이스의 합격/불합격을 보는
통합 테스트라면, 이 스크립트는 더 넓은 위반 케이스 세트를 실제 모델로
돌려 검출률과 오탐(위반 없는데 critical) 여부를 측정한다. CI 밖 수동 실행용.

DB 없이 동작한다 — _build_prompt가 쓰는 필드만 채운 가짜 객체로 프롬프트를
만들고 각 provider의 호출 함수를 직접 부른다.

케이스는 코드가 아니라 scripts/eval_review_cases.json에서 관리한다 — 케이스
추가·수정에 코드 변경이 필요 없다 (필드 설명은 그 파일의 _readme 참고).

#114: gpt/gemini/claude/온프레미스 모델 비교용으로 --provider를 추가했다.
프로덕션 검토(app/scheduler/review.py)는 REQ-SCHED-016에 따라 Gemini
고정이고 이 스크립트만 비교 목적으로 provider를 넓힌다 — AI Layer를 별도
모듈로 분리한다는 SCHEDULER_SPEC의 원칙은 그대로 두고, 여기서는 어떤 모델을
그 자리에 쓸지 실측으로 고르기 위한 실험 하네스만 추가한 것.

사용법 (backend/ 디렉토리에서, 키는 .env 또는 환경변수. 없는 provider는
not_configured로 스킵):
    python3 scripts/eval_review.py                        # gemini, 각 케이스 1회
    python3 scripts/eval_review.py --provider openai       # gpt (OPENAI_API_KEY 필요)
    python3 scripts/eval_review.py --provider claude       # claude (ANTHROPIC_API_KEY 필요)
    python3 scripts/eval_review.py --provider local \\
        --model qwen2.5:7b                                # 온프레미스 (Ollama, 키 불필요)
    python3 scripts/eval_review.py --repeat 3             # 케이스당 3회 돌려 검출률 측정
    python3 scripts/eval_review.py --verbose              # AI 응답 전문 출력
    python3 scripts/eval_review.py --out output/eval_2026-08-24.json
                                                 # 결과를 JSON으로 저장 (프롬프트
                                                 # 수정 전후 검출률 비교용)
"""

import argparse
import json
import logging
import os
import sys
import time as time_module  # datetime.time과 이름이 겹쳐 별칭 사용 (소요시간 측정용, #114)
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from app.scheduler import deidentify  # noqa: E402
from app.scheduler import review as review_module  # noqa: E402
from app.scheduler.review import ReviewResult, ReviewUnavailable  # noqa: E402

logger = logging.getLogger(__name__)

PROVIDERS = ("gemini", "openai", "claude", "local")

# provider별 모델 기본값 — --model로 오버라이드하거나 아래 env var로 바꿀 수 있다.
_PROVIDER_ENV_MODEL = {
    "gemini": "GEMINI_MODEL",  # 기본값은 상수가 아니라 review.MODEL — resolve_model 참고
    "openai": "OPENAI_MODEL",
    "claude": "ANTHROPIC_MODEL",
    "local": "LOCAL_MODEL",
}
_PROVIDER_DEFAULT_MODEL = {
    "openai": "gpt-4.1-mini",
    "claude": "claude-sonnet-5",
    "local": "qwen2.5:7b",
}


def resolve_model(provider: str, model_arg: Optional[str]) -> str:
    """--model → provider별 env var → 기본값 순으로 정한다.

    gemini의 기본값은 상수가 아니라 **프로덕션이 실제 쓰는 모델**(review.MODEL)이다 —
    검토 하네스의 기준선은 지금 서비스가 돌리는 모델이어야 하기 때문.

    다만 gemini만 env var 없이 review.MODEL로 직행하던 탓에, .env에 GEMINI_MODEL을
    적어도 조용히 무시됐다(OPENAI_MODEL·ANTHROPIC_MODEL과 같은 꼴이라 먹을 것처럼
    보이는데 안 먹었다). 다른 provider와 같은 자리를 주되, 프로덕션 기본값
    (REVIEW_MODEL·review.MODEL)은 건드리지 않는다 — 실험용 변수가 프로덕션 검토
    모델을 바꾸는 일은 없어야 한다."""
    if model_arg:
        return model_arg
    if provider == "gemini":
        return os.getenv("GEMINI_MODEL") or review_module.MODEL
    return os.getenv(_PROVIDER_ENV_MODEL[provider]) or _PROVIDER_DEFAULT_MODEL[provider]


def _call_openai_compatible(
    contents: str, model: str, *, base_url: Optional[str] = None, api_key: Optional[str] = None
) -> ReviewResult:
    """OpenAI 및 Ollama(OpenAI 호환 /v1 엔드포인트, 온프레미스)가 공유하는 호출부.

    Ollama 0.5+는 /v1/chat/completions에서 OpenAI의 구조화 출력(response_format=
    json_schema)을 그대로 받아준다 — 그래서 local provider도 이 함수를 base_url만
    바꿔 재사용한다.
    """
    if api_key is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise ReviewUnavailable("not_configured")

    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    try:
        completion = client.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": review_module.SYSTEM_PROMPT},
                {"role": "user", "content": contents},
            ],
            response_format=ReviewResult,
        )
    except Exception as e:
        logger.error("%s 호출 실패(model=%s): %s", base_url or "OpenAI", model, e)
        raise ReviewUnavailable("ai_error") from e

    result = completion.choices[0].message.parsed
    if result is None:
        logger.error("%s 응답 파싱 실패(model=%s): refusal=%s", base_url or "OpenAI", model, completion.choices[0].message.refusal)
        raise ReviewUnavailable("ai_error")

    usage = None
    if completion.usage is not None:
        usage = {
            "input_tokens": completion.usage.prompt_tokens,
            "output_tokens": completion.usage.completion_tokens,
            "total_tokens": completion.usage.total_tokens,
        }
    return result, usage


def _call_local(contents: str, model: str) -> tuple[ReviewResult, Optional[dict]]:
    base_url = os.getenv("LOCAL_BASE_URL", "http://localhost:11434/v1")
    # Ollama는 인증이 없다 — openai 클라이언트가 요구하는 자리만 채우는 더미 키.
    return _call_openai_compatible(contents, model, base_url=base_url, api_key="ollama")


def _call_claude(contents: str, model: str) -> tuple[ReviewResult, Optional[dict]]:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise ReviewUnavailable("not_configured")

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    # Claude엔 response_format이 없어서, 강제 tool call로 구조화 출력을 흉내낸다 —
    # ReviewResult의 JSON 스키마를 그대로 tool input_schema로 넘기고 그 tool만
    # 쓰도록 tool_choice를 고정.
    tools = [
        {
            "name": "submit_review",
            "description": "근무표 검토 결과를 제출한다.",
            "input_schema": ReviewResult.model_json_schema(),
        }
    ]
    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=review_module.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": contents}],
            tools=tools,
            tool_choice={"type": "tool", "name": "submit_review"},
        )
    except Exception as e:
        logger.error("Claude 호출 실패(model=%s): %s", model, e)
        raise ReviewUnavailable("ai_error") from e

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        logger.error("Claude 응답에 tool_use 없음(model=%s): stop_reason=%s", model, response.stop_reason)
        raise ReviewUnavailable("ai_error")
    try:
        result = ReviewResult.model_validate(tool_use.input)
    except Exception as e:
        logger.error("Claude 응답 파싱 실패(model=%s): %s", model, e)
        raise ReviewUnavailable("ai_error") from e

    usage = None
    if response.usage is not None:
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
        }
    return result, usage


def call_model(provider: str, model: str, contents: str) -> tuple[ReviewResult, Optional[dict]]:
    """(검토 결과, 토큰 사용량) — 사용량은 provider가 안 주면 None (#114 비용 비교용)."""
    if provider == "gemini":
        # _call_gemini는 model 인자를 안 받고 모듈 전역 MODEL을 읽는다 — --model로
        # 다른 Gemini 버전을 실험할 수 있게 호출 직전에만 잠깐 바꿔치기하고 원복.
        original_model = review_module.MODEL
        review_module.MODEL = model
        try:
            result = review_module._call_gemini(contents)
        finally:
            review_module.MODEL = original_model
        return result, review_module.LAST_USAGE
    if provider == "openai":
        return _call_openai_compatible(contents, model)
    if provider == "claude":
        return _call_claude(contents, model)
    if provider == "local":
        return _call_local(contents, model)
    raise ValueError(f"알 수 없는 provider: {provider}")

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
    # student_id → 근속 시작일(ISO 문자열) — 근속 상대 비교 규칙 검증용. 없으면 빈 dict.
    tenure_by_student_id: dict = field(default_factory=dict)
    # 이 batch에는 배정되지 않은 후보 — [{student_id, name, tenure_start_date,
    # available_times: [{day_of_week, start, end}]}]. 없으면 빈 list.
    unassigned_candidates: list = field(default_factory=list)
    # clarification_requests에 이 target_type들이 각각 하나 이상 있어야 성공.
    # 예: ["student"], ["department"], ["rule_interpretation"]. 없으면 검사 안 함.
    expect_clarification_target_types: list = field(default_factory=list)
    # true면 clarification_requests가 하나라도 있으면 실패 (정책성 질문 오발동 검사).
    forbid_clarifications: bool = False
    department_id: int = 1  # 프롬프트의 "부서 ID" — department 되묻기 target_id 검증용
    # 학생이 낸 자연어 특이사항 (#185) — [{student_id, name, content}].
    # 프롬프트의 "## 학생이 낸 특이사항" 섹션에 실린다. 규칙이 아니라 "사정"이라
    # 어긋나도 severity를 한 단계 낮춰야 한다 — expect_hits의 severity 축으로 잰다.
    student_notes: list = field(default_factory=list)
    # 과거 되묻기 답변 (#111) — {"student": {학번: {필드: 답변}}, "department":
    # {필드: 답변}, "rule_interpretation": [{question, answer}]}. 프롬프트의
    # "## 확인된 정보"·"## 확인된 규칙 해석" 섹션에 실린다.
    clarification_answers: dict = field(default_factory=dict)
    # findings 개수 상한 — "같은 규칙 위반이 여러 건이면 한 finding에 모아라"라는
    # 프롬프트 규칙을 재는 축. None이면 검사하지 않는다.
    max_findings: Optional[int] = None


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
                tenure_by_student_id=item.get("tenure_by_student_id", {}),
                unassigned_candidates=item.get("unassigned_candidates", []),
                expect_clarification_target_types=item.get(
                    "expect_clarification_target_types", []
                ),
                forbid_clarifications=item.get("forbid_clarifications", False),
                department_id=item.get("department_id", 1),
                student_notes=item.get("student_notes", []),
                clarification_answers=item.get("clarification_answers", {}),
                max_findings=item.get("max_findings"),
            )
        )
    return cases


def _fake_inputs(case: Case):
    batch = SimpleNamespace(
        department_id=case.department_id,
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
    tenure_by_student_id = {
        student_id: (date.fromisoformat(iso) if iso else None)
        for student_id, iso in case.tenure_by_student_id.items()
    }
    unassigned_candidates = [
        {
            "student": SimpleNamespace(
                student_id=c["student_id"],
                name=c["name"],
                tenure_start_date=(
                    date.fromisoformat(c["tenure_start_date"])
                    if c.get("tenure_start_date")
                    else None
                ),
            ),
            "available_times": [
                SimpleNamespace(
                    day_of_week=at["day_of_week"],
                    start_time=time.fromisoformat(at["start"]),
                    end_time=time.fromisoformat(at["end"]),
                )
                for at in c.get("available_times", [])
            ],
        }
        for c in case.unassigned_candidates
    ]
    # review._get_student_notes가 DB에서 만들어 넘기는 것과 같은 (학번, 이름, 내용) 튜플
    student_notes = [
        (n["student_id"], n["name"], n["content"]) for n in case.student_notes
    ]
    return (
        batch,
        schedules,
        policy,
        tenure_by_student_id,
        unassigned_candidates,
        case.clarification_answers,
        student_notes,
    )


def _build_deidentifier(case: Case):
    """케이스에 나오는 학생 전원으로 비식별화 매핑을 만든다 (#200).

    `review_batch`가 부서 소속 전원을 매핑에 넣는 자리에 대응한다. 하네스가
    이걸 빠뜨리면 **실제로는 나가지 않는 프롬프트로 검출력을 재게 된다** —
    프로덕션은 별칭을 보는데 하네스만 실명을 보는 상태가 된다.
    """
    students: dict[str, Optional[str]] = {}
    for student_id, *_ in case.schedules:
        students.setdefault(student_id, None)
    for entry in case.per_student:
        if entry.get("student_id"):
            students.setdefault(entry["student_id"], None)
    for student_id in case.tenure_by_student_id:
        students.setdefault(student_id, None)
    # 이름을 아는 곳에서 덮어쓴다 — 이름이 있어야 문장 속 이름도 치환된다
    for candidate in case.unassigned_candidates:
        students.setdefault(candidate["student_id"], None)
        if candidate.get("name"):
            students[candidate["student_id"]] = candidate["name"]
    for note in case.student_notes:
        students.setdefault(note["student_id"], None)
        if note.get("name"):
            students[note["student_id"]] = note["name"]
    return deidentify.build_for_students(students.items())


def _finding_text(finding) -> str:
    return " ".join(
        str(v)
        for v in (finding.rule, finding.evidence, finding.message, finding.suggestion)
        if v
    )


def _parse_expect_group(group) -> tuple[list, Optional[str], list]:
    """expect_hits 한 항목을 (키워드, 기대 severity, 필수 포함 키워드)로 편다.

    기존 형식(키워드 목록)을 그대로 받으면서, 판정 축을 늘려야 하는 케이스만
    dict로 적을 수 있게 한다 — 케이스 파일 전체를 바꾸지 않기 위해서다.
        ["20221234"]                                     # 기존
        {"keywords": [...], "severity": "warning"}        # severity까지 본다
        {"keywords": [...], "all_of": ["08-03", "08-05"]} # evidence에 다 있어야
    """
    if isinstance(group, dict):
        return group["keywords"], group.get("severity"), group.get("all_of", [])
    return group, None, []


def check_result(case: Case, result: "ReviewResult") -> list[str]:
    """케이스 기대치 대비 검토 결과의 문제 목록 — 비어 있으면 통과.

    tests/scheduler/test_review_live.py도 이 함수를 가져다 써서, 케이스와
    판정 기준이 eval/테스트 간에 어긋나지 않게 한다.
    """
    problems = []
    violations = [f for f in result.findings if f.severity in ("critical", "warning")]

    for group in case.expect_hits:
        keywords, want_severity, want_all = _parse_expect_group(group)
        hits = [
            f for f in violations if any(kw in _finding_text(f) for kw in keywords)
        ]
        if not hits:
            problems.append(f"미검출: {keywords} 관련 위반 finding 없음")
            continue
        # severity 기대치 — 지정한 케이스만 본다. "특이사항 위반은 warning으로
        # 낮춰라" 같은 프롬프트 규칙은 이 축이 없으면 잴 수 없다.
        if want_severity and not any(f.severity == want_severity for f in hits):
            problems.append(
                f"severity 불일치: {keywords} finding이 {want_severity}가 아님 "
                f"— 실제 {[f.severity for f in hits]}"
            )
        # 완료 기준(근거·대안) — 위반 finding엔 evidence/suggestion이 있어야 한다.
        # 매칭된 finding 전부를 본다: 하나만 보면 근거 없는 finding이 섞여도 통과한다.
        for i, hit in enumerate(hits):
            if not hit.evidence:
                problems.append(f"근거 누락: {keywords} finding[{i}]에 evidence 없음")
            if not hit.suggestion:
                problems.append(f"대안 누락: {keywords} finding[{i}]에 suggestion 없음")
        # 같은 규칙 위반이 여러 건인 케이스 — evidence 한 곳에 다 모였는지 본다
        for kw in want_all:
            if not any(kw in _finding_text(f) for f in hits):
                problems.append(f"근거 불충분: {keywords} finding에 {kw!r}가 없음")

    if case.max_findings is not None and len(result.findings) > case.max_findings:
        problems.append(
            f"finding 과다: {len(result.findings)}건 (최대 {case.max_findings}건) "
            f"— {[f.message[:40] for f in result.findings]}"
        )

    if case.forbid_critical:
        criticals = [f for f in result.findings if f.severity == "critical"]
        if criticals:
            problems.append(
                f"오탐: critical {len(criticals)}건 — {_finding_text(criticals[0])[:80]}"
            )

    if case.expect_summary and not any(kw in result.summary for kw in case.expect_summary):
        problems.append(f"summary에 {case.expect_summary} 중 어느 키워드도 없음: {result.summary}")

    for target_type in case.expect_clarification_target_types:
        if not any(c.target_type == target_type for c in result.clarification_requests):
            problems.append(f"미발생: target_type={target_type} 되묻기 없음")

    for c in result.clarification_requests:
        if c.target_type == "department" and c.target_id != str(case.department_id):
            problems.append(
                f"target_id 불일치: department 되묻기의 target_id={c.target_id!r}, "
                f"기대값={str(case.department_id)!r}"
            )

    if case.forbid_clarifications and result.clarification_requests:
        problems.append(
            f"오발동: 되묻기 {len(result.clarification_requests)}건 — "
            f"{result.clarification_requests[0].question[:80]}"
        )

    return problems


def run_case(
    case: Case, verbose: bool, provider: str = "gemini", model: Optional[str] = None
) -> tuple[bool, list[str], "ReviewResult", float, Optional[dict]]:
    """(성공 여부, 실패 사유 목록, AI 검토 결과, 호출 소요시간(초), 토큰 사용량)를 돌려준다.

    소요시간·토큰 사용량 둘 다 call_model 호출만 잰다 — 검출력만큼이나 provider
    비교 축(#114)이라 응답 준비까지 시간(프롬프트 구성 등)은 빼고 순수 모델
    호출만 본다. 토큰은 provider가 안 주면(로컬 모델 일부 등) None.
    """
    (
        batch,
        schedules,
        policy,
        tenure_by_student_id,
        unassigned_candidates,
        clarification_answers,
        student_notes,
    ) = _fake_inputs(case)
    contents = review_module._build_prompt(
        batch,
        case.custom_rules,
        schedules,
        policy,
        tenure_by_student_id,
        unassigned_candidates,
        clarification_answers,
        student_notes,
    )
    # 프로덕션(review_batch)과 같은 자리에서 비식별화한다 (#200). 이 두 줄이
    # 없으면 하네스는 실명 프롬프트를, 서비스는 별칭 프롬프트를 쓰게 되어
    # 여기서 잰 검출률이 실제 검출률이 아니게 된다.
    # `LLM_DEIDENTIFY=0`으로 돌리면 마스킹 없이 같은 케이스를 재서 A/B로 비교할 수 있다.
    deid = _build_deidentifier(case)
    contents = deid.mask(contents)

    started = time_module.monotonic()
    result, usage = call_model(provider, resolve_model(provider, model), contents)
    elapsed = time_module.monotonic() - started
    # check_result는 기대 키워드(학번·이름)로 findings를 훑으므로 판정 전에 되돌린다
    result = review_module._restore_result(result, deid)
    if verbose:
        print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
    problems = check_result(case, result)
    return (not problems), problems, result, elapsed, usage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=1, help="케이스당 반복 횟수")
    parser.add_argument("--verbose", action="store_true", help="AI 응답 전문 출력")
    parser.add_argument("--case", help="id나 이름에 이 문자열이 들어간 케이스만 실행")
    parser.add_argument(
        "--provider",
        choices=PROVIDERS,
        default="gemini",
        help="비교할 모델 provider (#114). local은 Ollama(OpenAI 호환, 키 불필요)",
    )
    parser.add_argument(
        "--model",
        help="모델명 오버라이드 (기본은 provider별 env var 또는 기본값)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.0,
        help="케이스 호출 사이 대기 시간(초). RPM(분당 요청) 제한이 빡빡한 모델용 "
        "— 예: gemini-3.7-flash는 연속 호출 시 대부분 429가 나서 --delay 15 정도 필요",
    )
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

    resolved_model = resolve_model(args.provider, args.model)
    print(f"provider={args.provider} model={resolved_model}")

    # 쿼터 소진 등 AI 호출 실패는 검출 실패가 아니므로 분모에서 뺀다 —
    # 무료 티어(일 20회) 특성상 반복 측정 중 흔히 만난다.
    total_runs = 0
    total_pass = 0
    total_error = 0
    all_elapsed = []  # 완료된 호출의 소요시간(초) — provider 간 응답속도 비교용(#114)
    all_usage = []  # 완료된 호출의 토큰 사용량(dict) — usage를 안 주는 provider는 제외
    lines = []
    case_reports = []
    first_call = True
    for case in cases:
        passes = 0
        errors = 0
        reasons = []
        runs = []
        for i in range(args.repeat):
            if args.delay and not first_call:
                print(f"  ({args.delay:.0f}초 대기 — RPM 제한 회피)", flush=True)
                time_module.sleep(args.delay)
            first_call = False
            print(f"[{case.name}] {i + 1}/{args.repeat} 실행 중...", flush=True)
            try:
                ok, problems, result, elapsed, usage = run_case(
                    case, args.verbose, provider=args.provider, model=args.model
                )
            except ReviewUnavailable as exc:
                errors += 1
                reasons.append(f"AI 호출 실패({exc.reason}) — 검출률 집계에서 제외")
                runs.append(
                    {
                        "ok": None,
                        "error": exc.reason,
                        "problems": [],
                        "review": None,
                        "elapsed_s": None,
                        "usage": None,
                    }
                )
                continue
            passes += ok
            all_elapsed.append(elapsed)
            if usage is not None:
                all_usage.append(usage)
            reasons.extend(problems)
            runs.append(
                {
                    "ok": ok,
                    "error": None,
                    "problems": problems,
                    "review": result.model_dump(),
                    "elapsed_s": round(elapsed, 2),
                    "usage": usage,
                }
            )
            usage_note = (
                f", {usage['total_tokens']}토큰(입력 {usage['input_tokens']}/출력 {usage['output_tokens']})"
                if usage
                else ""
            )
            print(f"         ({elapsed:.1f}초{usage_note})")
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

    avg_elapsed = sum(all_elapsed) / len(all_elapsed) if all_elapsed else None
    if avg_elapsed is not None:
        print(
            f"평균 응답시간: {avg_elapsed:.1f}초 (최소 {min(all_elapsed):.1f}초 / "
            f"최대 {max(all_elapsed):.1f}초, {len(all_elapsed)}건)"
        )

    total_input_tokens = sum(u["input_tokens"] for u in all_usage) if all_usage else None
    total_output_tokens = sum(u["output_tokens"] for u in all_usage) if all_usage else None
    total_tokens = sum(u["total_tokens"] for u in all_usage) if all_usage else None
    avg_tokens = total_tokens / len(all_usage) if all_usage else None
    if all_usage:
        print(
            f"토큰 사용량: 총 {total_tokens:,} (입력 {total_input_tokens:,} / "
            f"출력 {total_output_tokens:,}), 호출당 평균 {avg_tokens:,.0f} ({len(all_usage)}건)"
        )
    elif total_runs:
        print("토큰 사용량: 이 provider는 사용량 정보를 주지 않음")

    if args.out:
        report = {
            "started_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "provider": args.provider,
            "model": resolved_model,
            "repeat": args.repeat,
            "case_filter": args.case,
            "detect_pass": total_pass,
            "detect_total": total_runs,
            "call_errors": total_error,
            "avg_elapsed_s": round(avg_elapsed, 2) if avg_elapsed is not None else None,
            "min_elapsed_s": round(min(all_elapsed), 2) if all_elapsed else None,
            "max_elapsed_s": round(max(all_elapsed), 2) if all_elapsed else None,
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "total_tokens": total_tokens,
            "avg_tokens_per_call": round(avg_tokens, 1) if avg_tokens is not None else None,
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
