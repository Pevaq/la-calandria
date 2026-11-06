import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errMsg, imageUrl, supabase } from '../../lib/supabase'
import { fmtNum, slugify } from '../../lib/format'
import type { Product, ProductImage, Variant } from '../../lib/types'
import { Alert, Badge, Button, Empty, Field, Modal, PageHeader, Spinner } from '../../components/ui'

export default function Products() {
  const nav = useNavigate()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [variants, setVariants] = useState<Pick<Variant, 'product_id' | 'stock' | 'active'>[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [p, i, v] = await Promise.all([
        supabase.from('products').select('*').order('sort').order('name'),
        supabase.from('product_images').select('*').order('sort'),
        supabase.from('variants').select('product_id, stock, active'),
      ])
      setImages((i.data as ProductImage[]) ?? [])
      setVariants(v.data ?? [])
      setProducts((p.data as Product[]) ?? [])
    })()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    const base = slugify(name)
    const { data, error } = await supabase
      .from('products')
      .insert({ name: name.trim(), slug: `${base}-${Math.random().toString(36).slice(2, 6)}` })
      .select()
      .single()
    setBusy(false)
    if (error) return setError(errMsg(error))
    // slug limpio si está libre
    await supabase.from('products').update({ slug: base }).eq('id', data.id)
    nav(`/admin/productos/${data.id}`)
  }

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle="Cada producto define sus variantes, las partes que lleva y los procesos para fabricarlo."
        actions={<Button onClick={() => setOpen(true)}>+ Nuevo producto</Button>}
      />
      {!products ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Empty>Todavía no cargaste productos. Empezá por “Nuevo producto”.</Empty>
      ) : (
        <div className="card divide-y divide-stone-100">
          {products.map((p) => {
            const img = images.find((i) => i.product_id === p.id)
            const vs = variants.filter((v) => v.product_id === p.id)
            return (
              <Link key={p.id} to={`/admin/productos/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-stone-50">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cream-100">
                  {img && <img src={imageUrl(img.path)!} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-xs text-stone-500">
                    {p.category || 'Sin categoría'} · {vs.length} variantes · stock {fmtNum(vs.reduce((s, v) => s + v.stock, 0))}
                  </div>
                </div>
                {p.published ? <Badge color="bg-emerald-100 text-emerald-800">Publicado</Badge> : <Badge>Borrador</Badge>}
              </Link>
            )
          })}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo producto">
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Nombre">
            <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Ej: Bombilla Pico de Loro" />
          </Field>
          <div className="flex justify-end">
            <Button onClick={create} loading={busy}>Crear y editar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
