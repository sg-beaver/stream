"""부서 근무표에서 특정 기간만 비운다 (배포 데모 준비용).

    python scripts/clear_schedule_range.py --department 2 --from 2026-08-31 --to 2026-09-06
    python scripts/clear_schedule_range.py --department 2 --from 2026-08-31 --to 2026-09-06 --apply

기본은 **미적용**이다 — 무엇이 바뀌는지만 출력하고 롤백한다. `--apply`를 붙여야 커밋한다.

## 지우지 않고 떼어낸다

근무 행(work_schedule)을 DELETE하지 않고, 그 기간 몫만 **status="superseded" 배치로
옮긴다.** 근무표 조회는 confirmed·manual 배치만 보므로(routers/schedule.py
`_EFFECTIVE_STATUSES`) 화면에서는 그 기간이 비어 보이고, 다음 두 가지가 살아남는다.

- 대타 요청 — `substitute_request.schedule_id`는 NOT NULL FK다. 근무 행을 지우면
  그 요청까지 같이 지워야 하고, 데모용 대기·반려 요청이 통째로 사라진다.
- 되돌리기 — 떼어낸 배치의 status를 confirmed로 돌리면 원래대로다. 스크립트가
  그 batch_id를 출력한다.

기간이 배치의 앞이나 뒤를 자르면 남은 배치의 period도 함께 좁힌다. 가운데만
뚫는 경우(앞뒤가 다 남는 경우)는 기간 하나로 표현할 수 없어 원래 period를 둔다.

초안(draft)·이미 superseded인 배치는 건드리지 않는다 — 어차피 화면에 안 보인다.
"""

import argparse
import datetime
import sys

sys.path.insert(0, ".")

from app import models  # noqa: E402
from app.database import SessionLocal  # noqa: E402

# routers/schedule.py의 _EFFECTIVE_STATUSES와 같은 값. 조회에 잡히는 배치만
# 비우면 되므로 draft·superseded는 대상이 아니다.
EFFECTIVE_STATUSES = ("confirmed", "manual")
SUPERSEDED = "superseded"

ONE_DAY = datetime.timedelta(days=1)


def _clip_period(period_start, period_end, start, end):
    """[start, end]를 들어낸 뒤 남는 기간. 전부 들어내면 None."""
    if start <= period_start and end >= period_end:
        return None
    if start <= period_start:
        return end + ONE_DAY, period_end
    if end >= period_end:
        return period_start, start - ONE_DAY
    return period_start, period_end  # 가운데만 뚫린 경우 — 기간은 그대로 둔다


def clear_range(db, department_id, start, end):
    """부서의 확정 근무표에서 [start, end]만 비운다. 커밋하지 않는다.

    반환값은 무엇을 옮겼는지 적은 보고서다 (CLI 출력·테스트가 함께 쓴다).
    """
    rows = (
        db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.department_id == department_id,
            models.WorkSchedule.work_date >= start,
            models.WorkSchedule.work_date <= end,
            models.ScheduleBatch.status.in_(EFFECTIVE_STATUSES),
        )
        .order_by(models.WorkSchedule.work_date, models.WorkSchedule.start_time)
        .all()
    )

    by_batch = {}
    for row in rows:
        by_batch.setdefault(row.batch_id, []).append(row)

    report = {"batches": [], "moved_total": len(rows), "substitute_requests": []}

    for batch_id, moved in sorted(by_batch.items()):
        batch = db.get(models.ScheduleBatch, batch_id)
        kept = (
            db.query(models.WorkSchedule)
            .filter(
                models.WorkSchedule.batch_id == batch_id,
                ~models.WorkSchedule.schedule_id.in_([r.schedule_id for r in moved]),
            )
            .count()
        )

        dates = {}
        for row in moved:
            dates[row.work_date] = dates.get(row.work_date, 0) + 1

        entry = {
            "batch_id": batch_id,
            "status": batch.status,
            "period": (batch.period_start, batch.period_end),
            "moved": len(moved),
            "kept": kept,
            "dates": dates,
        }

        if kept == 0:
            # 배치 전체가 지울 기간 안에 있다 — 새 배치를 만들 것 없이 통째로 내린다.
            batch.status = SUPERSEDED
            entry["moved_batch_id"] = batch_id
            entry["new_period"] = None
        else:
            split = models.ScheduleBatch(
                department_id=batch.department_id,
                period_start=max(batch.period_start, start),
                period_end=min(batch.period_end, end),
                status=SUPERSEDED,
                created_by=batch.created_by,
                # solver_summary는 원 배치 전체(양쪽 주)를 설명하는 값이라 옮기지
                # 않는다 — 떼어낸 조각에 붙이면 그 조각의 채점표처럼 읽힌다.
                solver_summary=None,
            )
            db.add(split)
            db.flush()
            for row in moved:
                row.batch_id = split.batch_id
            # kept > 0이면 기간 밖 근무가 남아 있으므로 남는 기간도 반드시 있다.
            # None이 나오면 근무 날짜가 배치 period 밖에 있는 어긋난 데이터이므로
            # period를 건드리지 않는다.
            remaining = _clip_period(batch.period_start, batch.period_end, start, end)
            if remaining is not None:
                batch.period_start, batch.period_end = remaining
            else:
                remaining = (batch.period_start, batch.period_end)
            entry["moved_batch_id"] = split.batch_id
            entry["new_period"] = remaining

        report["batches"].append(entry)

    if rows:
        requests = (
            db.query(models.SubstituteRequest)
            .filter(
                models.SubstituteRequest.schedule_id.in_([r.schedule_id for r in rows])
            )
            .order_by(models.SubstituteRequest.request_id)
            .all()
        )
        report["substitute_requests"] = [
            {
                "request_id": r.request_id,
                "status": r.status,
                "work_date": r.work_date,
                "requester_id": r.requester_id,
            }
            for r in requests
        ]

    return report


def _count_leftovers(db, department_id, start, end, status):
    return (
        db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.department_id == department_id,
            models.WorkSchedule.work_date >= start,
            models.WorkSchedule.work_date <= end,
            models.ScheduleBatch.status == status,
        )
        .count()
    )


def _print_report(db, department_id, start, end, report, applied):
    department = db.get(models.Department, department_id)
    name = department.name if department else f"부서 {department_id}"
    print(f"{name}({department_id}) {start} ~ {end}")

    if not report["batches"]:
        print("  비울 근무가 없습니다 — 그 기간은 이미 비어 있습니다.")
        return

    for entry in report["batches"]:
        period = f"{entry['period'][0]} ~ {entry['period'][1]}"
        print(
            f"  배치 {entry['batch_id']} ({entry['status']}, {period}) "
            f"— 근무 {entry['moved']}건 내림 · {entry['kept']}건 유지"
        )
        for day, count in sorted(entry["dates"].items()):
            print(f"      {day} {count}건")
        if entry["kept"] == 0:
            print(f"      배치 전체를 {SUPERSEDED}로 내림 (되돌리기: 이 배치 status)")
        else:
            print(
                f"      떼어낸 배치 {entry['moved_batch_id']}({SUPERSEDED}) "
                f"· 남는 기간 {entry['new_period'][0]} ~ {entry['new_period'][1]}"
            )

    if report["substitute_requests"]:
        print(f"  같이 안 보이게 되는 대타 요청 {len(report['substitute_requests'])}건 "
              f"(행은 지우지 않음):")
        for r in report["substitute_requests"]:
            print(f"      #{r['request_id']} {r['status']} {r['work_date']} {r['requester_id']}")

    draft = _count_leftovers(db, department_id, start, end, "draft")
    if draft:
        print(f"  ⓘ 같은 기간 초안(draft) 근무 {draft}건은 그대로 둡니다 — 화면에 보이지 않습니다.")

    print(f"  근무 {report['moved_total']}건 " + ("반영 완료." if applied else "— 미적용(--apply 없이 실행)."))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--department", type=int, required=True, help="부서 ID (정보서비스팀=2)")
    parser.add_argument(
        "--from", dest="start", required=True, type=datetime.date.fromisoformat,
        help="비울 기간 시작일 (YYYY-MM-DD, 포함)",
    )
    parser.add_argument(
        "--to", dest="end", required=True, type=datetime.date.fromisoformat,
        help="비울 기간 종료일 (YYYY-MM-DD, 포함)",
    )
    parser.add_argument("--apply", action="store_true", help="실제로 반영 (기본: 미적용)")
    args = parser.parse_args()

    if args.end < args.start:
        print("기간의 시작일이 종료일보다 늦습니다.")
        sys.exit(1)

    db = SessionLocal()
    try:
        report = clear_range(db, args.department, args.start, args.end)
        if args.apply:
            db.commit()
        else:
            db.rollback()
        _print_report(db, args.department, args.start, args.end, report, args.apply)
    finally:
        db.close()


if __name__ == "__main__":
    main()
