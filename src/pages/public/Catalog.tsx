import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { imageUrl, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmtMoney } from '../../lib/format'
import { usePricing } from '../../lib/pricing'
import type { Product, ProductImage, Variant } from '../../lib/types'
import { Alert, BIRD_URL, Empty, Spinner } from '../../components/ui'

export default function Catalog() {
  const { canBuy, profile } = useAuth()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [cat, setCat] = useState<string>('')
  const pricing = usePricing((products ?? []).map((p) => p.id))

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: p } = await supabase.from('products').select('*').eq('published', true).order('sort').order('name')
      const ids = (p ?? []).map((x) => x.id)
      const { data: im } = ids.length ? await supabase.from('product_images').select('*').in('product_id', ids).order('sort') : { data: [] }
      if (!alive) return
      setImages((im as ProductImage[]) ?? [])
      if (canBuy && ids.length) {
        const { data: v } = await supabase.from('variants').select('*').in('product_id', ids).eq('active', true)
        if (!alive) return
        setVariants((v as Variant[]) ?? [])
      }
      setProducts((p as Product[]) ?? [])
    })()
    return () => {
      alive = false
    }
  }, [canBuy])

  const categories = useMemo(() => [...new Set((products ?? []).map((p) => p.category).filter(Boolean))] as string[], [products])
  const list = (products ?? []).filter((p) => !cat || p.category === cat)

  return (
    <div>
      <section className="relative mb-8 overflow-hidden rounded-2xl bg-brand-800 px-6 py-9 text-cream-100 sm:mb-10 sm:px-10 sm:py-14">
        <img src={BIRD_URL} alt="" aria-hidden className="pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 opacity-15 sm:h-80 sm:w-80" />
        <p className="relative mb-3 text-xs font-medium uppercase tracking-[0.2em] text-leather-500">Venta mayorista</p>
        <h1 className="relative max-w-2xl font-display text-3xl leading-tight sm:text-5xl">Bombillas y productos para el mate, hechos a mano.</h1>
        <p className="relative mt-4 max-w-xl text-cream-100/80">
          Elegí modelos y cantidades, mandanos el pedido y te confirmamos la fecha de entrega.
        </p>
        {!profile && (
          <div className="relative mt-6 flex flex-wrap gap-3">
            <Link to="/registro" className="rounded-lg bg-cream-100 px-4 py-2 text-sm font-medium text-brand-900 hover:bg-white">
              Crear cuenta mayorista
            </Link>
            <Link to="/ingresar" className="rounded-lg border border-cream-100/40 px-4 py-2 text-sm font-medium hover:bg-brand-700">
              Ya tengo cuenta
            </Link>
          </div>
        )}
      </section>

      {profile && !canBuy && (
        <div className="mb-6">
          <Alert kind="warn">Tu cuenta está pendiente de habilitación. Cuando esté lista vas a ver los precios y vas a poder hacer pedidos.</Alert>
        </div>
      )}

      {categories.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {['', ...categories].map((c) => (
            <button
              key={c || 'all'}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1 text-sm ${cat === c ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'}`}
            >
              {c || 'Todos'}
            </button>
          ))}
        </div>
      )}

      {!products ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty>Todavía no hay productos publicados.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => {
            const img = images.find((i) => i.product_id === p.id)
            const prices = variants.filter((v) => v.product_id === p.id).map((v) => Number(v.price))
            const min = prices.length ? Math.min(...prices) : null
            return (
              <Link key={p.id} to={`/p/${p.slug}`} className="group">
                <div className="aspect-square overflow-hidden rounded-xl bg-cream-100">
                  {img ? (
                    <img src={imageUrl(img.path)!} alt={p.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-brand-800"><img src={BIRD_URL} alt="" className="h-1/2 w-1/2 opacity-80" /></div>
                  )}
                </div>
                <div className="mt-2">
                  {p.category && <div className="text-xs uppercase tracking-wide text-stone-500">{p.category}</div>}
                  <div className="font-medium text-stone-900 group-hover:text-brand-700">{p.name}</div>
                  {canBuy && min !== null && <div className="text-sm text-stone-600">desde {fmtMoney(pricing.unitPrice(min, p.id, 1))}</div>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
