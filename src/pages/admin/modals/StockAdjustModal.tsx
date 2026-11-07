import { useEffect, useState } from 'react'
import { errMsg, supabase } from '../../../lib/supabase'
import { fmtNum } from '../../../lib/format'
import { Alert, Button, Field, Modal } from '../../../components/ui'

export interface StockTarget {
  kind: 'part' | 'variant'
  id: string
  name: string
  stock: number
}

export default function StockAdjustModal({ target, onClose, onDone }: { target: StockTarget | null; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'add' | 'set'>('add')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setValue('')
    setReason('')
    setError('')
    setMode('add')
  }, [target])

  if (!target) return null
  const n = parseInt(value) || 0
  const delta = mode === 'add' ? n : n - target.stock
  const result = target.stock + delta

  const save = async () => {
    if (delta === 0) return onClose()
    setBusy(true)
    const { error } = await supabase.rpc('adjust_stock', {
      p_part_id: target.kind === 'part' ? target.id : null,
      p_variant_id: target.kind === 'variant' ? target.id : null,
      p_delta: delta,
      p_reason: reason || (mode === 'set' ? 'Conteo de stock' : delta > 0 ? 'Ingreso manual' : 'Egreso manual'),
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onDone()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Stock · ${target.name}`}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="text-sm text-stone-600">Stock actual: <strong className="text-stone-900">{fmtNum(target.stock)}</strong></div>
        <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
          {(['add', 'set'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md px-3 py-1.5 ${mode === m ? 'bg-white font-medium shadow-sm' : 'text-stone-600'}`}>
              {m === 'add' ? 'Sumar / restar' : 'Fijar cantidad (conteo)'}
            </button>
          ))}
        </div>
        <Field label={mode === 'add' ? 'Cantidad (negativo para restar)' : 'Cantidad contada'}>
          <input autoFocus type="number" className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Motivo (opcional)">
          <input className="input" placeholder="Ej: producción para stock, rotura, conteo" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm text-stone-600">Queda en <strong>{fmtNum(result)}</strong></span>
          <Button onClick={save} loading={busy} disabled={!value}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}
