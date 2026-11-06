import { useEffect, useState } from 'react'
import { errMsg, supabase } from '../../lib/supabase'
import type { Settings } from '../../lib/types'
import { Alert, Button, Field, PageHeader, Spinner } from '../../components/ui'
import PaymentInfo from '../../components/PaymentInfo'

type Form = Omit<Settings, 'id' | 'default_lead_days'> & { default_lead_days: string }

export default function SettingsPage() {
  const [f, setF] = useState<Form | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(0)

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).single().then(({ data }) => {
      const s = data as Settings
      setF({ ...s, default_lead_days: String(s.default_lead_days) })
    })
  }, [])

  if (!f) return <Spinner />
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const v = (k: keyof Form) => (f[k] as string | null) ?? ''

  const save = async () => {
    setBusy(true)
    setError('')
    setMsg('')
    const clean = (s: string | null) => (s && s.trim() ? s.trim() : null)
    const { error } = await supabase
      .from('settings')
      .update({
        business_name: f.business_name.trim() || 'La Calandria',
        bank_alias: clean(f.bank_alias),
        bank_cbu: clean(f.bank_cbu),
        bank_holder: clean(f.bank_holder),
        bank_name: clean(f.bank_name),
        receipt_email: clean(f.receipt_email),
        receipt_whatsapp: clean(f.receipt_whatsapp),
        notify_email: clean(f.notify_email),
        payment_instructions: clean(f.payment_instructions),
        default_lead_days: Math.max(1, parseInt(f.default_lead_days) || 14),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setBusy(false)
    if (error) setError(errMsg(error))
    else {
      setMsg('Configuración guardada')
      setPreview((p) => p + 1)
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Configuración" />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card grid gap-4 p-5">
            <h2 className="font-medium">Datos para transferir</h2>
            <p className="-mt-2 text-sm text-stone-500">Lo ve el cliente al terminar el pedido.</p>
            <Field label="Alias"><input className="input" value={v('bank_alias')} onChange={set('bank_alias')} /></Field>
            <Field label="CBU / CVU"><input className="input" value={v('bank_cbu')} onChange={set('bank_cbu')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Titular"><input className="input" value={v('bank_holder')} onChange={set('bank_holder')} /></Field>
              <Field label="Banco"><input className="input" value={v('bank_name')} onChange={set('bank_name')} /></Field>
            </div>
            <Field label="Email para comprobantes"><input type="email" className="input" value={v('receipt_email')} onChange={set('receipt_email')} /></Field>
            <Field label="WhatsApp para comprobantes (opcional)" hint="Con código de país, ej: 5493477123456"><input className="input" value={v('receipt_whatsapp')} onChange={set('receipt_whatsapp')} /></Field>
            <Field label="Instrucciones extra (opcional)"><textarea className="input min-h-20" value={v('payment_instructions')} onChange={set('payment_instructions')} /></Field>
          </section>
          <section className="card grid gap-4 p-5">
            <h2 className="font-medium">Avisos y producción</h2>
            <Field label="Email donde llegan los pedidos nuevos"><input type="email" className="input" value={v('notify_email')} onChange={set('notify_email')} /></Field>
            <Field label="Días de entrega por defecto" hint="Si el cliente no pide fecha, se propone hoy + estos días."><input type="number" min={1} className="input" value={f.default_lead_days} onChange={set('default_lead_days')} /></Field>
            <Field label="Nombre del negocio"><input className="input" value={f.business_name} onChange={set('business_name')} /></Field>
          </section>
          <Button onClick={save} loading={busy}>Guardar</Button>
        </div>
        <div>
          <div className="label mb-2">Así lo ve el cliente</div>
          <PaymentInfo key={preview} total={150000} orderNumber={1001} />
        </div>
      </div>
    </div>
  )
}
