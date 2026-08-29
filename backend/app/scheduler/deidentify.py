"""LLM으로 나가는 데이터의 비식별화 (#200).

Gemini는 외부 서비스다. 학번·이름·학생이 자유 서술로 낸 특이사항이 그대로
나가면 개인정보를 제3자에게 넘기는 것이 된다. 이 모듈은 **전송 직전**에
식별자를 별칭(`S01`)으로 바꾸고, 응답을 받은 뒤 되돌린다 — DB에 저장되는 값,
API 응답 형태, 화면에 보이는 문구는 달라지지 않는다.

되돌려야 하므로 해시가 아니라 **요청 단위 매핑**을 쓴다. 매핑은 메모리에만
있고 요청이 끝나면 사라진다. 프롬프트·LLM 제공자 로그에 남는 것은 별칭뿐이고,
그 별칭이 누구인지는 이 프로세스 밖에서 알 수 없다.

판단에 쓰이지 않는 정보는 애초에 넣지 않는다 — 학과(`department_name`),
교비/국가 구분(`funding_type`), 연락처, 생년월일, 국적, 지도교수는 프롬프트
조립 함수 어디에서도 읽지 않는다. 자유 서술문에 섞여 들어온 연락처류는
목록이 없어 패턴으로 잡고, 되돌리지 않고 지운다(§_SCRUB_PATTERNS).

사용 예:

    deid = build_for_students(students)
    prompt = deid.mask(_build_prompt(...))
    result = _call_gemini(prompt)
    text = deid.restore(result.summary, style="name_id")
    student_id = deid.to_student_id(finding.target_id)
"""

import logging
import os
import re
from typing import Iterable, Literal, Optional

logger = logging.getLogger(__name__)

# 별칭 형식: S01, S02, ... 실제 학번(8자리 숫자)·이름과 겹치지 않는 모양이어야
# 모델이 둘을 헷갈리지 않는다.
ALIAS_PREFIX = "S"

# 복원용 별칭 탐지. 뒤에 \b를 쓰지 않는다 — 한글 조사가 붙은 "S01의"에서
# 숫자와 '의' 사이는 파이썬 정규식 기준 단어 경계가 아니라 매치에 실패한다.
_ALIAS_RE = re.compile(rf"(?<![A-Za-z0-9]){ALIAS_PREFIX}(\d{{2,}})")

# 자유 서술문(학생 특이사항·대타 사유·되묻기 답변)에 섞여 들어오는 연락처류.
# 학번·이름과 달리 DB에 목록이 없어 패턴으로만 잡는다. 판단에 쓸 일이 없으므로
# 별칭을 주지 않고 지운다 — 되돌아오지 않는 대신 새어 나갈 일도 없다.
# 주민번호를 전화번호보다 먼저 본다(앞 6자리가 전화번호 패턴에 걸리지 않도록).
_SCRUB_PATTERNS = [
    (re.compile(r"\d{6}\s*-\s*[1-4]\d{6}"), "(주민번호 삭제)"),
    (re.compile(r"01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4}"), "(연락처 삭제)"),
    (re.compile(r"0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}"), "(연락처 삭제)"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "(이메일 삭제)"),
]

# 학번과 이름을 나란히 적은 표기("20261004 박서연", "박서연(20261004)")는 둘 다
# 같은 별칭이 되어 "S04 S04" / "S04(S04)"로 겹친다. 그대로 두면 프롬프트가 낭비되고
# 복원할 때 "박서연 박서연"이 화면에 나간다 — 한 번 접는다.
# 줄바꿈은 건드리지 않는다: 배정 결과처럼 같은 학생이 줄마다 반복되는 목록을
# 한 줄로 합쳐 버리면 근무 건수가 사라진다.
_DUPLICATE_ALIAS_RE = re.compile(
    rf"({ALIAS_PREFIX}\d{{2,}})(?:[ \t]*\([ \t]*\1[ \t]*\)|[ \t]+\1)"
)

# 이름 치환의 최소 길이. 한 글자 이름을 치환 목록에 넣으면 관계없는 낱말
# 속에서 터져 문장이 깨진다 — 한 글자는 치환하지 않는다.
_MIN_NAME_LENGTH = 2

RestoreStyle = Literal["id", "name", "name_id"]


def is_enabled() -> bool:
    """비식별화 사용 여부. 기본값은 켬 — 끄는 건 로컬 디버깅·프롬프트 실측용이다.

    `getenv`의 기본값이 아니라 `or`를 쓴다: .env에 `LLM_DEIDENTIFY=`만 빈 값으로
    남아 있어도 기본값(켬)이 유지되도록 (review.MODEL과 같은 이유).
    """
    return (os.getenv("LLM_DEIDENTIFY") or "1").strip().lower() not in {"0", "false", "off"}


class Deidentifier:
    """학번·이름 ↔ 별칭 매핑. 한 요청 안에서만 유효하다."""

    def __init__(self) -> None:
        self._alias_by_id: dict[str, str] = {}
        self._id_by_alias: dict[str, str] = {}
        self._name_by_alias: dict[str, str] = {}
        self._alias_by_name: dict[str, str] = {}
        self._pattern: Optional[re.Pattern] = None

    # ------------------------------------------------------------------
    # 등록
    # ------------------------------------------------------------------
    def add(self, student_id: Optional[str], name: Optional[str] = None) -> str:
        """학생 하나를 등록하고 별칭을 돌려준다. 이미 있으면 같은 별칭이 나온다."""
        student_id = (student_id or "").strip()
        if not student_id:
            return ""
        alias = self._alias_by_id.get(student_id)
        if alias is None:
            alias = f"{ALIAS_PREFIX}{len(self._alias_by_id) + 1:02d}"
            self._alias_by_id[student_id] = alias
            self._id_by_alias[alias] = student_id
            self._pattern = None
        name = (name or "").strip()
        if name and alias not in self._name_by_alias:
            self._name_by_alias[alias] = name
            self._pattern = None
            # 동명이인은 먼저 등록된 쪽 별칭에 붙인다. 이름→별칭→이름으로 되돌리면
            # 같은 이름이 나오므로, 이름으로 조회하는 쪽(chat의 student_name 인자)은
            # 지금과 똑같이 동명이인 전부를 찾는다 — 이 선택으로 잃는 것이 없다.
            if len(name) >= _MIN_NAME_LENGTH:
                self._alias_by_name.setdefault(name, alias)
        return alias

    def alias(self, student_id: Optional[str]) -> str:
        """학번의 별칭. 등록되지 않은 학번이면 이름 없이 새로 등록한다."""
        return self.add(student_id)

    @property
    def size(self) -> int:
        return len(self._alias_by_id)

    # ------------------------------------------------------------------
    # 보내기 전 (실제 값 → 별칭)
    # ------------------------------------------------------------------
    def mask(self, text: Optional[str]) -> str:
        """문자열 속 학번·이름을 별칭으로 바꾸고 연락처류를 지운다."""
        if not text:
            return text or ""
        for pattern, replacement in _SCRUB_PATTERNS:
            text = pattern.sub(replacement, text)
        pattern = self._mask_pattern()
        if pattern is None:
            return text
        return _DUPLICATE_ALIAS_RE.sub(r"\1", pattern.sub(self._mask_one, text))

    def mask_data(self, value):
        """dict·list 안의 모든 문자열을 mask한다 (챗봇 툴 결과용).

        키는 건드리지 않는다 — 모델이 읽는 스키마가 바뀌면 안 된다.
        """
        if isinstance(value, str):
            return self.mask(value)
        if isinstance(value, dict):
            return {k: self.mask_data(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [self.mask_data(v) for v in value]
        return value

    def _mask_pattern(self) -> Optional[re.Pattern]:
        if self._pattern is None:
            # 긴 것부터 — 짧은 이름이 긴 이름의 일부를 먼저 먹지 않도록
            tokens = sorted(
                [*self._alias_by_id, *self._alias_by_name], key=len, reverse=True
            )
            self._pattern = (
                re.compile("|".join(re.escape(t) for t in tokens)) if tokens else False
            )
        return self._pattern or None

    def _mask_one(self, match: re.Match) -> str:
        token = match.group(0)
        return self._alias_by_id.get(token) or self._alias_by_name.get(token) or token

    # ------------------------------------------------------------------
    # 받은 뒤 (별칭 → 실제 값)
    # ------------------------------------------------------------------
    def restore(self, text: Optional[str], style: RestoreStyle = "name_id") -> str:
        """응답 문자열의 별칭을 실제 학생 표기로 되돌린다.

        - `id`: 학번만 — 구조화 필드(target_id)처럼 값 자체가 키인 자리
        - `name`: 이름만 — 챗봇 응답(담당자는 이름으로 읽는다)
        - `name_id`: `이름(학번)` — AI 검토 의견처럼 대상을 확정해야 하는 자리
        """
        if not text:
            return text or ""
        return _ALIAS_RE.sub(lambda m: self._restore_one(m.group(0), style), text)

    def restore_data(self, value, style: RestoreStyle = "id"):
        """dict·list 안의 모든 문자열을 restore한다 (챗봇 툴 인자용)."""
        if isinstance(value, str):
            return self.restore(value, style=style)
        if isinstance(value, dict):
            return {k: self.restore_data(v, style=style) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [self.restore_data(v, style=style) for v in value]
        return value

    def _restore_one(self, alias: str, style: RestoreStyle) -> str:
        student_id = self._id_by_alias.get(alias)
        if student_id is None:
            # 모델이 지어낸 별칭 — 그대로 두면 화면에 정체불명 코드가 뜨므로
            # 되돌릴 수 없다는 사실을 드러낸다
            logger.info("복원할 수 없는 별칭 %s — 매핑에 없음", alias)
            return "(알 수 없는 학생)"
        name = self._name_by_alias.get(alias)
        if style == "id" or not name:
            return student_id
        if style == "name":
            return name
        return f"{name}({student_id})"

    def to_student_id(self, alias: Optional[str]) -> Optional[str]:
        """별칭 하나를 학번으로. 별칭이 아니면 값을 그대로 돌려준다 —
        되묻기의 target_id는 학생이 아닐 수도 있다(부서 ID·규칙 해석)."""
        if not alias:
            return alias
        value = alias.strip()
        return self._id_by_alias.get(value, value)


class NullDeidentifier(Deidentifier):
    """비식별화를 끈 상태(LLM_DEIDENTIFY=0). 값을 그대로 통과시킨다."""

    def mask(self, text: Optional[str]) -> str:
        return text or ""

    def mask_data(self, value):
        return value

    def restore(self, text: Optional[str], style: RestoreStyle = "name_id") -> str:
        return text or ""

    def restore_data(self, value, style: RestoreStyle = "id"):
        return value

    def to_student_id(self, alias: Optional[str]) -> Optional[str]:
        return alias


def build_for_students(students: Iterable) -> Deidentifier:
    """Student 행(또는 (학번, 이름) 튜플)들로 매핑을 만든다.

    학번 정렬 순으로 등록해 같은 입력에 같은 별칭이 나오게 한다 — 같은 배치를
    두 번 검토했을 때 프롬프트가 별칭 순서 때문에 달라지면 비교가 안 된다.
    """
    if not is_enabled():
        return NullDeidentifier()
    deid = Deidentifier()
    pairs = []
    for s in students:
        if isinstance(s, (tuple, list)):
            student_id, name = (list(s) + [None])[:2]
        else:
            student_id, name = getattr(s, "student_id", None), getattr(s, "name", None)
        if student_id:
            pairs.append((str(student_id), name))
    for student_id, name in sorted(pairs, key=lambda p: p[0]):
        deid.add(student_id, name)
    return deid


def build_for_department(db, department_id: int) -> Deidentifier:
    """부서 소속 학생 전원으로 매핑을 만든다.

    배정된 학생만 넣으면 특이사항·부서 규칙 원문에 등장하는 다른 학생 이름이
    치환되지 않고 나간다. 판단 대상이 아니어도 목록에는 들어가야 한다.
    """
    from app import models  # 순환 import 방지 — 이 모듈은 DB를 몰라도 동작한다
    from app.services import get_department_student_ids

    if not is_enabled():
        return NullDeidentifier()
    student_ids = get_department_student_ids(db, department_id)
    if not student_ids:
        return Deidentifier()
    return build_for_students(
        db.query(models.Student).filter(models.Student.student_id.in_(student_ids)).all()
    )
