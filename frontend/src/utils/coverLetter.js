// API 스펙에 cover_letter 단일 필드만 있어(구조화 필드 없음) 여러 섹션을 텍스트로
// 합쳐 저장하고, 상세 조회 시 같은 규칙으로 되돌려 보여준다 (필드 확장 협의: #19).
// 경력·어학·자격증은 작성 화면과 동일한 표 형태로 다시 보여줘야 해서 JSON으로 그대로 담는다.

export function buildCoverLetter({ motivation, selfIntro, resume, slots }) {
  return [
    '[지원 동기]', motivation.trim(),
    '', '[자기소개]', selfIntro.trim(),
    '', '[관련 경험 데이터]', JSON.stringify({
      careers: resume.careers, languages: resume.languages, certificates: resume.certificates,
    }),
    '', '[근무 가능 시간]', slots.join(', '),
  ].join('\n')
}

// buildCoverLetter가 만든 형식이 아니면(예: 이 형식이 생기기 전에 제출된 지원서) null —
// 호출부에서 원문 텍스트를 그대로 보여주는 fallback으로 처리
export function parseCoverLetter(text) {
  if (!text) return null

  const sections = {}
  let current = null
  for (const line of text.split('\n')) {
    const m = line.match(/^\[(.+)\]$/)
    if (m) {
      current = m[1]
      sections[current] = []
    } else if (current) {
      sections[current].push(line)
    }
  }

  const joinTrim = key => (sections[key] ?? []).join('\n').trim()
  const dataRaw = joinTrim('관련 경험 데이터')
  if (!dataRaw) return null

  let resume
  try {
    resume = JSON.parse(dataRaw)
  } catch {
    return null
  }

  const slotsRaw = joinTrim('근무 가능 시간')
  const slots = slotsRaw ? slotsRaw.split(',').map(s => s.trim()).filter(Boolean) : []

  return {
    motivation: joinTrim('지원 동기'),
    selfIntro: joinTrim('자기소개'),
    careers: resume.careers ?? [],
    languages: resume.languages ?? [],
    certificates: resume.certificates ?? [],
    slots,
  }
}
