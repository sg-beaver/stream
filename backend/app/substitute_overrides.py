"""승인된 대타를 근무표에 얹는 규칙 공용 (#178, #229, #230).

근무표에는 성격이 다른 둘이 들어 있다.

- **계획** — 솔버가 낸 배정. 다시 생성될 수 있고, 그래도 되는 것
- **예외** — 사람이 승인한 대타. 재생성한다고 사라지면 안 되는 것

예전에는 승인이 `work_schedule` 행을 직접 쪼개는 것으로만 표현돼서, 재확정이
기간이 겹치는 확정 배치를 superseded로 내리고 솔버 배정으로 새 배치를 채우면
**승인된 대타가 조용히 원 근무자에게 되돌아갔다** (#178). 담당자도 학생도 알 수
없었다 — 확정 응답에도, 요청 기록 화면에도 아무 표시가 없었다.

그래서 이 모듈이 두 가지를 맡는다.

1. `split_for_substitute` — 근무 행 하나를 요청 구간만큼 앞/대타/뒤로 쪼갠다.
   승인(routers/substitutes.py)과 재적용(아래)이 **같은 함수**를 쓴다.
2. `apply_approved_substitutes` — 새로 만든 확정 배치에 그 기간의 승인된 대타를
   다시 얹는다. 확정 배치를 만드는 경로는 이 함수를 반드시 거쳐야 한다.

좌표(`work_date`·`department_id`)를 `substitute_request`가 직접 갖고 있기
때문에(#229) 재적용이 옛 배치를 읽지 않아도 된다 — 그 배치는 이미 내려갔다.
"""

from datetime import date, time

from sqlalchemy.orm import Session

from app import models

STATUS_PENDING = "대기"
STATUS_ACCEPTED = "수락"
STATUS_APPROVED = "승인"
STATUS_REJECTED = "반려"
STATUS_CANCELLED = "취소"
STATUS_EXPIRED = "만료"
# 재확정된 근무표에 얹을 자리가 없어진 승인 (#231). 되돌릴 수 없는 종결 상태 —
# 담당자가 필요하면 새로 배정해야 한다. '승인'인 채로 두면 근무표에는 없는데
# 요청 기록에는 승인이라고 뜨는 불일치가 남는다 (#178에서 실제로 관측됨).
STATUS_RELEASED = "해제됨"

OPEN_STATUSES = (STATUS_PENDING, STATUS_ACCEPTED)


def split_for_substitute(
    db: Session,
    schedule: "models.WorkSchedule",
    start_time: time,
    end_time: time,
    substitute_id: str,
) -> tuple["models.WorkSchedule", list["models.WorkSchedule"]]:
    """근무 행을 [start_time, end_time)만큼 대타에게 넘기고 (대타 행, 잔여 행들)을 돌려준다.

    **원 행을 재사용해 대타에게 넘긴다** — 요청의 schedule_id가 승인 뒤에도 "대타가
    맡은 근무"를 가리키게 하기 위해서다. 남는 앞·뒤 구간은 새 행으로 떼어 원
    근무자에게 남긴다. 근무 전체를 넘기는 요청이면 잔여 구간이 없다.

    batch_id·department_id·work_date는 원 근무에서 그대로 승계한다.

    HC-BLOCK-1(블록 all-or-none)은 솔버가 근무표를 *생성할 때* 거는 제약이고 이
    분할은 확정된 근무표를 운영 중에 고치는 일이므로, 여기서 블록이 쪼개지는 것은
    허용된 운영 예외다 (docs/SCHEDULER_SPEC.md 3.5).
    """
    original_owner = schedule.student_id
    leftovers = [
        (start, end)
        for start, end in (
            (schedule.start_time, start_time),
            (end_time, schedule.end_time),
        )
        if start < end
    ]

    schedule.start_time = start_time
    schedule.end_time = end_time
    schedule.student_id = substitute_id

    remainders = [
        models.WorkSchedule(
            batch_id=schedule.batch_id,
            student_id=original_owner,
            department_id=schedule.department_id,
            work_date=schedule.work_date,
            start_time=start,
            end_time=end,
        )
        for start, end in leftovers
    ]
    db.add_all(remainders)
    db.flush()  # 호출부가 새 schedule_id를 필요로 한다
    return schedule, remainders


def _covering_row(
    db: Session,
    batch_id: int,
    student_id: str,
    work_date: date,
    start_time: time,
    end_time: time,
) -> "models.WorkSchedule | None":
    """요청 구간을 **통째로 품는** 원 근무자의 행 하나 (없으면 None).

    부분만 겹치는 행은 쓰지 않는다. 승인된 것은 "15–17시를 B가 한다"인데 새 계획에서
    원 근무자가 15–16시만 일한다면, 겹치는 만큼만 넘기는 것은 **B가 동의하지 않은
    다른 근무를 만드는 일**이다. 그런 경우는 얹지 않고 해제로 처리해 사람이 다시
    정하게 한다 (#231).

    merge_blocks가 연속 근무를 한 행으로 합쳐 저장하므로(scheduler/reporting.py),
    한 학생의 하루 연속 구간은 보통 행 하나에 들어온다 — 구간이 여러 행에 걸친다는
    것은 사이에 근무하지 않는 시간이 있다는 뜻이라 어차피 얹을 수 없다.
    """
    return (
        db.query(models.WorkSchedule)
        .filter(
            models.WorkSchedule.batch_id == batch_id,
            models.WorkSchedule.student_id == student_id,
            models.WorkSchedule.work_date == work_date,
            models.WorkSchedule.start_time <= start_time,
            models.WorkSchedule.end_time >= end_time,
        )
        .first()
    )


def apply_approved_substitutes(
    db: Session,
    batch: "models.ScheduleBatch",
    department_id: int,
    period_start: date,
    period_end: date,
) -> list[dict]:
    """새로 만든 확정 배치에 그 기간의 승인된 대타를 다시 얹는다 (#230).

    **확정 배치를 만드는 경로는 반드시 이 함수를 거쳐야 한다.** 재적용을 호출부마다
    기억해서 부르는 구조로 두면, 근무표 행을 갈아끼우는 경로가 하나 늘 때마다
    (draft 재생성·draft 편집·챗봇 쓰기 툴) 빠뜨릴 자리가 생기고 그때도 아무도
    모른다 — #178이 정확히 그렇게 생긴 문제다.

    얹을 자리가 있으면 분할하고 요청의 schedule_id를 새 행으로 갱신한다. 자리가
    없으면 '해제됨'으로 전이하고 그 목록을 돌려준다 — 호출부가 확정 응답에 실어
    담당자에게 알린다 (#231).
    """
    approved = (
        db.query(models.SubstituteRequest)
        .filter(
            models.SubstituteRequest.status == STATUS_APPROVED,
            models.SubstituteRequest.department_id == department_id,
            models.SubstituteRequest.work_date >= period_start,
            models.SubstituteRequest.work_date <= period_end,
        )
        .order_by(
            models.SubstituteRequest.work_date,
            models.SubstituteRequest.start_time,
            models.SubstituteRequest.request_id,
        )
        .all()
    )

    released: list[dict] = []
    for request in approved:
        row = _covering_row(
            db, batch.batch_id, request.requester_id,
            request.work_date, request.start_time, request.end_time,
        )
        if row is None:
            request.status = STATUS_RELEASED
            released.append({
                "request_id": request.request_id,
                "work_date": request.work_date,
                "start_time": request.start_time,
                "end_time": request.end_time,
                "requester_id": request.requester_id,
                "substitute_id": request.substitute_id,
            })
            continue

        substitute_row, _ = split_for_substitute(
            db, row, request.start_time, request.end_time, request.substitute_id,
        )
        # schedule_id는 "지금 이 승인이 반영된 행"을 가리키는 포인터다 (#229).
        # 근무표 화면이 이 값으로 대타 칸을 찾으므로 새 배치의 행으로 옮긴다.
        request.schedule_id = substitute_row.schedule_id

    db.flush()
    return released
