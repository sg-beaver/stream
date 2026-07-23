"""스케줄러 공용 열거형."""

from enum import Enum


class FundingType(str, Enum):
    """근로 재원 구분."""

    GYOBI = "gyobi"  # 교비 근로
    GUKGA = "gukga"  # 국가 근로


class PeriodType(str, Enum):
    """학사 기간 구분."""

    SEMESTER = "semester"  # 학기 중
    VACATION = "vacation"  # 방학 중


class Weekday(int, Enum):
    """요일 (datetime.date.weekday()와 동일한 인덱스)."""

    MON = 0
    TUE = 1
    WED = 2
    THU = 3
    FRI = 4
    SAT = 5
    SUN = 6

    @classmethod
    def from_key(cls, key: str) -> "Weekday":
        return cls[key.upper()]

    @property
    def key(self) -> str:
        return self.name.lower()
