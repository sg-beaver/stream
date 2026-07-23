"""근무 시간표 생성 프로토타입 실행 진입점.

실행:
    cd backend
    .venv/bin/python -m app.scheduler.prototype

더미 데이터(config/sample/students_sample.json)와 MVP 정책
(로욜라도서관 정보서비스팀)으로 2주 시간표를 생성해 출력한다.
"""

import argparse
from datetime import timedelta

from .config import (
    load_academic_calendar,
    load_department_policy,
    load_sample_students,
)
from .engine import ScheduleSolver
from .reporting import print_report


def main() -> None:
    parser = argparse.ArgumentParser(description="근무 시간표 생성 프로토타입")
    parser.add_argument(
        "--department", default="library_info_service", help="부서 정책 ID"
    )
    parser.add_argument("--sample", default="students_sample", help="샘플 데이터 이름")
    parser.add_argument(
        "--time-limit", type=float, default=30.0, help="솔버 시간 제한(초)"
    )
    parser.add_argument("--html", default=None, help="HTML 리포트 저장 경로")
    args = parser.parse_args()

    policy = load_department_policy(args.department)
    students, start_date, num_days = load_sample_students(args.sample)
    calendar = load_academic_calendar(start_date.year)

    print(f"부서: {policy.department_name}")
    end_date = start_date + timedelta(days=num_days - 1)
    print(f"기간: {start_date} ~ {end_date} ({num_days}일)")
    print(f"근로학생: {len(students)}명")

    solver = ScheduleSolver(
        policy=policy,
        calendar=calendar,
        students=students,
        start_date=start_date,
        num_days=num_days,
    )
    result, ctx = solver.solve(time_limit_seconds=args.time_limit)
    print(f"배정 변수 수: {len(ctx.variables)}")
    print_report(result, ctx.grid, students, calendar)

    if args.html and result.is_feasible:
        from pathlib import Path

        from .reporting_html import render_html

        html = render_html(
            result, ctx.grid, students, calendar, policy,
            title=f"{policy.department_name} 근무 시간표 ({start_date}~{end_date})",
        )
        out = Path(args.html)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        print(f"HTML 리포트 저장: {out}")


if __name__ == "__main__":
    main()
