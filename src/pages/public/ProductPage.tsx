import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { imageUrl, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { fmtMoney, fmtNum } from '../../lib/format'
import type { Attribute, AttrOption, Product, ProductImage, Variant } from '../../lib/types'
import { Alert, Button, Spinner } from '../../components/ui'

export default function ProductPage() {
  const { slug } = useParams()
  const { canBuy, profile } = useAuth()
  const cart = useCart()
  const [product, setProduct] = useState<Product | null | undefined>(undefined)
  const [images, setImages] = useState<ProductImage[]>([])
  const [attrs, setAttrs] = useState<Attribute[]>([])
  const [options, setOptions] = useState<AttrOption[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [qty, setQty] = useState<Record<string, string>>({})
  const [active, setActive] = useState(0)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: p } = await supabase.from('products').select('*').eq('slug', slug!).maybeSingle()
      if (!p) return setProduct(null)
      const [im, at, va] = await Promise.all([
        supabase.from('product_images').select('*').eq('product_id', p.id).order('sort'),
        supabase.from('product_attributes').select('*').eq('product_id', p.id).order('sort'),
        canBuy ? supabase.from('variants').select('*').eq('product_id', p.id).eq('active', true).order('sort').order('label') : Promise.resolve({ data: [] }),
      ])
      const attIds = (at.data ?? []).map((a) => a.id)
      const { data: op } = attIds.length ? await supabase.from('attribute_options').select('*').in('attribute_id', attIds).order('sort') : { data: [] }
      setImages((im.data as ProductImage[]) ?? [])
      setAttrs((at.data as Attribute[]) ?? [])
      setOptions((op as AttrOption[]) ?? [])
      setVariants((va.data as Variant[]) ?? [])
      setProduct(p as Product)
    })()
  }, [slug, canBuy])

  if (product === undefined) return <Spinner />
  if (product === null)
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-stone-600">No encontramos ese producto.</p>
        <Link to="/" className="text-brand-700 underline">Volver al catálogo</Link>
      </div>
    )

  const totalSel = variants.reduce((s, v) => s + (parseInt(qty[v.id] || '0') || 0), 0)

  const addAll = () => {
    for (const v of variants) {
      const q = parseInt(qty[v.id] || '0') || 0
      if (q > 0)
        cart.add({
          variant_id: v.id,
          product_id: product.id,
          product_name: product.name,
          label: v.label,
          price: Number(v.price),
          quantity: q,
          image: v.image_path || images[0]?.path || null,
        })
    }
    setQty({})
    setAdded(true)
  }

  const mainImg = images[active]
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      <div>
        <div className="aspect-square overflow-hidden rounded-2xl bg-cream-100">
          {mainImg ? (
            <img src={imageUrl(mainImg.path)!} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center font-display text-6xl text-cream-200">LC</div>
          )}
        </div>
        {images.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {images.map((im, i) => (
              <button key={im.id} onClick={() => setActive(i)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === active ? 'border-brand-700' : 'border-transparent'}`}>
                <img src={imageUrl(im.path)!} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        {product.category && <div className="text-xs uppercase tracking-[0.15em] text-stone-500">{product.category}</div>}
        <h1 className="mt-1 font-display text-3xl font-semibold text-stone-900">{product.name}</h1>
        {product.description && <p className="mt-4 whitespace-pre-line text-stone-700">{product.description}</p>}

        {attrs.length > 0 && (
          <dl className="mt-5 space-y-1 text-sm">
            {attrs.map((a) => (
              <div key={a.id} className="flex gap-2">
                <dt className="text-stone-500">{a.name}:</dt>
                <dd className="text-stone-800">{options.filter((o) => o.attribute_id === a.id).map((o) => o.value).join(' · ')}</dd>
              </div>
            ))}
          </dl>
        )}
        {product.min_qty > 1 && <p className="mt-3 text-sm text-stone-600">Pedido mínimo: {fmtNum(product.min_qty)} unidades (sumando variantes).</p>}

        <div className="mt-6">
          {!profile ? (
            <div className="card p-5">
              <p className="mb-3 text-sm text-stone-700">Los precios son sólo para clientes mayoristas.</p>
              <div className="flex gap-2">
                <Link to="/ingresar" state={{ from: `/p/${product.slug}` }}><Button>Ingresar</Button></Link>
                <Link to="/registro"><Button variant="secondary">Crear cuenta</Button></Link>
              </div>
            </div>
          ) : !canBuy ? (
            <Alert kind="warn">Tu cuenta está pendiente de habilitación. Te avisamos cuando puedas ver precios.</Alert>
          ) : variants.length === 0 ? (
            <Alert kind="info">Este producto todavía no tiene variantes a la venta.</Alert>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="th">Variante</th>
                    <th className="th text-right">Precio</th>
                    <th className="th w-28 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {variants.map((v) => (
                    <tr key={v.id}>
                      <td className="td">
                        <div className="font-medium">{v.label || 'Única'}</div>
                        {v.sku && <div className="text-xs text-stone-400">{v.sku}</div>}
                      </td>
                      <td className="td text-right whitespace-nowrap">{fmtMoney(v.price)}</td>
                      <td className="td">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="input text-right"
                          placeholder="0"
                          value={qty[v.id] ?? ''}
                          onChange={(e) => {
                            setAdded(false)
                            setQty({ ...qty, [v.id]: e.target.value })
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 bg-stone-50 px-3 py-3">
                <span className="text-sm text-stone-600">{totalSel > 0 ? `${fmtNum(totalSel)} unidades` : 'Cargá las cantidades'}</span>
                <Button onClick={addAll} disabled={totalSel <= 0}>Agregar al pedido</Button>
              </div>
            </div>
          )}
          {added && (
            <div className="mt-3">
              <Alert kind="success">
                Agregado. <Link to="/pedido" className="font-medium underline">Ver pedido</Link> o seguí eligiendo.
              </Alert>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
