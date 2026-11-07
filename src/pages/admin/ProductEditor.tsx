import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errMsg, IMAGES_BUCKET, imageUrl, supabase } from '../../lib/supabase'
import { fmtNum, slugify } from '../../lib/format'
import { personName, useStaff } from '../../lib/data'
import type { Attribute, AttrOption, Part, PartProcess, Product, ProductDiscount, ProductImage, ProductPart, ProductProcess, Variant } from '../../lib/types'
import { Alert, Button, Empty, Field, Icon, Modal, PageHeader, Spinner, Tabs } from '../../components/ui'
import StockAdjustModal from './modals/StockAdjustModal'

type Tab = 'datos' | 'fotos' | 'variantes' | 'partes' | 'procesos'

export default function ProductEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const staff = useStaff()
  const [tab, setTab] = useState<Tab>('datos')
  const [product, setProduct] = useState<Product | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [attrs, setAttrs] = useState<Attribute[]>([])
  const [options, setOptions] = useState<AttrOption[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [vopts, setVopts] = useState<{ variant_id: string; option_id: string }[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [bom, setBom] = useState<ProductPart[]>([])
  const [procs, setProcs] = useState<ProductProcess[]>([])
  const [partProcs, setPartProcs] = useState<PartProcess[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const pid = id!
    const [p, im, at, va, pa, bo, pr, pp] = await Promise.all([
      supabase.from('products').select('*').eq('id', pid).single(),
      supabase.from('product_images').select('*').eq('product_id', pid).order('sort'),
      supabase.from('product_attributes').select('*').eq('product_id', pid).order('sort'),
      supabase.from('variants').select('*').eq('product_id', pid).order('sort').order('label'),
      supabase.from('parts').select('*').order('name'),
      supabase.from('product_parts').select('*').eq('product_id', pid),
      supabase.from('product_processes').select('*').eq('product_id', pid).order('step_order'),
      supabase.from('part_processes').select('*').order('step_order'),
    ])
    const attIds = (at.data ?? []).map((a) => a.id)
    const varIds = (va.data ?? []).map((v) => v.id)
    const [op, vo] = await Promise.all([
      attIds.length ? supabase.from('attribute_options').select('*').in('attribute_id', attIds).order('sort') : Promise.resolve({ data: [] }),
      varIds.length ? supabase.from('variant_options').select('*').in('variant_id', varIds) : Promise.resolve({ data: [] }),
    ])
    setProduct(p.data as Product)
    setImages((im.data as ProductImage[]) ?? [])
    setAttrs((at.data as Attribute[]) ?? [])
    setOptions((op.data as AttrOption[]) ?? [])
    setVariants((va.data as Variant[]) ?? [])
    setVopts(vo.data ?? [])
    setParts((pa.data as Part[]) ?? [])
    setBom((bo.data as ProductPart[]) ?? [])
    setProcs((pr.data as ProductProcess[]) ?? [])
    setPartProcs((pp.data as PartProcess[]) ?? [])
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  /** ejecuta una operación y recarga; muestra error si falla */
  const op = useCallback(
    async (fn: () => PromiseLike<{ error: unknown }>, ok?: string) => {
      setError('')
      setMsg('')
      const { error } = await fn()
      if (error) {
        setError(errMsg(error))
        return false
      }
      if (ok) setMsg(ok)
      await load()
      return true
    },
    [load],
  )

  const optionLabel = useMemo(() => {
    const m: Record<string, string> = {}
    for (const o of options) {
      const a = attrs.find((x) => x.id === o.attribute_id)
      m[o.id] = `${a?.name ?? ''} = ${o.value}`
    }
    return m
  }, [options, attrs])

  if (!product) return <Spinner />

  const del = async () => {
    if (!confirm(`¿Borrar "${product.name}"? Los pedidos viejos conservan el detalle.`)) return
    const ok = await op(() => supabase.from('products').delete().eq('id', product.id))
    if (ok) nav('/admin/productos')
  }

  const ctx = { product, images, attrs, options, variants, vopts, parts, bom, procs, partProcs, staff, op, optionLabel, setError }

  return (
    <div className="max-w-5xl">
      <Link to="/admin/productos" className="mb-2 inline-block text-sm text-stone-500 hover:text-stone-800">← Productos</Link>
      <PageHeader
        title={product.name}
        subtitle={product.published ? <span className="text-emerald-700">Publicado en la tienda</span> : 'Borrador (no se ve en la tienda)'}
        actions={
          <>
            <Button
              variant={product.published ? 'secondary' : 'primary'}
              onClick={() => op(() => supabase.from('products').update({ published: !product.published }).eq('id', product.id), product.published ? 'Despublicado' : 'Publicado')}
            >
              {product.published ? 'Despublicar' : 'Publicar'}
            </Button>
            {product.published && (
              <Link to={`/p/${product.slug}`} target="_blank"><Button variant="ghost">Ver en tienda ↗</Button></Link>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                if (!confirm(`¿Duplicar "${product.name}"? Se copia todo (variantes, partes, procesos y descuentos) como borrador, sin stock.`)) return
                const { data, error } = await supabase.rpc('duplicate_product', { p_product_id: product.id })
                if (error) return setError(errMsg(error))
                nav(`/admin/productos/${data as string}`)
              }}
            >
              Duplicar
            </Button>
          </>
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'datos', label: 'Datos' },
          { id: 'fotos', label: `Fotos (${images.length})` },
          { id: 'variantes', label: `Variantes (${variants.length})` },
          { id: 'partes', label: `Partes (${bom.length})` },
          { id: 'procesos', label: `Procesos (${procs.length})` },
        ]}
      />
      {tab === 'datos' && <DataTab {...ctx} onDelete={del} />}
      {tab === 'fotos' && <PhotosTab {...ctx} />}
      {tab === 'variantes' && <VariantsTab {...ctx} />}
      {tab === 'partes' && <BomTab {...ctx} />}
      {tab === 'procesos' && <ProcessTab {...ctx} />}
    </div>
  )
}

type Ctx = {
  product: Product
  images: ProductImage[]
  attrs: Attribute[]
  options: AttrOption[]
  variants: Variant[]
  vopts: { variant_id: string; option_id: string }[]
  parts: Part[]
  bom: ProductPart[]
  procs: ProductProcess[]
  partProcs: PartProcess[]
  staff: ReturnType<typeof useStaff>
  op: (fn: () => PromiseLike<{ error: unknown }>, ok?: string) => Promise<boolean>
  optionLabel: Record<string, string>
  setError: (s: string) => void
}

/* ------------------------------------------------------------------ */
function DataTab({ product, op, onDelete }: Ctx & { onDelete: () => void }) {
  const [f, setF] = useState({
    name: product.name,
    slug: product.slug,
    category: product.category ?? '',
    description: product.description ?? '',
    min_qty: String(product.min_qty),
    sort: String(product.sort),
  })
  const save = () =>
    op(
      () =>
        supabase
          .from('products')
          .update({
            name: f.name.trim(),
            slug: slugify(f.slug || f.name),
            category: f.category.trim() || null,
            description: f.description || null,
            min_qty: Math.max(1, parseInt(f.min_qty) || 1),
            sort: parseInt(f.sort) || 0,
          })
          .eq('id', product.id),
      'Guardado',
    )
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="card grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Nombre"><input className="input" value={f.name} onChange={set('name')} /></Field>
      <Field label="Categoría" hint="Ej: Bombillas, Mates, Accesorios"><input className="input" value={f.category} onChange={set('category')} /></Field>
      <Field label="Descripción" className="sm:col-span-2"><textarea className="input min-h-28" value={f.description} onChange={set('description')} /></Field>
      <Field label="Pedido mínimo (unidades)" hint="Suma de todas las variantes del producto"><input type="number" min={1} className="input" value={f.min_qty} onChange={set('min_qty')} /></Field>
      <Field label="Orden en el catálogo" hint="Menor número aparece primero"><input type="number" className="input" value={f.sort} onChange={set('sort')} /></Field>
      <Field label="URL" hint={`/p/${slugify(f.slug || f.name)}`}><input className="input" value={f.slug} onChange={set('slug')} /></Field>
      <div className="flex items-end justify-between gap-2 sm:col-span-2">
        <Button variant="danger" onClick={onDelete}>Borrar producto</Button>
        <Button onClick={save}>Guardar</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function PhotosTab({ product, images, op, setError }: Ctx) {
  const [busy, setBusy] = useState(false)
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    for (const [i, file] of [...files].entries()) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${product.id}/${Date.now()}-${i}.${ext}`
      const { error } = await supabase.storage.from(IMAGES_BUCKET).upload(path, file, { cacheControl: '31536000' })
      if (error) {
        setError(errMsg(error))
        break
      }
      await supabase.from('product_images').insert({ product_id: product.id, path, sort: images.length + i })
    }
    setBusy(false)
    await op(() => Promise.resolve({ error: null }))
  }
  const remove = async (im: ProductImage) => {
    const { count } = await supabase.from('product_images').select('id', { count: 'exact', head: true }).eq('path', im.path)
    if ((count ?? 0) <= 1) await supabase.storage.from(IMAGES_BUCKET).remove([im.path])
    await op(() => supabase.from('product_images').delete().eq('id', im.id))
  }
  const makeFirst = async (im: ProductImage) => {
    const others = images.filter((x) => x.id !== im.id)
    await Promise.all([im, ...others].map((x, i) => supabase.from('product_images').update({ sort: i }).eq('id', x.id)))
    await op(() => Promise.resolve({ error: null }))
  }
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-white px-4 py-8 text-sm text-stone-600 hover:border-brand-500">
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} disabled={busy} />
        {busy ? 'Subiendo…' : 'Tocá para subir fotos (JPG, PNG o WebP, hasta 5 MB)'}
      </label>
      {images.length === 0 ? (
        <Empty>Sin fotos todavía.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((im, i) => (
            <div key={im.id} className="group relative overflow-hidden rounded-xl bg-cream-100">
              <img src={imageUrl(im.path)!} alt="" className="aspect-square w-full object-cover" />
              {i === 0 && <span className="absolute left-2 top-2 rounded bg-brand-700 px-1.5 py-0.5 text-xs text-white">Principal</span>}
              <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/50 p-1.5">
                {i !== 0 ? <button className="text-xs text-white hover:underline" onClick={() => makeFirst(im)}>Hacer principal</button> : <span />}
                <button className="text-xs text-red-200 hover:underline" onClick={() => remove(im)}>Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
function VariantsTab({ product, attrs, options, variants, vopts, op }: Ctx) {
  const [newAttr, setNewAttr] = useState('')
  const [newOpt, setNewOpt] = useState<Record<string, string>>({})
  const [basePrice, setBasePrice] = useState('')
  const [adjust, setAdjust] = useState<Variant | null>(null)

  const addAttr = async () => {
    if (!newAttr.trim()) return
    await op(() => supabase.from('product_attributes').insert({ product_id: product.id, name: newAttr.trim(), sort: attrs.length }))
    setNewAttr('')
  }
  const addOpt = async (a: Attribute) => {
    const v = (newOpt[a.id] || '').trim()
    if (!v) return
    const n = options.filter((o) => o.attribute_id === a.id).length
    await op(() => supabase.from('attribute_options').insert({ attribute_id: a.id, value: v, sort: n }))
    setNewOpt({ ...newOpt, [a.id]: '' })
  }

  // combinaciones de opciones que todavía no tienen variante
  const missing = useMemo(() => {
    const groups = attrs.map((a) => options.filter((o) => o.attribute_id === a.id)).filter((g) => g.length)
    if (!groups.length) return variants.length ? [] : [[]]
    let combos: AttrOption[][] = [[]]
    for (const g of groups) combos = combos.flatMap((c) => g.map((o) => [...c, o]))
    const existing = new Set(
      variants.map((v) =>
        vopts
          .filter((x) => x.variant_id === v.id)
          .map((x) => x.option_id)
          .sort()
          .join('|'),
      ),
    )
    return combos.filter((c) => !existing.has(c.map((o) => o.id).sort().join('|')))
  }, [attrs, options, variants, vopts])

  const generate = async () => {
    const price = parseFloat(basePrice.replace(',', '.')) || 0
    for (const [i, combo] of missing.entries()) {
      const { data, error } = await supabase
        .from('variants')
        .insert({ product_id: product.id, label: combo.map((o) => o.value).join(' · '), price, sort: variants.length + i })
        .select()
        .single()
      if (error) return op(() => Promise.resolve({ error }))
      if (combo.length) await supabase.from('variant_options').insert(combo.map((o) => ({ variant_id: data.id, option_id: o.id })))
    }
    await op(() => Promise.resolve({ error: null }), `${missing.length} variantes creadas`)
  }

  const upd = (v: Variant, patch: Partial<Variant>) => op(() => supabase.from('variants').update(patch).eq('id', v.id))

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h3 className="mb-1 font-medium">Atributos</h3>
        <p className="mb-4 text-sm text-stone-500">Lo que puede cambiar entre variantes: material, terminación, grabado, largo…</p>
        <div className="space-y-4">
          {attrs.map((a) => (
            <div key={a.id} className="rounded-lg border border-stone-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  className="input max-w-xs font-medium"
                  defaultValue={a.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && op(() => supabase.from('product_attributes').update({ name: e.target.value.trim() }).eq('id', a.id))}
                />
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => confirm(`¿Borrar el atributo "${a.name}" y sus opciones?`) && op(() => supabase.from('product_attributes').delete().eq('id', a.id))}
                >
                  Borrar
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {options
                  .filter((o) => o.attribute_id === a.id)
                  .map((o) => (
                    <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-2.5 py-1 text-sm">
                      {o.value}
                      <button
                        className="text-stone-400 hover:text-red-600"
                        title="Quitar opción (borra las variantes que la usan)"
                        onClick={async () => {
                          const affected = vopts.filter((x) => x.option_id === o.id).map((x) => x.variant_id)
                          if (!confirm(`¿Quitar "${o.value}"?${affected.length ? ` Se borran ${affected.length} variantes que la usan.` : ''}`)) return
                          if (affected.length) await supabase.from('variants').delete().in('id', affected)
                          await op(() => supabase.from('attribute_options').delete().eq('id', o.id))
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                <input
                  className="input w-40 py-1"
                  placeholder="+ opción"
                  value={newOpt[a.id] ?? ''}
                  onChange={(e) => setNewOpt({ ...newOpt, [a.id]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && addOpt(a)}
                />
                <Button size="sm" variant="secondary" onClick={() => addOpt(a)}>Agregar</Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input max-w-xs" placeholder="Nuevo atributo (ej: Material)" value={newAttr} onChange={(e) => setNewAttr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAttr()} />
            <Button variant="secondary" onClick={addAttr}>+ Atributo</Button>
          </div>
        </div>
      </section>

      {missing.length > 0 && (
        <section className="flex flex-wrap items-end gap-3 rounded-xl border-2 border-brand-200 bg-brand-50 p-4">
          <div className="flex-1">
            <div className="font-medium text-brand-900">
              {attrs.length ? `Faltan ${missing.length} ${missing.length === 1 ? 'combinación' : 'combinaciones'}` : 'Este producto no tiene variantes'}
            </div>
            <div className="text-sm text-brand-800">
              {attrs.length ? missing.slice(0, 4).map((c) => c.map((o) => o.value).join(' · ')).join(', ') + (missing.length > 4 ? '…' : '') : 'Creá una variante única si no tiene atributos.'}
            </div>
          </div>
          <Field label="Precio inicial">
            <input className="input w-32" inputMode="decimal" placeholder="0" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
          </Field>
          <Button onClick={generate}>{attrs.length ? 'Crear variantes' : 'Crear variante única'}</Button>
        </section>
      )}

      <section>
        <h3 className="mb-2 font-medium">Variantes</h3>
        {variants.length === 0 ? (
          <Empty>Sin variantes. Agregá atributos y opciones, y después “Crear variantes”.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {variants.map((v) => (
              <div key={v.id} className={`card space-y-3 p-3 ${v.active ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <input className="input font-medium" aria-label="Nombre de la variante" defaultValue={v.label} onBlur={(e) => e.target.value !== v.label && upd(v, { label: e.target.value })} />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-stone-600">
                    <input type="checkbox" className="h-5 w-5 accent-brand-700" checked={v.active} onChange={() => upd(v, { active: !v.active })} /> Activa
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">Precio</span>
                    <input
                      className="input text-right"
                      inputMode="decimal"
                      defaultValue={String(v.price)}
                      onBlur={(e) => {
                        const n = parseFloat(e.target.value.replace(',', '.'))
                        if (!isNaN(n) && n !== Number(v.price)) upd(v, { price: n })
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="label">Código</span>
                    <input className="input" defaultValue={v.sku ?? ''} placeholder="SKU" onBlur={(e) => e.target.value !== (v.sku ?? '') && upd(v, { sku: e.target.value || null })} />
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm" onClick={() => setAdjust(v)}>
                    Stock: <strong>{fmtNum(v.stock)}</strong> · Ajustar
                  </button>
                  <button className="p-2 text-red-600" aria-label="Borrar variante" onClick={() => confirm(`¿Borrar la variante "${v.label}"?`) && op(() => supabase.from('variants').delete().eq('id', v.id))}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <QtyDiscounts productId={product.id} />
      <StockAdjustModal
        target={adjust ? { kind: 'variant', id: adjust.id, name: `${product.name} ${adjust.label}`, stock: adjust.stock } : null}
        onClose={() => setAdjust(null)}
        onDone={() => op(() => Promise.resolve({ error: null }), 'Stock actualizado')}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
function ConditionSelect({ value, options, optionLabel, onChange }: { value: string | null; options: AttrOption[]; optionLabel: Record<string, string>; onChange: (v: string | null) => void }) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Siempre</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>Sólo si {optionLabel[o.id]}</option>
      ))}
    </select>
  )
}

function BomTab({ product, parts, bom, options, optionLabel, op, partProcs }: Ctx) {
  const [partId, setPartId] = useState('')
  const [qty, setQty] = useState('1')
  const [cond, setCond] = useState<string | null>(null)
  const [newPart, setNewPart] = useState('')

  const add = async () => {
    let pid = partId
    if (!pid && newPart.trim()) {
      const { data, error } = await supabase.from('parts').insert({ name: newPart.trim() }).select().single()
      if (error) return op(() => Promise.resolve({ error }))
      pid = data.id
    }
    if (!pid) return
    const ok = await op(() =>
      supabase.from('product_parts').insert({ product_id: product.id, part_id: pid, quantity: parseFloat(qty.replace(',', '.')) || 1, condition_option_id: cond }),
    )
    if (ok) {
      setPartId('')
      setNewPart('')
      setQty('1')
      setCond(null)
    }
  }
  const upd = (b: ProductPart, patch: Partial<ProductPart>) => op(() => supabase.from('product_parts').update(patch).eq('id', b.id))

  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-600">
        Las partes que lleva <strong>una unidad</strong> de este producto. Si una parte depende de la variante (ej: pico de alpaca sólo en la variante alpaca), elegí la condición.
        Cómo se fabrica cada parte se define en <Link to="/admin/partes" className="text-brand-700 underline">Partes y stock</Link>.
      </p>
      {bom.length === 0 ? (
        <Empty>Este producto todavía no tiene partes.</Empty>
      ) : (
        <div className="space-y-3">
          {bom.map((b) => {
            const route = partProcs.filter((pp) => pp.part_id === b.part_id)
            return (
              <div key={b.id} className="card space-y-3 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{parts.find((p) => p.id === b.part_id)?.name}</div>
                    <div className="text-xs text-stone-500">{route.length ? route.map((r) => r.name).join(' → ') : <span className="text-amber-700">Sin procesos definidos</span>}</div>
                  </div>
                  <button className="p-1 text-red-600" aria-label="Quitar parte" onClick={() => op(() => supabase.from('product_parts').delete().eq('id', b.id))}><Icon name="trash" /></button>
                </div>
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <label className="block">
                    <span className="label">Por unidad</span>
                    <input className="input text-right" inputMode="decimal" defaultValue={String(b.quantity)} onBlur={(e) => {
                      const n = parseFloat(e.target.value.replace(',', '.'))
                      if (n > 0 && n !== Number(b.quantity)) upd(b, { quantity: n })
                    }} />
                  </label>
                  <label className="block">
                    <span className="label">Cuándo</span>
                    <ConditionSelect value={b.condition_option_id} options={options} optionLabel={optionLabel} onChange={(v) => upd(b, { condition_option_id: v })} />
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="card grid gap-3 p-4 sm:grid-cols-[1fr_6rem_1fr_auto] sm:items-end">
        <Field label="Parte">
          <select className="input" value={partId} onChange={(e) => setPartId(e.target.value)}>
            <option value="">— Nueva parte —</option>
            {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!partId && <input className="input mt-2" placeholder="Nombre de la nueva parte (ej: Palo)" value={newPart} onChange={(e) => setNewPart(e.target.value)} />}
        </Field>
        <Field label="Cantidad"><input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Cuándo"><ConditionSelect value={cond} options={options} optionLabel={optionLabel} onChange={setCond} /></Field>
        <Button onClick={add}>Agregar</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function ProcessTab({ product, procs, parts, bom, options, optionLabel, staff, op, partProcs }: Ctx) {
  const [open, setOpen] = useState(false)
  const bomParts = parts.filter((p) => bom.some((b) => b.part_id === p.id))
  const upd = (p: ProductProcess, patch: Partial<ProductProcess>) => op(() => supabase.from('product_processes').update(patch).eq('id', p.id))
  const staffSel = (value: string | null, onChange: (v: string | null) => void) => (
    <select className={`input ${!value ? 'border-amber-300 bg-amber-50' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Sin asignar</option>
      {staff.map((s) => <option key={s.id} value={s.id}>{personName(s)}</option>)}
    </select>
  )

  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-600">
        Lo que se hace sobre el producto después de tener las partes: armado, pulido final, cincelado, grabado… Puede ser sobre el <strong>conjunto</strong> o sobre <strong>una parte</strong> ya dentro del producto.
        Los pasos se hacen en orden; los que tienen el mismo número van en paralelo.
      </p>

      {bomParts.length > 0 && (
        <div className="rounded-xl bg-cream-100 p-4 text-sm">
          <div className="mb-2 font-medium">Antes de esto, se fabrican las partes:</div>
          <ul className="space-y-1 text-stone-700">
            {bomParts.map((p) => {
              const r = partProcs.filter((pp) => pp.part_id === p.id)
              return (
                <li key={p.id}>
                  <strong>{p.name}:</strong>{' '}
                  {r.length ? r.map((x) => `${x.name} (${personName(staff.find((s) => s.id === x.assignee_id))})`).join(' → ') : <span className="text-amber-700">sin procesos definidos</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {procs.length === 0 ? (
        <Empty>Sin procesos de producto. Si el producto sólo se arma, agregá “Armado”.</Empty>
      ) : (
        <ol className="space-y-3">
          {procs.map((p) => (
            <li key={p.id} className="card space-y-3 p-3">
              <div className="flex items-center gap-2">
                <label className="flex shrink-0 items-center gap-1 text-xs text-stone-500">
                  Paso
                  <input type="number" min={1} className="input w-14 px-2 text-center" defaultValue={p.step_order} onBlur={(e) => +e.target.value !== p.step_order && upd(p, { step_order: Math.max(1, +e.target.value || 1) })} />
                </label>
                <input className="input font-medium" aria-label="Nombre del proceso" defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && upd(p, { name: e.target.value.trim() })} />
                <button className="shrink-0 p-1 text-red-600" aria-label="Quitar proceso" onClick={() => op(() => supabase.from('product_processes').delete().eq('id', p.id))}><Icon name="trash" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label">Sobre</span>
                  <select className="input" value={p.part_id ?? ''} onChange={(e) => upd(p, { part_id: e.target.value || null })}>
                    <option value="">El conjunto</option>
                    {bomParts.map((bp) => <option key={bp.id} value={bp.id}>{bp.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Cuándo</span>
                  <ConditionSelect value={p.condition_option_id} options={options} optionLabel={optionLabel} onChange={(v) => upd(p, { condition_option_id: v })} />
                </label>
                <label className="block">
                  <span className="label">Responsable</span>
                  {staffSel(p.assignee_id, (v) => upd(p, { assignee_id: v }))}
                </label>
                <label className="block">
                  <span className="label">Días</span>
                  <input type="number" min={0} className="input" defaultValue={p.lead_days} onBlur={(e) => +e.target.value !== p.lead_days && upd(p, { lead_days: Math.max(0, +e.target.value || 0) })} />
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button variant="secondary" onClick={() => setOpen(true)}>+ Agregar proceso</Button>
      <NewProcessModal
        open={open}
        onClose={() => setOpen(false)}
        nextStep={(procs.at(-1)?.step_order ?? 0) + 1}
        parts={bomParts}
        options={options}
        optionLabel={optionLabel}
        staff={staff}
        onSave={async (v) => {
          const ok = await op(() => supabase.from('product_processes').insert({ ...v, product_id: product.id }), 'Proceso agregado')
          if (ok) setOpen(false)
        }}
      />
    </div>
  )
}

function NewProcessModal({
  open, onClose, nextStep, parts, options, optionLabel, staff, onSave,
}: {
  open: boolean; onClose: () => void; nextStep: number; parts: Part[]; options: AttrOption[]; optionLabel: Record<string, string>
  staff: ReturnType<typeof useStaff>; onSave: (v: Omit<ProductProcess, 'id' | 'product_id' | 'notes'>) => void
}) {
  const [f, setF] = useState({ name: '', part_id: '', condition_option_id: null as string | null, step_order: nextStep, assignee_id: '', lead_days: 1 })
  useEffect(() => {
    if (open) setF({ name: '', part_id: '', condition_option_id: null, step_order: nextStep, assignee_id: '', lead_days: 1 })
  }, [open, nextStep])
  return (
    <Modal open={open} onClose={onClose} title="Nuevo proceso">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input autoFocus className="input" placeholder="Ej: Armado, Cincelado, Grabado láser" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Sobre">
          <select className="input" value={f.part_id} onChange={(e) => setF({ ...f, part_id: e.target.value })}>
            <option value="">El conjunto</option>
            {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Cuándo">
          <ConditionSelect value={f.condition_option_id} options={options} optionLabel={optionLabel} onChange={(v) => setF({ ...f, condition_option_id: v })} />
        </Field>
        <Field label="Responsable">
          <select className="input" value={f.assignee_id} onChange={(e) => setF({ ...f, assignee_id: e.target.value })}>
            <option value="">Sin asignar</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{personName(s)}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paso n°"><input type="number" min={1} className="input" value={f.step_order} onChange={(e) => setF({ ...f, step_order: +e.target.value || 1 })} /></Field>
          <Field label="Días"><input type="number" min={0} className="input" value={f.lead_days} onChange={(e) => setF({ ...f, lead_days: +e.target.value || 0 })} /></Field>
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button
            disabled={!f.name.trim()}
            onClick={() => onSave({ ...f, name: f.name.trim(), part_id: f.part_id || null, assignee_id: f.assignee_id || null })}
          >
            Agregar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function QtyDiscounts({ productId }: { productId: string }) {
  const [rows, setRows] = useState<ProductDiscount[]>([])
  const [minQty, setMinQty] = useState('')
  const [pct, setPct] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('product_discounts').select('*').eq('product_id', productId).order('min_qty')
    setRows((data as ProductDiscount[]) ?? [])
  }, [productId])
  useEffect(() => {
    load()
  }, [load])
  const add = async () => {
    const q = parseInt(minQty)
    const p = parseFloat(pct.replace(',', '.'))
    if (!(q > 1) || !(p > 0 && p <= 90)) return setError('Poné una cantidad mayor a 1 y un porcentaje entre 1 y 90')
    setError('')
    const { error } = await supabase.from('product_discounts').upsert({ product_id: productId, min_qty: q, pct: p }, { onConflict: 'product_id,min_qty' })
    if (error) return setError(errMsg(error))
    setMinQty('')
    setPct('')
    load()
  }
  return (
    <section className="card p-5">
      <h3 className="mb-1 font-medium">Descuentos por cantidad</h3>
      <p className="mb-3 text-sm text-stone-500">Se aplican sobre el total de unidades de este producto en el pedido (sumando variantes). Gana el escalón más alto alcanzado.</p>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {rows.length > 0 && (
        <ul className="mb-3 divide-y divide-stone-100 rounded-lg border border-stone-200">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>Desde <strong>{fmtNum(r.min_qty)}</strong> u. → <strong>−{Number(r.pct)}%</strong></span>
              <button className="p-1 text-red-600" aria-label="Quitar descuento" onClick={async () => { await supabase.from('product_discounts').delete().eq('id', r.id); load() }}>
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label">Desde (u.)</span>
          <input className="input w-28 text-right" type="number" min={2} inputMode="numeric" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="100" />
        </label>
        <label className="block">
          <span className="label">Descuento %</span>
          <input className="input w-24 text-right" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="10" />
        </label>
        <Button variant="secondary" onClick={add}>Agregar</Button>
      </div>
    </section>
  )
}
