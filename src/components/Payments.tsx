import { useCallback, useEffect, useState } from 'react'
import { errMsg, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtDate, fmtMoney } from '../lib/format'
import type { Order, Payment } from '../lib/types'
import { Alert, Badge, Button, Field, Icon, Modal, Progress } from './ui'

const RECEIPTS = 'receipts'

const STATUS: Record<Payment['status'], { label: string; color: string }> = {
  informado: { label: 'En revisión', color: 'bg-amber-100 text-amber-800' },
  confirmado: { label: 'Confirmado', color: 'bg-emerald-100 text-emerald-800' },
  rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
}

export async function openReceipt(path: string) {
  const { data, error } = await supabase.storage.from(RECEIPTS).createSignedUrl(path, 60 * 10)
  if (error) return alert(errMsg(error))
  window.open(data.signedUrl, '_blank', 'noopener')
}

/**
 * Pagos de un pedido.
 * - Cliente: ve lo pagado y el saldo, e informa pagos con comprobante.
 * - Dueño (admin): confirma/rechaza lo informado y registra pagos (seña, saldo, efectivo…).
 */
export default function Payments({ order, admin, onChange, onPaid }: { order: Order; admin?: boolean; onChange?: () => void; onPaid?: (amount: number) => void }) {
  const { profile } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('payments').select('*').eq('order_id', order.id).order('created_at')
    setPayments((data as Payment[]) ?? [])
  }, [order.id])
  useEffect(() => {
    load()
  }, [load, order.paid_amount])

  const paid = Number(order.paid_amount)
  const total = Number(order.total)
  const balance = Math.max(0, total - paid)
  const pending = payments.filter((p) => p.status === 'informado')
  const pendingAmount = pending.reduce((s, p) => s + Number(p.amount), 0)
  const canAdd = order.status !== 'cancelado' && balance > 0

  const review = async (p: Payment, status: 'confirmado' | 'rechazado') => {
    setError('')
    const { error } = await supabase.from('payments').update({ status, reviewed_at: new Date().toISOString() }).eq('id', p.id)
    if (error) return setError(errMsg(error))
    await load()
    onChange?.()
    if (status === 'confirmado') onPaid?.(Number(p.amount))
  }
  const remove = async (p: Payment) => {
    if (!confirm(`¿Borrar el pago de ${fmtMoney(p.amount)}?`)) return
    const { error } = await supabase.from('payments').delete().eq('id', p.id)
    if (error) return setError(errMsg(error))
    await load()
    onChange?.()
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-medium">Pagos</h3>
        {order.payment_received ? (
          <span className="text-sm font-medium text-emerald-700">Pagado ✓</span>
        ) : paid > 0 ? (
          <span className="text-sm text-stone-600">Saldo <strong className="text-stone-900">{fmtMoney(balance)}</strong></span>
        ) : (
          <span className="text-sm font-medium text-amber-700">Sin pagos</span>
        )}
      </div>
      <Progress value={paid} max={total} />
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>Pagado {fmtMoney(paid)}</span>
        <span>Total {fmtMoney(total)}</span>
      </div>

      {error && <div className="mt-3"><Alert>{error}</Alert></div>}

      {payments.length > 0 && (
        <ul className="mt-3 divide-y divide-stone-100 border-t border-stone-100">
          {payments.map((p) => (
            <li key={p.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {fmtMoney(p.amount)} <span className="font-normal text-stone-500">· {p.method}</span>
                  </div>
                  <div className="truncate text-xs text-stone-500">
                    {fmtDate(p.created_at)}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </div>
                <Badge color={STATUS[p.status].color}>{STATUS[p.status].label}</Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {p.receipt_path && (
                  <button className="text-xs font-medium text-brand-700 underline" onClick={() => openReceipt(p.receipt_path!)}>
                    Ver comprobante
                  </button>
                )}
                {admin && p.status === 'informado' && (
                  <>
                    <Button size="sm" onClick={() => review(p, 'confirmado')}>Confirmar</Button>
                    <Button size="sm" variant="ghost" onClick={() => review(p, 'rechazado')}>Rechazar</Button>
                  </>
                )}
                {admin && p.status !== 'informado' && (
                  <button className="ml-auto p-1 text-stone-400 hover:text-red-600" aria-label="Borrar pago" onClick={() => remove(p)}>
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!admin && pendingAmount > 0 && (
        <p className="mt-2 text-xs text-stone-500">Estamos revisando {fmtMoney(pendingAmount)} que informaste.</p>
      )}

      {canAdd && (
        <Button className="mt-3 w-full" variant={admin ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
          {admin ? 'Registrar pago' : 'Ya pagué: subir comprobante'}
        </Button>
      )}

      <PaymentModal
        open={open}
        onClose={() => setOpen(false)}
        order={order}
        admin={!!admin}
        suggested={Math.max(0, balance - (admin ? 0 : pendingAmount))}
        userId={profile?.id ?? null}
        onDone={async (amount) => {
          setOpen(false)
          await load()
          onChange?.()
          if (admin) onPaid?.(amount)
        }}
      />
    </div>
  )
}

function PaymentModal({
  open, onClose, order, admin, suggested, userId, onDone,
}: { open: boolean; onClose: () => void; order: Order; admin: boolean; suggested: number; userId: string | null; onDone: (amount: number) => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('transferencia')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setAmount(suggested > 0 ? String(Math.round(suggested * 100) / 100) : '')
      setMethod('transferencia')
      setNote('')
      setFile(null)
      setError('')
    }
  }, [open, suggested])

  const save = async () => {
    const n = parseFloat(amount.replace(/\./g, '').replace(',', '.'))
    if (!(n > 0)) return setError('Poné el monto')
    if (!admin && !file) return setError('Adjuntá la foto o el PDF del comprobante')
    setBusy(true)
    setError('')
    let receipt_path: string | null = null
    if (file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      receipt_path = `${order.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(RECEIPTS).upload(receipt_path, file)
      if (error) {
        setBusy(false)
        return setError(errMsg(error))
      }
    }
    const { error } = await supabase.from('payments').insert({
      order_id: order.id,
      amount: n,
      method,
      note: note.trim() || null,
      receipt_path,
      created_by: userId,
      status: admin ? 'confirmado' : 'informado',
      reviewed_at: admin ? new Date().toISOString() : null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onDone(n)
  }

  return (
    <Modal open={open} onClose={onClose} title={admin ? `Registrar pago · #${order.number}` : `Informar pago · #${order.number}`}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Monto" hint={suggested > 0 ? `Saldo: ${fmtMoney(suggested)}. Si es una seña, poné lo que pagaste.` : undefined}>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {admin && (
          <Field label="Forma de pago">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
        )}
        <Field label={admin ? 'Comprobante (opcional)' : 'Comprobante'} hint="Foto o PDF de la transferencia, hasta 10 MB">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Nota (opcional)">
          <input className="input" maxLength={500} placeholder={admin ? 'Ej: seña, saldo, pagó Marina' : 'Ej: seña del 50%'} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button onClick={save} loading={busy}>{admin ? 'Registrar' : 'Enviar'}</Button>
        </div>
      </div>
    </Modal>
  )
}
