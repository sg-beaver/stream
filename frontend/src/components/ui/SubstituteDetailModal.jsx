import { ArrowRight, X } from 'lucide-react'

// 시간표의 금색(대타 반영) 칸을 클릭했을 때 뜨는 변경 상세 — 관리자·학생 공용 (#71).
// subs: 승인된 대타 요청 목록 (requester_name·substitute_name·date·start/end_time·reason·approver_name)

const hhmm = t => String(t ?? '').slice(0, 5)
const isoToDots = iso => (iso ? iso.slice(0, 10).replaceAll('-', '.') : '')

export default function SubstituteDetailModal({ subs, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface-card)', borderRadius: 14, width: 460, maxWidth: 'calc(100vw - 48px)', padding: 24, boxShadow: '0 20px 50px rgba(16,24,40,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>
            {isoToDots(subs[0].date)} 대타 변경 내역
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} color="var(--text-subtle)" /></button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-muted)' }}>
          이 날만 근무자가 대타로 바뀌었어요. 다른 날짜는 원래 확정 시간표대로 진행됩니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {subs.map(s => (
            <div key={s.request_id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 8 }}>
                {hhmm(s.start_time)}–{hhmm(s.end_time)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
                <span style={{ color: 'var(--text-subtle)', textDecoration: 'line-through', fontWeight: 600 }}>{s.requester_name ?? s.requester_id}</span>
                <ArrowRight size={15} color="var(--sogang-red)" />
                <span>{s.substitute_name ?? s.substitute_id}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                사유: {s.reason || '(작성 안 함)'} · 승인: {s.approver_name ?? s.approved_by}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
