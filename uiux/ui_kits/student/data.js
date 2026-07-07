// Shared mock data for the STREAM UI kits (student + admin).
window.STREAM_DATA = {
  student: { name: "Kim Minjun", sid: "20241023", dept: "Economics", initials: "KM" },

  posts: [
    { id: "p1", title: "Central Library — Reference Desk Assistant", dept: "Central Library", type: "Semester", hours: "12 hrs/week", wage: "₩10,030/hr", slots: 4, applied: 18, closes: "Sep 15", status: "open", tags: ["On-campus", "Weekday"] },
    { id: "p2", title: "IT Helpdesk — Student Support", dept: "Information & Communications", type: "Semester", hours: "10 hrs/week", wage: "₩10,030/hr", slots: 2, applied: 27, closes: "Sep 12", status: "open", tags: ["On-campus", "Rotating"] },
    { id: "p3", title: "Admissions Office — Data Entry", dept: "Admissions Office", type: "Short-term", hours: "8 hrs/week", wage: "₩10,030/hr", slots: 3, applied: 9, closes: "Sep 18", status: "open", tags: ["On-campus", "Weekday"] },
    { id: "p4", title: "Loyola Library — Circulation Support", dept: "Loyola Library", type: "Semester", hours: "12 hrs/week", wage: "₩10,030/hr", slots: 2, applied: 22, closes: "Sep 9", status: "closing", tags: ["On-campus", "Weekend"] },
    { id: "p5", title: "Career Center — Event Operations", dept: "Career Development Center", type: "Short-term", hours: "6 hrs/week", wage: "₩10,030/hr", slots: 5, applied: 4, closes: "Sep 20", status: "open", tags: ["On-campus", "Flexible"] },
  ],

  applications: [
    { id: "a1", post: "Central Library — Reference Desk Assistant", dept: "Central Library", submitted: "2025-09-02", status: "screening" },
    { id: "a2", post: "IT Helpdesk — Student Support", dept: "Information & Communications", submitted: "2025-09-01", status: "submitted" },
    { id: "a3", post: "Career Center — Event Operations", dept: "Career Development Center", submitted: "2025-08-28", status: "selected" },
    { id: "a4", post: "Loyola Library — Night Shelving", dept: "Loyola Library", submitted: "2025-08-20", status: "rejected" },
  ],

  shifts: [
    { day: "Mon", date: "Sep 8", time: "09:00–13:00", place: "Central Library · Reference Desk", hours: 4, status: "scheduled" },
    { day: "Tue", date: "Sep 9", time: "13:00–17:00", place: "Central Library · Circulation", hours: 4, status: "scheduled" },
    { day: "Thu", date: "Sep 11", time: "09:00–12:00", place: "Central Library · Reference Desk", hours: 3, status: "scheduled" },
    { day: "Fri", date: "Sep 12", time: "14:00–18:00", place: "Central Library · Reading Room", hours: 4, status: "swap" },
  ],

  substitutions: [
    { id: "s1", shift: "Sep 12 · 14:00–18:00", place: "Reading Room", reason: "Midterm exam conflict", covered: "Lee Seoyeon", status: "approved", filed: "Sep 5" },
    { id: "s2", shift: "Sep 19 · 09:00–13:00", place: "Reference Desk", reason: "Family event", covered: "—", status: "pending", filed: "Sep 6" },
    { id: "s3", shift: "Aug 29 · 13:00–17:00", place: "Circulation", reason: "Illness", covered: "Park Jiho", status: "covered", filed: "Aug 28" },
  ],

  attendance: [
    { date: "Sep 5", shift: "09:00–13:00", place: "Reference Desk", checkIn: "08:57", checkOut: "13:02", hours: 4.0, status: "present" },
    { date: "Sep 4", shift: "13:00–17:00", place: "Circulation", checkIn: "13:08", checkOut: "17:00", hours: 3.9, status: "late" },
    { date: "Sep 2", shift: "09:00–12:00", place: "Reference Desk", checkIn: "08:55", checkOut: "12:00", hours: 3.1, status: "present" },
    { date: "Aug 29", shift: "13:00–17:00", place: "Circulation", checkIn: "—", checkOut: "—", hours: 0, status: "excused" },
    { date: "Aug 28", shift: "09:00–13:00", place: "Reading Room", checkIn: "—", checkOut: "—", hours: 0, status: "absent" },
  ],

  // ---- Admin ----
  applicants: [
    { id: "u1", name: "Kim Minjun", sid: "20241023", major: "Economics", year: 2, gpa: "3.8", applied: "Sep 2", status: "screening", score: 87 },
    { id: "u2", name: "Lee Seoyeon", sid: "20239981", major: "Business", year: 3, gpa: "3.9", applied: "Sep 1", status: "screening", score: 91 },
    { id: "u3", name: "Park Jiho", sid: "20244412", major: "Computer Science", year: 2, gpa: "3.6", applied: "Sep 2", status: "submitted", score: 78 },
    { id: "u4", name: "Choi Yuna", sid: "20238820", major: "English Literature", year: 4, gpa: "4.0", applied: "Aug 31", status: "selected", score: 95 },
    { id: "u5", name: "Jung Haeun", sid: "20245510", major: "Media & Comm.", year: 1, gpa: "3.5", applied: "Sep 3", status: "waitlist", score: 72 },
    { id: "u6", name: "Yoon Doyoon", sid: "20241199", major: "Physics", year: 3, gpa: "3.7", applied: "Sep 1", status: "submitted", score: 81 },
  ],

  workers: [
    { id: "w1", name: "Choi Yuna", sid: "20238820", dept: "Central Library", role: "Reference Desk", hours: 48.5, attendance: "98%", status: "present" },
    { id: "w2", name: "Kim Minjun", sid: "20241023", dept: "Central Library", role: "Circulation", hours: 44.0, attendance: "95%", status: "present" },
    { id: "w3", name: "Han Jiwoo", sid: "20239001", dept: "IT Helpdesk", role: "Support", hours: 40.0, attendance: "92%", status: "absent" },
    { id: "w4", name: "Seo Minseo", sid: "20244102", dept: "Admissions", role: "Data Entry", hours: 36.5, attendance: "89%", status: "late" },
    { id: "w5", name: "Oh Taeyang", sid: "20238333", dept: "Career Center", role: "Event Ops", hours: 30.0, attendance: "100%", status: "present" },
  ],
};
