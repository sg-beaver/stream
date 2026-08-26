import { useState } from 'react'
import { User as UserIcon } from 'lucide-react'

// 증명사진 — SAINT 학적 사진 연동 전까지는 /assets/students/<학번>.jpg 정적 파일을 쓴다.
// 파일이 없는 학생은 실루엣 자리표시자로 되돌린다.
// (#122에서 DB의 photo_url이 들어오면 studentId 대신 그 값을 받도록 바꾼다)
export default function IdPhoto({ studentId, width = 104, placeholder, style = {} }) {
  const [failed, setFailed] = useState(false)
  const height = Math.round(width * 4 / 3)  // 증명사진 3:4

  const box = {
    width, height, flexShrink: 0,
    borderRadius: 'var(--radius-md)',
    background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)',
    ...style,
  }

  if (failed || !studentId) {
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <UserIcon size={Math.round(width / 3)} color="var(--sogang-silver)" />
        {placeholder && (
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)', marginTop: 6 }}>{placeholder}</div>
        )}
      </div>
    )
  }
  return (
    <img
      src={`/assets/students/${studentId}.jpg`}
      alt="증명사진"
      width={width}
      height={height}
      onError={() => setFailed(true)}
      style={{ ...box, objectFit: 'cover' }}
    />
  )
}
