import { AlertCircle } from 'lucide-react'

// AI 참고 의견(근무표 검토 review, 대타 적합성 검사 ai-check)이 공통으로 쓰는 표시 조각.
// 두 응답의 finding 구조(severity/rule/evidence/message/suggestion)와 조용한 실패
// 사유가 같아서, AdminSchedulePage에만 있던 것을 대타 승인 화면(#207)과 함께
// 쓰려고 여기로 옮겼다. 필드 이름만 기능마다 다르다 — review는 review_available,
// ai-check는 ai_check_available.

// 심각도 표기 — 백엔드 ReviewFinding/SubstituteCheckFinding의 severity와 같은 키
export const AI_SEVERITY = {
  critical: { label: '위반', color: 'var(--danger)', bg: 'var(--danger-50)', border: 'var(--danger-100)' },
  warning: { label: '우려', color: 'var(--warning)', bg: 'var(--warning-50)', border: 'var(--warning-100)' },
  info: { label: '참고', color: 'var(--info)', bg: 'var(--info-50)', border: 'var(--info-100)' },
}

// *_available=false일 때의 reason 안내 (백엔드 review.py의 조용한 실패 사유)
export const AI_UNAVAILABLE_REASONS = {
  no_rules: '검토할 내용이 없습니다 — 등록된 자연어 운영 규칙·학생 특이사항이 없고, 규정 제약 위반이나 배정 페널티도 없습니다.',
  not_configured: '서버에 AI 키(GEMINI_API_KEY)가 설정되어 있지 않아 검토를 수행할 수 없습니다.',
  ai_error: 'AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.',
}

export function AiUnavailableNote({ reason }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--warning-50)', border: '1px solid var(--warning-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-title)', color: 'var(--warning)' }}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{AI_UNAVAILABLE_REASONS[reason] ?? `검토를 수행할 수 없습니다. (${reason})`}</span>
    </div>
  )
}

// 판단 근거가 된 부서 규칙 원문(rule)은 프롬프트가 "그대로 인용"하도록 규정한
// 값이라 메시지와 함께 반드시 보여준다 — 담당자가 AI 의견을 규칙과 대조할 수 있는
// 유일한 단서다.
//
// source="system"은 AI 의견이 아니라 서버가 솔버와 같은 기준으로 채점한 규정 제약
// 위반이다 (#242). "AI가 그렇게 볼 수도 있다"와 "실제로 규정을 어겼다"는 무게가
// 다르므로 배지로 구분한다.
export function AiFinding({ finding }) {
  const sev = AI_SEVERITY[finding.severity] ?? AI_SEVERITY.info
  const bySystem = finding.source === 'system'
  return (
    <div style={{ padding: '12px 16px', background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-title)', lineHeight: 1.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-on-brand)', background: sev.color, padding: '1px 8px', borderRadius: 4 }}>{sev.label}</span>
        {bySystem && (
          <span
            title="AI 의견이 아니라, 서버가 개관 시간·가능 시간·인원·근로 시간 상한으로 직접 채점한 결과입니다."
            style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-body)', background: 'var(--surface-card)', border: `1px solid ${sev.border}`, padding: '1px 8px', borderRadius: 4 }}
          >
            규정 검증
          </span>
        )}
        {finding.rule && <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>규칙: {finding.rule}</span>}
      </div>
      <div style={{ color: 'var(--text-body)', fontWeight: 600 }}>{finding.message}</div>
      {finding.evidence && <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginTop: 2 }}>근거: {finding.evidence}</div>}
      {finding.suggestion && <div style={{ fontSize: 'var(--fs-body)', color: sev.color, marginTop: 2 }}>제안: {finding.suggestion}</div>}
    </div>
  )
}
