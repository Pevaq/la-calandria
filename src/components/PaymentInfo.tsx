import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtMoney } from '../lib/format'
import type { Settings } from '../lib/types'

function Copy({ value }: { value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        })
      }}
      className="ml-2 rounded border border-stone-300 px-1.5 py-0.5 text-xs text-stone-600 hover:bg-stone-50"
    >
      {ok ? 'Copiado' : 'Copiar'}
    </button>
  )
}

export default function PaymentInfo({ total, orderNumber }: { total: number; orderNumber: number }) {
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => setS(data as Settings))
  }, [])
  if (!s) return null
  const hasBank = s.bank_alias || s.bank_cbu
  return (
    <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-5">
      <h2 className="mb-3 font-display text-lg font-semibold text-brand-900">Cómo pagar</h2>
      <p className="mb-4 text-sm text-stone-700">
        Transferí <strong>{fmtMoney(total)}</strong> y mandanos el comprobante indicando el <strong>pedido #{orderNumber}</strong>.
      </p>
      {hasBank ? (
        <dl className="space-y-2 text-sm">
          {s.bank_alias && (
            <div className="flex flex-wrap items-center"><dt className="w-24 text-stone-500">Alias</dt><dd className="font-mono font-medium">{s.bank_alias}</dd><Copy value={s.bank_alias} /></div>
          )}
          {s.bank_cbu && (
            <div className="flex flex-wrap items-center"><dt className="w-24 text-stone-500">CBU/CVU</dt><dd className="font-mono">{s.bank_cbu}</dd><Copy value={s.bank_cbu} /></div>
          )}
          {s.bank_holder && <div className="flex"><dt className="w-24 text-stone-500">Titular</dt><dd>{s.bank_holder}</dd></div>}
          {s.bank_name && <div className="flex"><dt className="w-24 text-stone-500">Banco</dt><dd>{s.bank_name}</dd></div>}
        </dl>
      ) : (
        <p className="text-sm text-stone-600">Te vamos a pasar los datos para transferir.</p>
      )}
      {(s.receipt_email || s.receipt_whatsapp) && (
        <div className="mt-4 border-t border-brand-200 pt-3 text-sm">
          <span className="text-stone-600">Mandá el comprobante a: </span>
          {s.receipt_email && (
            <a className="font-medium text-brand-800 underline" href={`mailto:${s.receipt_email}?subject=${encodeURIComponent(`Comprobante pedido #${orderNumber}`)}`}>
              {s.receipt_email}
            </a>
          )}
          {s.receipt_email && s.receipt_whatsapp && <span className="text-stone-500"> o </span>}
          {s.receipt_whatsapp && (
            <a
              className="font-medium text-brand-800 underline"
              href={`https://wa.me/${s.receipt_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Te mando el comprobante del pedido #${orderNumber}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          )}
        </div>
      )}
      {s.payment_instructions && <p className="mt-3 whitespace-pre-line text-sm text-stone-600">{s.payment_instructions}</p>}
    </div>
  )
}
