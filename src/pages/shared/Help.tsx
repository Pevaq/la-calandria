import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/format'
import type { Settings } from '../../lib/types'
import { Alert, Button, Icon, Spinner, Tabs } from '../../components/ui'

/**
 * Manuales en línea. El contenido vive en la tabla `docs` (versiones inmutables);
 * la base decide quién puede leer cada uno (público / equipo / dueño).
 */
export type DocSlug = 'manual-dueno' | 'manual-equipo' | 'ayuda-clientes' | 'deuda-tecnica'
const TAB_LABEL: Record<DocSlug, string> = {
  'manual-dueno': 'Manual del dueño',
  'manual-equipo': 'Manual del equipo',
  'ayuda-clientes': 'Clientes',
  'deuda-tecnica': 'Pendientes técnicos',
}

interface Doc {
  slug: string
  title: string
  version: number
  content: string
  created_at: string
}

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

/** Completa {{negocio}}, {{contacto}}, {{datos_pago}} con los datos de Configuración */
function fillTokens(md: string, s: Settings | null) {
  const wa = s?.receipt_whatsapp?.replace(/\D/g, '')
  const contacto =
    [wa ? `WhatsApp [${s!.receipt_whatsapp}](https://wa.me/${wa})` : null, s?.receipt_email ? `mail [${s.receipt_email}](mailto:${s.receipt_email})` : null]
      .filter(Boolean)
      .join(' o ') || 'por WhatsApp o mail'
  const pago =
    s?.bank_alias || s?.bank_cbu
      ? [s.bank_alias && `- **Alias:** ${s.bank_alias}`, s.bank_cbu && `- **CBU/CVU:** ${s.bank_cbu}`, s.bank_holder && `- **Titular:** ${s.bank_holder}`, s.bank_name && `- **Banco:** ${s.bank_name}`]
          .filter(Boolean)
          .join('\n')
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
        const id = slugify(plain)
        if (depth === 2) toc.push({ id, text: plain })
        return `<h${depth} id="${id}">${text}</h${depth}>`
      },
    },
  })
  // línea en blanco antes de </details>: si no, una lista al final de la respuesta se "traga" el cierre
  const raw = marked.parse(md.replace(/\n*<\/details>/g, '\n\n</details>')) as string
  // el contenido viene de la base: se limpia igual (sin scripts, estilos ni eventos)
  const html = DOMPurify.sanitize(raw, { ADD_TAGS: ['details', 'summary'], ADD_ATTR: ['target'] })
  return { html, toc }
}

// links externos en pestaña nueva y sin acceso a esta ventana
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && /^https?:/.test(node.getAttribute('href') ?? '')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** `available` = documentos que ofrece esta pantalla; el primero es el de la persona */
export default function Help({ available }: { available: DocSlug[] }) {
  const key = available.join(',')
  const [current, setCurrent] = useState<DocSlug>(available[0])
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined)
  const [settings, setSettings] = useState<Settings | null | undefined>(undefined)

  useEffect(() => setCurrent(key.split(',')[0] as DocSlug), [key])

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => setSettings((data as Settings) ?? null))
  }, [])

  useEffect(() => {
    let alive = true
    setDoc(undefined)
    supabase
      .from('docs')
      .select('slug, title, version, content, created_at')
      .eq('slug', current)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => alive && setDoc((data as Doc) ?? null))
    return () => {
      alive = false
    }
  }, [current])

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

  // se dibuja recién con el documento Y los datos de contacto: si no, un segundo render cerraría las preguntas abiertas
  const ready = doc !== undefined && settings !== undefined
  const rendered = useMemo(() => (doc ? render(fillTokens(doc.content, settings ?? null)) : null), [doc, settings])

  return (
    <div className="mx-auto max-w-3xl">
      {available.length > 1 && (
        <div className="no-print">
          <Tabs value={current} onChange={setCurrent} tabs={available.map((m) => ({ id: m, label: TAB_LABEL[m] }))} />
        </div>
      )}

      {!ready ? (
        <Spinner />
      ) : !doc || !rendered ? (
        <Alert kind="info">Este manual todavía no está disponible.</Alert>
      ) : (
        <>
          <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-stone-500">Versión {doc.version} · {fmtDate(doc.created_at)}</span>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Icon name="download" className="h-4 w-4" /> Descargar PDF
            </Button>
          </div>

          {rendered.toc.length > 2 && (
            <nav className="no-print mb-6 rounded-xl border border-stone-200 bg-white p-4" aria-label="Índice">
              <div className="label mb-2">En este manual</div>
              <ol className="grid gap-1 text-sm sm:grid-cols-2">
                {rendered.toc.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      onClick={(e) => {
                        e.preventDefault()
                        document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="text-brand-700 hover:underline"
                    >
                      {t.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <article className="manual" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          <p className="print-only mt-8 text-xs text-stone-500">
            {doc.title} · versión {doc.version} del {fmtDate(doc.created_at)}
          </p>
        </>
      )}

      <div className="no-print mt-10 border-t border-stone-200 pt-4 text-sm text-stone-500">
        ¿Algo no está claro o falta?{' '}
        {current === 'ayuda-clientes' ? <Link to="/" className="text-brand-700 underline">Volver al catálogo</Link> : 'Avisale al dueño y lo agregamos.'}
      </div>
    </div>
  )
}
