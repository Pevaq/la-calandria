// Login rápido para la etapa de pruebas.
// Se apaga poniendo VITE_DEMO_LOGIN=0 en el archivo .env (o borrando la línea).
export const DEMO_LOGIN = import.meta.env.VITE_DEMO_LOGIN === '1'
export const DEMO_PASSWORD = 'prueba123'

export interface DemoUser {
  email: string
  name: string
  detail: string
  group: 'Dueño' | 'Equipo' | 'Clientes'
}

export const DEMO_USERS: DemoUser[] = [
  { group: 'Dueño', email: 't-admin@lacalandria.test', name: 'Dueño', detail: 'Back office completo · hace el armado' },
  { group: 'Equipo', email: 't-juan@lacalandria.test', name: 'Juan', detail: 'Pergamino · corte y pulido de palos' },
  { group: 'Equipo', email: 't-pedro@lacalandria.test', name: 'Pedro', detail: 'Rosario · fundición de picos y cincelado' },
  { group: 'Equipo', email: 't-lucia@lacalandria.test', name: 'Lucía', detail: 'Pergamino · filtros y armado de rectas' },
  { group: 'Clientes', email: 't-cliente@lacalandria.test', name: 'Mates del Sur', detail: 'Rosario · tiene un pedido atrasado' },
  { group: 'Clientes', email: 't-tito@lacalandria.test', name: 'Almacén Don Tito', detail: 'Pergamino · pedido nuevo sin pagar' },
  { group: 'Clientes', email: 't-laposta@lacalandria.test', name: 'Regionales La Posta', detail: 'Rosario · pedido pagado y uno entregado' },
  { group: 'Clientes', email: 't-mateando@lacalandria.test', name: 'Mateando SRL', detail: 'Córdoba · pedido en producción' },
]
