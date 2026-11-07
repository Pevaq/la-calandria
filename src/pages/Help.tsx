import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Marked } from 'marked'
import { supabase } from '../lib/supabase'
import type { Settings } from '../lib/types'
import { Button, Icon, Spinner, Tabs } from '../components/ui'
// Los manuales viven en docs/manual/*.md (una sola fuente, versionada con el código)
import clientes from '../../docs/manual/clientes.md?raw'
import equipo from '../../docs/manual/equipo.md?raw'
import dueno from '../../docs/manual/dueno.md?raw'

export type Manual = 'clientes' | 'equipo' | 'dueno'
const SOURCES: Record<Manual, string> = { clientes, equipo, dueno }
const TITLES: Record<Manual, string> = { clientes: 'Clientes', equipo: 'Manual del equipo', dueno: 'Manual del dueño' }

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

/** Reemplaza {{negocio}}, {{contacto}}, {{datos_pago}} con los datos de Configuración */
function fillTokens(md: string, s: Settings | null) {
  const wa = s?.receipt_whatsapp?.replace(/\D/g, '')
  const contacto = [
    wa ? `WhatsApp [${s!.receipt_whatsapp}](https://wa.me/${wa})` : null,
    s?.receipt_email ? `mail [${s.receipt_email}](mailto:${s.receipt_email})` : null,
  ].filter(Boolean).join(' o ') || 'por WhatsApp o mail'
  const pago = s?.bank_alias || s?.bank_cbu
    ? [
        s.bank_alias && `- **Alias:** ${s.bank_alias}`,
        s.bank_cbu && `- **CBU/CVU:** ${s.bank_cbu}`,
        s.bank_holder && `- **Titular:** ${s.bank_holder}`,
        s.bank_name && `- **Banco:** ${s.bank_name}`,
      ].filter(Boolean).join('\n')
    : 'Te los pasamos al confirmar tu pedido.'
  return md
    .replaceAll('{{negocio}}', s?.business_name || 'La Calandria')
    .replaceAll('{{contacto}}', contacto)
    .replaceAll('{{datos_pago}}', pago)
}

function render(md: string) {
  const toc: { id: string; text: string }[] = []
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        const plain = text.replace(/<[^>]+>/g, '')
        const id = slug(plain)
        if (depth === 2) toc.push({ id, text: plain })
        return `<h${depth} id="${id}">${text}</h${depth}>`
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens)
        const external = /^https?:/.test(href)
        return `<a href="${href}"${external ? ' target="_blank" rel="noreferrer"' : ''}>${text}</a>`
      },
    },
  })
  // línea en blanco antes de </details>: si no, una lista al final de la respuesta se "traga" el cierre
  const html = marked.parse(md.replace(/\n*<\/details>/g, '\n\n</details>')) as string
  return { html, toc }
}

/** Manuales en línea. `available` = los que puede ver este rol, el primero es el de la persona. */
export default function Help({ available }: { available: Manual[] }) {
  const [current, setCurrent] = useState<Manual>(available[0])
  const [settings, setSettings] = useState<Settings | null>(null)
  // el manual se muestra recién con los datos de contacto: si no, al llegar se re-dibuja y cierra las preguntas abiertas
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      setSettings(data as Settings)
      setReady(true)
    })
  }, [])
  const first = available[0]
  useEffect(() => setCurrent(first), [first])

  // al imprimir / guardar como PDF se despliegan todas las preguntas
  useEffect(() => {
    const open = () =>
      document.querySelectorAll<HTMLDetailsElement>('.manual details').forEach((d) => {
        d.dataset.was = d.open ? '1' : '0'
        d.open = true
      })
    const restore = () =>
      document.querySelectorAll<HTMLDetailsElement>('.manual details').forEach((d) => {
        d.open = d.dataset.was === '1'
      })
    window.addEventListener('beforeprint', open)
    window.addEventListener('afterprint', restore)
    return () => {
      window.removeEventListener('beforeprint', open)
      window.removeEventListener('afterprint', restore)
    }
  }, [])

  const { html, toc } = useMemo(() => render(fillTokens(SOURCES[current], settings)), [current, settings])
  const updated = new Date(__BUILD_DATE__).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-3xl">
      {available.length > 1 && (
        <div className="no-print">
          <Tabs value={current} onChange={setCurrent} tabs={available.map((m) => ({ id: m, label: TITLES[m] }))} />
        </div>
      )}

      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-stone-500">Versión del {updated}</span>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Icon name="download" className="h-4 w-4" /> Descargar PDF
        </Button>
      </div>

      {toc.length > 2 && (
        <nav className="no-print mb-6 rounded-xl border border-stone-200 bg-white p-4">
          <div className="label mb-2">En este manual</div>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }) }} className="text-brand-700 hover:underline">
                  {t.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {ready ? <article className="manual" dangerouslySetInnerHTML={{ __html: html }} /> : <Spinner />}

      <div className="no-print mt-10 border-t border-stone-200 pt-4 text-sm text-stone-500">
        ¿Algo no está claro o falta? {current === 'clientes' ? <Link to="/" className="text-brand-700 underline">Volver al catálogo</Link> : 'Avisale al dueño y lo agregamos.'}
      </div>
    </div>
  )
}
