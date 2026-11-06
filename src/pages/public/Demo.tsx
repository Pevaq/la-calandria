import DemoLogin from '../../components/DemoLogin'
import { Alert } from '../../components/ui'

export default function Demo() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-display text-3xl font-semibold">Entrar como…</h1>
      <p className="mb-5 text-sm text-stone-600">Modo prueba: elegí un usuario y entrás directo, sin contraseña.</p>
      <DemoLogin />
      <div className="mt-6">
        <Alert kind="warn">Sólo para la etapa de pruebas. Antes de usar la app con clientes reales se apaga este acceso y se borran los usuarios de prueba.</Alert>
      </div>
    </div>
  )
}
