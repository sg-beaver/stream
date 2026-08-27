"""한국천문연구원 특일 정보 OpenAPI로 학사 캘린더의 공휴일을 갱신한다.

`config/academic_calendar_<year>.json`의 `public_holidays`가 공휴일 캐시 역할을 하고
있어(SCHEDULER_SPEC 7장), 매년 이 스크립트로 한 번 새로 받아 두면 된다.

    export DATA_GO_KR_SERVICE_KEY="발급받은 디코딩 키"
    python scripts/sync_holidays.py 2027           # 차이만 출력 (기본: 미적용)
    python scripts/sync_holidays.py 2027 --apply   # 파일에 반영

API가 알려주는 것은 **법정 공휴일뿐**이다. 다음 두 가지는 부서 운영 정보라
API로 채울 수 없고 사람이 계속 관리한다.

- `closures`: 부서가 아예 문을 닫는 날 (하계 집중 휴무, 추석 연휴 폐관 등).
  추석은 공휴일이면서 동시에 폐관일이라 두 목록의 의미가 다르다 —
  공휴일은 학기 중 단축 개관(HC-OPEN-3), 폐관일은 배정 자체가 없다(HC-OPEN-1).
- `school_only_holidays`: 부활절처럼 우리 학교만 쉬는 날.

그래서 이 스크립트는 `public_holidays`만 건드리고 나머지 키는 그대로 둔다.
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

API_URL = (
    "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
)
CONFIG_DIR = Path(__file__).resolve().parent.parent / "app" / "scheduler" / "config"
TIMEOUT_SECONDS = 10


def fetch_holidays(year: int, service_key: str) -> list[str]:
    """그 해의 공휴일(ISO 날짜) 목록. 월 단위로 조회해 합친다."""
    holidays: set[str] = set()

    for month in range(1, 13):
        query = urllib.parse.urlencode(
            {
                "serviceKey": service_key,
                "solYear": year,
                "solMonth": f"{month:02d}",
                "numOfRows": 100,
                "_type": "json",
            }
        )
        with urllib.request.urlopen(f"{API_URL}?{query}", timeout=TIMEOUT_SECONDS) as res:
            payload = json.loads(res.read().decode("utf-8"))

        # 그 달에 공휴일이 없으면 items가 빈 문자열로 온다
        items = payload["response"]["body"]["items"]
        if not items:
            continue
        rows = items["item"]
        if isinstance(rows, dict):  # 결과가 하나면 배열이 아니라 객체로 온다
            rows = [rows]

        for row in rows:
            if row.get("isHoliday") != "Y":
                continue  # 국경일이지만 쉬지 않는 날(제헌절 등)
            stamp = str(row["locdate"])
            holidays.add(f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}")

    return sorted(holidays)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("year", nargs="?", type=int, default=date.today().year)
    parser.add_argument(
        "--apply", action="store_true", help="차이를 파일에 반영 (기본은 출력만)"
    )
    args = parser.parse_args()

    service_key = os.environ.get("DATA_GO_KR_SERVICE_KEY")
    if not service_key:
        print("DATA_GO_KR_SERVICE_KEY 환경변수가 필요합니다 (공공데이터포털 디코딩 키).")
        return 1

    path = CONFIG_DIR / f"academic_calendar_{args.year}.json"
    if not path.exists():
        print(f"{path.name}이 없습니다. 학기·시험 기간이 든 파일을 먼저 만들어 주세요.")
        return 1

    calendar = json.loads(path.read_text(encoding="utf-8"))
    before = set(calendar.get("public_holidays", []))

    try:
        fetched = fetch_holidays(args.year, service_key)
    except Exception as error:  # 네트워크·키·응답 형식 문제 모두 여기로
        print(f"공휴일 조회 실패 — 기존 파일을 그대로 둡니다: {error}")
        return 1

    after = set(fetched)
    added, removed = sorted(after - before), sorted(before - after)

    print(f"{args.year}년 공휴일 {len(before)}일 → {len(after)}일")
    for day in added:
        print(f"  + {day}")
    for day in removed:
        print(f"  - {day}")
    if not added and not removed:
        print("  변경 없음")
        return 0

    # 폐관일과 겹치는 공휴일은 사람이 한 번 확인해야 한다 (추석 연휴 등)
    overlapping = sorted(after & set(calendar.get("closures", [])))
    if overlapping:
        print("  ※ 폐관일과 겹치는 공휴일(폐관이 우선):", ", ".join(overlapping))

    if not args.apply:
        print("\n--apply를 붙이면 파일에 반영합니다.")
        return 0

    calendar["public_holidays"] = fetched
    path.write_text(
        json.dumps(calendar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\n{path.name}에 반영했습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
