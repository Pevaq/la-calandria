import { useCallback, useEffect, useState } from 'react'
import { errMsg, supabase } from '../../lib/supabase'
import { fmtDate, fmtNum } from '../../lib/format'
import { personName, useStaff } from '../../lib/data'
import type { Part, PartProcess, Product, ProductPart } from '../../lib/types'
import { Alert, Button, Empty, PageHeader, Spinner, Tabs } from '../../components/ui'
import StockAdjustModal, { type StockTarget } from './StockAdjustModal'

interface Movement {
  id: string
  part_id: string | null
  variant_id: string | null
  delta: number
  reason: string
  created_at: string
}

export default function Parts() {
  const staff = useStaff()
  const [tab, setTab] = useState<'partes' | 'movimientos'>('partes')
  const [parts, setParts] = useState<Part[] | null>(null)
  const [procs, setProcs] = useState<PartProcess[]>([])
  const [bom, setBom] = useState<ProductPart[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [moves, setMoves] = useState<Movement[]>([])
  const [variantNames, setVariantNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [adjust, setAdjust] = useState<StockTarget | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [p, pr, b, prod, mv, vs] = await Promise.all([
      supabase.from('parts').select('*').order('name'),
      supabase.from('part_processes').select('*').order('step_order'),
      supabase.from('product_parts').select('*'),
      supabase.from('products').select('*'),
      supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('variants').select('id, label, product_id'),
    ])
    const prods = (prod.data as Product[]) ?? []
    setParts((p.data as Part[]) ?? [])
    setProcs((pr.data as PartProcess[]) ?? [])
    setBom((b.data as ProductPart[]) ?? [])
    setProducts(prods)
    setMoves((mv.data as Movement[]) ?? [])
    setVariantNames(Object.fromEntries((vs.data ?? []).map((v) => [v.id, `${prods.find((p) => p.id === v.product_id)?.name ?? ''} ${v.label}`])))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const op = async (fn: () => PromiseLike<{ error: unknown }>) => {
    setError('')
    const { error } = await fn()
    if (error) setError(errMsg(error))
    await load()
  }

  const addPart = async () => {
    if (!newName.trim()) return
    await op(() => supabase.from('parts').insert({ name: newName.trim() }))
    setNewName('')
  }

  if (!parts) return <Spinner />

  return (
    <div className="max-w-5xl">
      <PageHeader title="Partes y stock" subtitle="Cada parte tiene su ruta de fabricación con un responsable fijo. Las tareas de cada pedido se asignan solas según esto." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'partes', label: 'Partes' }, { id: 'movimientos', label: 'Movimientos de stock' }]} />

      {tab === 'partes' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input className="input max-w-xs" placeholder="Nueva parte (ej: Palo, Pico, Filtro)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPart()} />
            <Button onClick={addPart}>+ Agregar</Button>
          </div>
          {parts.length === 0 ? (
            <Empty>Sin partes. Las podés crear acá o desde la pestaña Partes de un producto.</Empty>
          ) : (
            <div className="card divide-y divide-stone-100">
              {parts.map((p) => {
                const route = procs.filter((x) => x.part_id === p.id)
                const usedIn = products.filter((pr) => bom.some((b) => b.part_id === p.id && b.product_id === pr.id))
                const isOpen = open === p.id
                return (
                  <div key={p.id}>
                    <div className="flex flex-wrap items-center gap-3 p-3">
                      <button onClick={() => setOpen(isOpen ? null : p.id)} className="min-w-0 flex-1 text-left">
                        <div className="font-medium">{isOpen ? '▾' : '▸'} {p.name}</div>
                        <div className="text-xs text-stone-500">
                          {route.length ? route.map((r) => r.name).join(' → ') : <span className="text-amber-700">Sin procesos</span>}
                          {usedIn.length > 0 && <> · en {usedIn.map((u) => u.name).join(', ')}</>}
                        </div>
                      </button>
                      <div className="text-right">
                        <div className="font-semibold">{fmtNum(p.stock)}</div>
                        <div className="text-xs text-stone-500">en stock</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setAdjust({ kind: 'part', id: p.id, name: p.name, stock: p.stock })}>Ajustar</Button>
                    </div>
                    {isOpen && <PartRoute part={p} route={route} staff={staff} op={op} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'movimientos' && (
        moves.length === 0 ? (
          <Empty>Sin movimientos todavía.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-stone-50"><tr><th className="th">Fecha</th><th className="th">Ítem</th><th className="th text-right">Cantidad</th><th className="th">Motivo</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td className="td text-stone-500">{fmtDate(m.created_at)}</td>
                    <td className="td">{m.part_id ? parts.find((p) => p.id === m.part_id)?.name : variantNames[m.variant_id!]}</td>
                    <td className={`td text-right font-medium ${m.delta < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{m.delta > 0 ? '+' : ''}{fmtNum(m.delta)}</td>
                    <td className="td text-stone-600">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <StockAdjustModal target={adjust} onClose={() => setAdjust(null)} onDone={load} />
    </div>
  )
}

function PartRoute({ part, route, staff, op }: { part: Part; route: PartProcess[]; staff: ReturnType<typeof useStaff>; op: (fn: () => PromiseLike<{ error: unknown }>) => Promise<void> }) {
  const [name, setName] = useState('')
  const upd = (r: PartProcess, patch: Partial<PartProcess>) => op(() => supabase.from('part_processes').update(patch).eq('id', r.id))
  const add = async () => {
    if (!name.trim()) return
    await op(() => supabase.from('part_processes').insert({ part_id: part.id, name: name.trim(), step_order: (route.at(-1)?.step_order ?? 0) + 1 }))
    setName('')
  }
  return (
    <div className="space-y-3 bg-stone-50 px-3 pb-4 pt-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Nombre</span>
          <input className="input" defaultValue={part.name} onBlur={(e) => e.target.value.trim() && e.target.value !== part.name && op(() => supabase.from('parts').update({ name: e.target.value.trim() }).eq('id', part.id))} />
        </label>
        <label className="block">
          <span className="label">Descripción / notas</span>
          <input className="input" defaultValue={part.description ?? ''} onBlur={(e) => e.target.value !== (part.description ?? '') && op(() => supabase.from('parts').update({ description: e.target.value || null }).eq('id', part.id))} />
        </label>
      </div>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Ruta de fabricación</div>
      {route.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th w-16">Paso</th><th className="th">Proceso</th><th className="th">Responsable</th><th className="th w-20">Días</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {route.map((r) => (
                <tr key={r.id}>
                  <td className="td"><input type="number" min={1} className="input py-1" defaultValue={r.step_order} onBlur={(e) => +e.target.value !== r.step_order && upd(r, { step_order: Math.max(1, +e.target.value || 1) })} /></td>
                  <td className="td"><input className="input py-1" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && upd(r, { name: e.target.value.trim() })} /></td>
                  <td className="td">
                    <select className={`input py-1 ${!r.assignee_id ? 'border-amber-300 bg-amber-50' : ''}`} value={r.assignee_id ?? ''} onChange={(e) => upd(r, { assignee_id: e.target.value || null })}>
                      <option value="">Sin asignar</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{personName(s)}</option>)}
                    </select>
                  </td>
                  <td className="td"><input type="number" min={0} className="input py-1" defaultValue={r.lead_days} onBlur={(e) => +e.target.value !== r.lead_days && upd(r, { lead_days: Math.max(0, +e.target.value || 0) })} /></td>
                  <td className="td text-right"><button className="text-xs text-red-600 hover:underline" onClick={() => op(() => supabase.from('part_processes').delete().eq('id', r.id))}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Nuevo proceso (ej: Corte, Pulido)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="secondary" onClick={add}>+ Proceso</Button>
        <div className="flex-1" />
        <Button variant="danger" size="sm" onClick={() => confirm(`¿Borrar la parte "${part.name}"?`) && op(() => supabase.from('parts').delete().eq('id', part.id))}>Borrar parte</Button>
      </div>
    </div>
  )
}
