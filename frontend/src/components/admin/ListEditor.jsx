import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import Input from '../ui/Input'
import Button from '../ui/Button'

function useComposingEnter(commit) {
  const composing = useRef(false)
  return {
    onCompositionStart: () => { composing.current = true },
    onCompositionEnd: () => { composing.current = false },
    onKeyDown: e => { if (e.key === 'Enter' && !composing.current) { e.preventDefault(); commit() } },
  }
}

// 문장 단위 항목 추가/삭제 (업무 내용 등)
export function ListEditor({ items, onAdd, onRemove, placeholder }) {
  const [val, setVal] = useState('')
  const commit = () => { const v = val.trim(); if (!v) return; onAdd(v); setVal('') }
  const composingProps = useComposingEnter(commit)

  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-25)' }}>
              <span style={{ color: 'var(--sogang-red)', fontSize: 13, lineHeight: 1.5 }}>•</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-body)', lineHeight: 1.5 }}>{it}</span>
              <button type="button" onClick={() => onRemove(i)} style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 2 }}>
                <X size={14} color="var(--text-subtle)" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Input value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} style={{ flex: 1 }} {...composingProps} />
        <Button variant="secondary" onClick={commit}><Plus size={13} /> 추가</Button>
      </div>
    </div>
  )
}

// 짧은 키워드를 칩으로 추가/삭제 (지원 자격·우대 조건 등)
export function ChipEditor({ items, onAdd, onRemove, placeholder }) {
  const [val, setVal] = useState('')
  const commit = () => { const v = val.trim(); if (!v) return; onAdd(v); setVal('') }
  const composingProps = useComposingEnter(commit)

  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {items.map((it, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', fontSize: 13, color: 'var(--text-body)', background: 'var(--neutral-25)' }}>
              {it}
              <button type="button" onClick={() => onRemove(i)} style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <X size={13} color="var(--text-subtle)" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Input value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} style={{ flex: 1 }} {...composingProps} />
        <Button variant="secondary" onClick={commit}><Plus size={13} /> 추가</Button>
      </div>
    </div>
  )
}
