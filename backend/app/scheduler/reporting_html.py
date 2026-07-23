"""배정 결과 HTML 리포트 — 운영 엑셀처럼 주차별 그리드로 시각화 + 배정 근거 표시.

담당자가 배정 결과를 판단할 수 있도록 근거를 함께 보여준다:
- 부서 그리드: 셀에 배정자(★=희망 시간 매치)와 툴팁(그 슬롯 가능 후보 전원,
  발생한 페널티). 빈 슬롯은 '가능자 없음(빨강)'과 '가능자는 있으나 다른
  제약으로 미배정(주황)'을 구분해 표시.
- 주차별 페널티 배지 + 상세 내역(무엇이 얼마나 희생됐는지).
- 학생별 뷰: 수합받은 가능/희망/수업 시간 위에 배정 결과를 겹쳐 보여주는
  개인 그리드 (학생 탭 전환, 클라이언트 렌더링).

외부 리소스 없이 단독 HTML로 렌더링된다.
"""

import json
from collections import defaultdict
from datetime import date, timedelta

from .domain import (
    AcademicCalendar,
    DepartmentPolicy,
    FundingType,
    ScheduleResult,
    Student,
    TimeGrid,
    minutes_to_str,
)
from .reporting import summarize_student_hours

_WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]

# 학생 구분용 팔레트 (밝은 배경 + 어두운 글자 — 라이트/다크 공통 가독)
_PALETTE = [
    "#aecbfa", "#f8bbd0", "#c8e6c9", "#ffe082", "#d1c4e9", "#ffccbc",
    "#b2dfdb", "#f0f4c3", "#ffab91", "#b3e5fc", "#e6ee9c", "#f48fb1",
]

_PENALTY_LABELS = {
    "understaffing": "최소 인원 미달",
    "preferred_staffing": "선호 인원(2명) 미충족",
    "preference_match": "희망 외 시간 배정",
    "contiguity": "근무 블록 분절",
    "meal_break": "식사 시간 미확보",
    "morning_rules": "아침 근무 규칙 위반",
    "exam_proximity": "시험 직전 배정",
    "avoid_range": "회피 요청 시간 배정",
    "non_campus_day": "비등교일 배정",
    "fair_hours": "주간 목표 시간 미달",
}

_SUMMER_START = date(2026, 6, 23)  # 여름학기 시작 (주차 표기용)


def render_html(
    result: ScheduleResult,
    grid: TimeGrid,
    students: list[Student],
    calendar: AcademicCalendar,
    policy: DepartmentPolicy,
    title: str = "근무 시간표",
) -> str:
    by_id = {s.student_id: s for s in students}
    colors = {s.student_id: _PALETTE[i % len(_PALETTE)] for i, s in enumerate(students)}
    shortage_set = {(s.day, s.slot_min) for s in result.shortages}

    # 슬롯별 가능 후보 (수합 데이터 기준 — 배정 근거의 핵심)
    candidates: dict[tuple[date, int], list[str]] = {}
    for day in grid.dates:
        for minute in grid.slots_of(day):
            candidates[(day, minute)] = [
                s.student_id for s in students if s.can_work(day, minute, calendar)
            ]

    # 페널티 이벤트를 날짜/슬롯별로 인덱싱
    events_by_slot: dict[tuple[date, int], list] = defaultdict(list)
    events_by_day: dict[date, list] = defaultdict(list)
    for ev in result.penalty_events:
        if ev.day is not None:
            events_by_day[ev.day].append(ev)
            if ev.minute is not None:
                events_by_slot[(ev.day, ev.minute)].append(ev)

    weeks = _split_weeks(grid.dates)
    sections = [
        _render_week(
            i, w, grid, result, calendar, by_id, colors,
            shortage_set, candidates, events_by_slot, events_by_day,
        )
        for i, w in enumerate(weeks, start=1)
    ]
    nav = "".join(
        f'<a class="wk" href="#w{i}">{_week_name(i, w[0])}</a>'
        for i, w in enumerate(weeks, start=1)
    )

    legend = "".join(
        f'<span class="chip" style="background:{colors[s.student_id]}">'
        f'{s.name} ({"교비" if s.funding_type == FundingType.GYOBI else "국가"})</span>'
        for s in students
    )
    breakdown = "".join(
        f'<span class="pill">{_PENALTY_LABELS.get(name, name)}: {value:,}</span>'
        for name, value in result.penalty_breakdown.items()
    )
    summary = _render_summary(result, grid, students, weeks)
    student_view = _render_student_view(result, grid, students, colors)

    return f"""<meta charset="utf-8">
<title>{title}</title>
<style>
:root {{ --fg:#1f2430; --bg:#ffffff; --line:#d6dbe4; --muted:#66707f;
        --closed:#eef0f4; --closed-fg:#a8b0bc; --shortage:#d93025; --unfilled:#e8871e;
        --av:#eaf2fe; --pf:#dcefdc; --cl:#e3e5e9; }}
@media (prefers-color-scheme: dark) {{
  :root {{ --fg:#e6e9ef; --bg:#14171c; --line:#3a404b; --muted:#9aa3b0;
          --closed:#1d2127; --closed-fg:#565e6a;
          --av:#1e2b40; --pf:#20321f; --cl:#262a31; }}
}}
:root[data-theme="dark"] {{ --fg:#e6e9ef; --bg:#14171c; --line:#3a404b; --muted:#9aa3b0;
  --closed:#1d2127; --closed-fg:#565e6a; --av:#1e2b40; --pf:#20321f; --cl:#262a31; }}
:root[data-theme="light"] {{ --fg:#1f2430; --bg:#ffffff; --line:#d6dbe4; --muted:#66707f;
  --closed:#eef0f4; --closed-fg:#a8b0bc; --av:#eaf2fe; --pf:#dcefdc; --cl:#e3e5e9; }}
body {{ font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:var(--fg);
       background:var(--bg); margin:24px; }}
h1 {{ font-size:1.4rem; }} h2 {{ font-size:1.05rem; margin:28px 0 6px; }}
.meta {{ color:var(--muted); font-size:.85rem; margin-bottom:12px; }}
.chip {{ display:inline-block; padding:2px 8px; border-radius:10px; margin:2px;
        font-size:.78rem; color:#1f2430; }}
.pill {{ display:inline-block; padding:2px 8px; border-radius:10px; margin:2px;
        font-size:.78rem; border:1px solid var(--line); color:var(--muted); }}
.badge {{ display:inline-block; padding:1px 8px; border-radius:10px; font-size:.72rem;
         border:1px solid var(--line); color:var(--muted); font-weight:normal;
         margin-left:8px; vertical-align:middle; }}
.scroll {{ overflow-x:auto; }}
table {{ border-collapse:collapse; font-size:.75rem; }}
th, td {{ border:1px solid var(--line); padding:2px 6px; text-align:center;
         min-width:96px; height:20px; }}
th.time, td.time {{ min-width:76px; color:var(--muted); font-variant-numeric:tabular-nums; }}
td.closed {{ background:var(--closed); color:var(--closed-fg); }}
td.novacancy {{ outline:2px solid var(--shortage); outline-offset:-2px; }}
td.unfilled {{ outline:2px dashed var(--unfilled); outline-offset:-2px; }}
td .chip {{ margin:0 1px; padding:1px 6px; }}
.note {{ font-size:.68rem; color:var(--muted); font-weight:normal; }}
.sum td, .sum th {{ min-width:0; }}
.nav {{ position:sticky; top:0; background:var(--bg); padding:6px 0; z-index:2;
       border-bottom:1px solid var(--line); }}
.wk {{ display:inline-block; margin:2px 3px; padding:2px 8px; border:1px solid var(--line);
      border-radius:10px; font-size:.75rem; color:var(--fg); text-decoration:none; }}
.wk:hover {{ background:var(--closed); }}
details {{ margin:6px 0 14px; font-size:.78rem; color:var(--muted); }}
details li {{ margin:2px 0; }}
.keys {{ font-size:.75rem; color:var(--muted); margin:8px 0 16px; }}
.keys span {{ margin-right:14px; }}
.swatch {{ display:inline-block; width:12px; height:12px; border:1px solid var(--line);
          border-radius:3px; vertical-align:-2px; margin-right:4px; }}
.stbtn {{ margin:2px 3px; padding:3px 10px; border:1px solid var(--line); border-radius:12px;
         background:var(--bg); color:var(--fg); font-size:.8rem; cursor:pointer; }}
.stbtn.on {{ font-weight:bold; border-width:2px; }}
td.p-as {{ font-weight:bold; outline:2px solid currentColor; outline-offset:-2px; }}
td.p-av {{ background:var(--av); }}
td.p-pf {{ background:var(--pf); }}
td.p-cl {{ background:var(--cl); color:var(--muted); }}
</style>
<h1>{title}</h1>
<div class="meta">솔버 상태: <b>{result.status}</b> · 풀이 {result.solve_time_seconds:.1f}초
 · 총 페널티 {result.objective_value:,} · 최소 인원 미달 슬롯 {len(result.shortages)}개</div>
<div class="meta">{breakdown}</div>
<div>{legend}</div>
<div class="keys">
<span>★ 희망 시간 매치</span>
<span><span class="swatch" style="outline:2px solid var(--shortage); outline-offset:-2px"></span>가능자 없음 (수합 데이터상 아무도 불가)</span>
<span><span class="swatch" style="outline:2px dashed var(--unfilled); outline-offset:-2px"></span>가능자 있으나 미배정 (상한·다른 슬롯 우선 — 셀에 후보 표시)</span>
<span>셀에 마우스를 올리면 가능 후보/근거 표시</span>
</div>
<div class="nav">{nav}</div>
{"".join(sections)}
{summary}
{student_view}
"""


def _week_name(index: int, week_start: date) -> str:
    """운영 워크북의 주차 표기를 따름: 1~16주차, 17주차(기말), 여름 2~N주차."""
    if week_start + timedelta(days=6) < _SUMMER_START:
        return f"{index}주차"
    summer_index = (week_start - date(2026, 6, 22)).days // 7 + 1
    if summer_index <= 1:
        return "17주차(기말)"
    return f"여름 {summer_index}주차"


def _split_weeks(dates: list[date]) -> list[list[date]]:
    weeks: dict[date, list[date]] = {}
    for d in dates:
        monday = d - timedelta(days=d.weekday())
        weeks.setdefault(monday, []).append(d)
    return [sorted(v) for _, v in sorted(weeks.items())]


def _date_note(day: date, grid: TimeGrid, calendar: AcademicCalendar) -> str:
    notes = []
    if calendar.is_closed(day):
        notes.append("폐관")
    elif calendar.is_public_holiday(day):
        notes.append("공휴일" if grid.slots_of(day) else "휴관")
    if calendar.is_school_only_holiday(day):
        notes.append("교내휴강")
    if calendar.is_exam_extended_weekend(day):
        notes.append("연장개관")
    return " · ".join(notes)


def _slot_tooltip(day, minute, grid, by_id, assigned, cand_ids, slot_events) -> str:
    lines = [f"{day.month}.{day.day}({_WEEKDAY_KO[day.weekday()]}) "
             f"{minutes_to_str(minute)}~{minutes_to_str(minute + grid.slot_minutes)}"]
    if cand_ids:
        names = ", ".join(by_id[c].name for c in cand_ids)
        lines.append(f"가능 후보 {len(cand_ids)}명: {names}")
    else:
        lines.append("가능 후보 없음 (수합 데이터상 전원 수업/기타/미제출)")
    if assigned:
        marks = [
            by_id[sid].name + ("★" if by_id[sid].is_preferred(day, minute) else "")
            for sid in assigned
        ]
        lines.append(f"배정: {', '.join(marks)}")
    elif cand_ids:
        lines.append("미배정: 후보가 주간 상한 도달 또는 다른 슬롯에 우선 배정됨")
    for ev in slot_events:
        label = _PENALTY_LABELS.get(ev.name, ev.name)
        who = by_id[ev.student_id].name + " — " if ev.student_id else ""
        lines.append(f"⚠ {who}{label} (페널티 {ev.cost})")
    return "&#10;".join(lines)


def _render_week(
    index, week_dates, grid, result, calendar, by_id, colors,
    shortage_set, candidates, events_by_slot, events_by_day,
) -> str:
    slots_union = sorted({m for d in week_dates for m in grid.slots_of(d)})
    first, last = week_dates[0], week_dates[-1]
    week_cost = sum(ev.cost for d in week_dates for ev in events_by_day.get(d, []))
    label = (
        f"{_week_name(index, first)} · {first.month}.{first.day} ~ {last.month}.{last.day}"
        f"<span class='badge'>페널티 {week_cost:,}</span>"
    )
    if not slots_union:
        return f"<h2 id='w{index}'>{label}</h2><div class='meta'>전 주 폐관</div>"

    head = "".join(
        f"<th>{d.month}.{d.day} ({_WEEKDAY_KO[d.weekday()]})"
        + (f"<div class='note'>{note}</div>" if (note := _date_note(d, grid, calendar)) else "")
        + "</th>"
        for d in week_dates
    )
    rows = []
    for minute in slots_union:
        cells = []
        for d in week_dates:
            if not grid.is_open(d, minute):
                cells.append("<td class='closed'></td>")
                continue
            assigned = result.assignments.get(d, {}).get(minute, [])
            cand_ids = candidates.get((d, minute), [])
            chips = "".join(
                f"<span class='chip' style='background:{colors[sid]}'>"
                f"{by_id[sid].name}{'★' if by_id[sid].is_preferred(d, minute) else ''}</span>"
                for sid in assigned
            )
            cls = ""
            if (d, minute) in shortage_set:
                cls = " class='novacancy'" if not cand_ids else " class='unfilled'"
            tip = _slot_tooltip(
                d, minute, grid, by_id, assigned, cand_ids,
                events_by_slot.get((d, minute), []),
            )
            cells.append(f"<td{cls} title=\"{tip}\">{chips}</td>")
        end = minutes_to_str(minute + grid.slot_minutes)
        rows.append(
            f"<tr><td class='time'>{minutes_to_str(minute)}~{end}</td>{''.join(cells)}</tr>"
        )
    detail = _render_week_events(week_dates, grid, by_id, events_by_day)
    return (
        f"<h2 id='w{index}'>{label}</h2><div class='scroll'><table>"
        f"<tr><th class='time'>시간</th>{head}</tr>{''.join(rows)}</table></div>{detail}"
    )


def _render_week_events(week_dates, grid, by_id, events_by_day) -> str:
    """주차별 페널티 상세: (제약, 학생, 날짜) 단위로 묶어 사람이 읽을 문장으로."""
    grouped: dict[tuple[str, str | None, date], list] = defaultdict(list)
    for d in week_dates:
        for ev in events_by_day.get(d, []):
            if ev.name == "contiguity":
                continue  # 블록 시작 수 — 근무마다 발생하는 기본 항이라 상세에서 제외
            grouped[(ev.name, ev.student_id, d)].append(ev)
    if not grouped:
        return ""
    lines = []
    for (name, sid, d), evs in sorted(grouped.items(), key=lambda kv: -sum(e.cost for e in kv[1])):
        label = _PENALTY_LABELS.get(name, name)
        who = f"{by_id[sid].name} — " if sid else ""
        amount = sum(e.amount for e in evs)
        cost = sum(e.cost for e in evs)
        unit = ""
        if name in ("understaffing", "preferred_staffing", "preference_match", "fair_hours"):
            unit = f" {grid.slots_to_hours(amount):.1f}h"
        lines.append(
            f"<li>{who}{label} · {d.month}.{d.day}({_WEEKDAY_KO[d.weekday()]}){unit}"
            f" <span class='note'>(페널티 {cost:,})</span></li>"
        )
    return (
        f"<details><summary>이 주 페널티 상세 ({len(lines)}건)</summary>"
        f"<ul>{''.join(lines)}</ul></details>"
    )


def _render_summary(result, grid, students, weeks) -> str:
    week_starts = [w[0] for w in weeks]
    head = "".join(f"<th>{w.month}.{w.day}~</th>" for w in week_starts)
    rows = []
    for s in students:
        summary = summarize_student_hours(result, grid, s)
        per_week = {}
        for d, hours in summary["per_day"].items():
            monday = d - timedelta(days=d.weekday())
            per_week[monday] = per_week.get(monday, 0) + hours
        cells = "".join(f"<td>{per_week.get(w, 0) or ''}</td>" for w in week_starts)
        funding = "교비" if s.funding_type == FundingType.GYOBI else "국가"
        assigned_slots = [
            (d, m) for d, slots in result.slots_of_student(s.student_id).items() for m in slots
        ]
        pref_slots = sum(1 for d, m in assigned_slots if s.is_preferred(d, m))
        pref_rate = f"{pref_slots / len(assigned_slots) * 100:.0f}%" if assigned_slots else "—"
        rows.append(
            f"<tr><td>{s.name}</td><td>{funding}</td>{cells}"
            f"<td><b>{summary['total']:.1f}</b></td><td>{pref_rate}</td></tr>"
        )
    return (
        "<h2>개인별 주간 근무 시간 (h)</h2><div class='scroll'><table class='sum'>"
        f"<tr><th>학생</th><th>재원</th>{head}<th>합계</th><th>희망 반영률</th></tr>"
        f"{''.join(rows)}</table></div>"
    )


def _render_student_view(result, grid, students, colors) -> str:
    """학생별 뷰: 수합받은 가능/희망/수업 시간 위에 배정을 겹쳐 표시 (탭 전환)."""
    data = {
        "slotMinutes": grid.slot_minutes,
        "days": [
            {"d": d.isoformat(), "open": grid.slots_of(d)}
            for d in grid.dates
        ],
        "students": [],
    }
    for s in students:
        assigned = {
            d.isoformat(): slots for d, slots in result.slots_of_student(s.student_id).items()
        }
        per_day = {}
        for d in grid.dates:
            open_slots = grid.slots_of(d)
            if not open_slots:
                continue
            av, pf, cl = [], [], []
            for m in open_slots:
                # date_schedule/주간 반복 어느 쪽이든 동일한 판정 API 사용
                if s.date_schedule is not None:
                    ds = s.date_schedule.get(d)
                    in_av = ds is not None and any(a <= m < b for a, b in ds.available)
                    in_pf = ds is not None and any(a <= m < b for a, b in ds.preferred)
                    in_cl = ds is not None and any(a <= m < b for a, b in ds.classes)
                else:
                    from .domain import Weekday

                    wd = Weekday(d.weekday())
                    in_av = s.available.contains(wd, m)
                    in_pf = s.preferred.contains(wd, m)
                    in_cl = s.class_times.contains(wd, m)
                if in_av:
                    av.append(m)
                if in_pf:
                    pf.append(m)
                if in_cl:
                    cl.append(m)
            if av or pf or cl or d.isoformat() in assigned:
                per_day[d.isoformat()] = {"av": av, "pf": pf, "cl": cl}
        data["students"].append(
            {
                "id": s.student_id,
                "name": s.name,
                "color": colors[s.student_id],
                "sched": per_day,
                "assigned": assigned,
            }
        )

    payload = json.dumps(data, ensure_ascii=False)
    return f"""
<h2 id="students">학생별 수합 시간표 + 배정 결과</h2>
<div class="keys">
<span><span class="swatch" style="background:var(--pf)"></span>근무 희망으로 제출</span>
<span><span class="swatch" style="background:var(--av)"></span>근무 가능으로 제출</span>
<span><span class="swatch" style="background:var(--cl)"></span>수업</span>
<span><span class="swatch" style="outline:2px solid var(--fg); outline-offset:-2px"></span>배정됨 (학생 색상)</span>
</div>
<div id="stbtns"></div>
<div id="stview" class="scroll"></div>
<script>
const DATA = {payload};
const WD = ["월","화","수","목","금","토","일"];
const fmt = m => String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m%60).padStart(2,"0");

function weeksOf(days) {{
  const map = new Map();
  for (const day of days) {{
    const dt = new Date(day.d + "T00:00:00");
    const monday = new Date(dt); monday.setDate(dt.getDate() - (dt.getDay()+6)%7);
    const key = monday.toISOString().slice(0,10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(day);
  }}
  return [...map.entries()].sort();
}}

function renderStudent(idx) {{
  const st = DATA.students[idx];
  document.querySelectorAll(".stbtn").forEach((b,i)=>b.classList.toggle("on", i===idx));
  let html = "";
  for (const [wk, days] of weeksOf(DATA.days)) {{
    const slots = [...new Set(days.flatMap(d=>d.open))].sort((a,b)=>a-b);
    if (!slots.length) continue;
    const anyData = days.some(d => st.sched[d.d] || st.assigned[d.d]);
    if (!anyData) continue;
    const d0 = new Date(wk + "T00:00:00");
    html += `<h2>${{d0.getMonth()+1}}.${{d0.getDate()}} 주</h2><table><tr><th class="time">시간</th>`;
    for (const day of days) {{
      const dt = new Date(day.d + "T00:00:00");
      html += `<th>${{dt.getMonth()+1}}.${{dt.getDate()}} (${{WD[(dt.getDay()+6)%7]}})</th>`;
    }}
    html += "</tr>";
    for (const m of slots) {{
      html += `<tr><td class="time">${{fmt(m)}}~${{fmt(m + DATA.slotMinutes)}}</td>`;
      for (const day of days) {{
        if (!day.open.includes(m)) {{ html += '<td class="closed"></td>'; continue; }}
        const sc = st.sched[day.d] || {{av:[],pf:[],cl:[]}};
        const isAs = (st.assigned[day.d]||[]).includes(m);
        let cls = "", txt = "", style = "";
        if (sc.cl.includes(m)) {{ cls = "p-cl"; txt = "수업"; }}
        else if (sc.pf.includes(m)) {{ cls = "p-pf"; txt = "희망"; }}
        else if (sc.av.includes(m)) {{ cls = "p-av"; txt = "가능"; }}
        if (isAs) {{ cls += " p-as"; txt = "근무"; style = `background:${{st.color}};color:#1f2430`; }}
        html += `<td class="${{cls}}" style="${{style}}">${{txt}}</td>`;
      }}
      html += "</tr>";
    }}
    html += "</table>";
  }}
  document.getElementById("stview").innerHTML = html || "<div class='meta'>수합 데이터 없음</div>";
}}

const btns = document.getElementById("stbtns");
DATA.students.forEach((st, i) => {{
  const b = document.createElement("button");
  b.className = "stbtn"; b.textContent = st.name;
  b.style.background = st.color; b.style.color = "#1f2430";
  b.onclick = () => renderStudent(i);
  btns.appendChild(b);
}});
renderStudent(0);
</script>
"""
