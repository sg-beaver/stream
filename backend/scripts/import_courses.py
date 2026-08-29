"""SAINT '개설교과목정보' 내려받기 파일 → 시드용 과목 CSV (#173).

SAINT가 주는 파일은 확장자가 .xls지만 실제 내용은 **HTML 표**다
(`<table>` 안에 `<tr><td>`). 그래서 엑셀 라이브러리 없이 표준 라이브러리로 읽는다.

한 과목이 여러 요일에 열리므로("월,수 10:30~11:45") CSV는 **수업 시간 한 줄에
한 행**이다 — 다른 시드 CSV와 같은 결이고, 사람이 열어 고치기도 쉽다.

사용법 (backend/ 디렉토리에서):
    python3 scripts/import_courses.py <내려받은 파일> --term 2026-2 \
        --out scripts/seed_data/courses_2026_2.csv

수업 시간이 비어 있는 과목(온라인·집중강의 등)은 근무 시간을 만들 수 없어 건너뛰고,
건너뛴 과목은 실행 끝에 목록으로 알려준다.
"""

import argparse
import csv
import html
import re
import sys

DAY_NUMBERS = {"월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6, "일": 7}
FIELDS = [
    "term", "course_code", "section", "title", "department_name",
    "credits", "professor", "enrolled_count", "day_of_week", "start_time", "end_time", "room",
]

# "월,수 10:30~11:45 [X513]" — 강의실은 없을 수 있다 (미배정·온라인)
TIME_PATTERN = re.compile(
    r"([월화수목금토일](?:,[월화수목금토일])*)\s+(\d{1,2}:\d{2})~(\d{1,2}:\d{2})"
    r"(?:\s*\[([^\]]+)\])?"
)


def _cells(row_html):
    return [
        html.unescape(re.sub(r"<[^>]+>", "", cell)).strip()
        for cell in re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S)
    ]


def parse(path):
    """SAINT 파일 → (과목 dict 목록, 수업 시간이 없어 건너뛴 과목 목록)."""
    with open(path, encoding="utf-8", errors="replace") as f:
        raw = f.read()
    rows = re.findall(r"<tr>(.*?)</tr>", raw, re.S)
    if not rows:
        raise SystemExit(f"{path}: 표를 찾지 못했습니다 (SAINT 내려받기 파일이 맞나요?)")

    header = {name: i for i, name in enumerate(_cells(rows[0]))}
    required = ["과목번호", "분반", "과목명", "학과", "수업시간/강의실"]
    missing = [name for name in required if name not in header]
    if missing:
        raise SystemExit(f"{path}: 필요한 열이 없습니다 — {', '.join(missing)}")

    courses, skipped = [], []
    for cells in (_cells(r) for r in rows[1:]):
        if len(cells) <= max(header.values()):
            continue

        def value(name):
            index = header.get(name)
            return cells[index] if index is not None else ""

        meetings = []
        # 한 과목이 "월 09:00~10:15 [A] 수 13:00~14:15 [B]"처럼 여러 덩어리일 수 있다
        for days, start, end, room in TIME_PATTERN.findall(value("수업시간/강의실")):
            for day in days.split(","):
                meetings.append((DAY_NUMBERS[day], start, end, room or ""))

        label = f"{value('과목번호')}-{value('분반')} {value('과목명')}"
        if not meetings:
            skipped.append(label)
            continue
        courses.append(dict(
            course_code=value("과목번호"), section=value("분반"), title=value("과목명"),
            department_name=value("학과"), credits=value("학점"),
            professor=value("교수진"),
            # 수강생 수는 "0000000022"처럼 0으로 채워져 온다
            enrolled_count=str(int(value("수강생수") or 0)),
            meetings=sorted(meetings),
        ))
    return courses, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="SAINT에서 내려받은 개설교과목정보 파일")
    parser.add_argument("--term", required=True, help='학기 키 (예: "2026-2")')
    parser.add_argument("--out", required=True, help="쓸 CSV 경로")
    args = parser.parse_args()

    courses, skipped = parse(args.source)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for course in courses:
            for day, start, end, room in course["meetings"]:
                writer.writerow({
                    "term": args.term,
                    **{k: v for k, v in course.items() if k != "meetings"},
                    "day_of_week": day, "start_time": start, "end_time": end, "room": room,
                })

    by_dept = {}
    for course in courses:
        by_dept[course["department_name"]] = by_dept.get(course["department_name"], 0) + 1
    print(f"{args.out}: 과목 {len(courses)}개 · 수업 시간 "
          f"{sum(len(c['meetings']) for c in courses)}줄 ({args.term})")
    for dept, count in sorted(by_dept.items(), key=lambda kv: -kv[1]):
        print(f"  {dept}: {count}개")
    if skipped:
        print(f"수업 시간이 없어 건너뜀 {len(skipped)}개: {', '.join(skipped)}", file=sys.stderr)


if __name__ == "__main__":
    main()
