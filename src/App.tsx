import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout, PublicLayout, RequireRole, WorkerLayout } from './components/layouts'
import Catalog from './pages/public/Catalog'
import ProductPage from './pages/public/ProductPage'
import Login from './pages/public/Login'
import Register from './pages/public/Register'
import Cart from './pages/public/Cart'
import OrderView from './pages/public/OrderView'
import MyOrders from './pages/public/MyOrders'
import Orders from './pages/admin/Orders'
import OrderDetail from './pages/admin/OrderDetail'
import Products from './pages/admin/Products'
import ProductEditor from './pages/admin/ProductEditor'
import Parts from './pages/admin/Parts'
import Team from './pages/admin/Team'
import Planning from './pages/admin/Planning'
import SettingsPage from './pages/admin/Settings'
import MyWeek from './pages/worker/MyWeek'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Catalog />} />
        <Route path="p/:slug" element={<ProductPage />} />
        <Route path="ingresar" element={<Login />} />
        <Route path="registro" element={<Register />} />
        <Route path="pedido" element={<Cart />} />
        <Route path="pedido/:id" element={<RequireRole roles={['client', 'admin', 'worker']}><OrderView /></RequireRole>} />
        <Route path="mis-pedidos" element={<RequireRole roles={['client', 'admin', 'worker']}><MyOrders /></RequireRole>} />
      </Route>

      <Route path="admin" element={<RequireRole roles={['admin']}><AdminLayout /></RequireRole>}>
        <Route index element={<Orders />} />
        <Route path="pedidos/:id" element={<OrderDetail />} />
        <Route path="planificacion" element={<Planning />} />
        <Route path="productos" element={<Products />} />
        <Route path="productos/:id" element={<ProductEditor />} />
        <Route path="partes" element={<Parts />} />
        <Route path="equipo" element={<Team />} />
        <Route path="configuracion" element={<SettingsPage />} />
      </Route>

      <Route path="trabajo" element={<RequireRole roles={['admin', 'worker']}><WorkerLayout /></RequireRole>}>
        <Route index element={<MyWeek />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
