import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  UtensilsCrossed,
  Receipt,
  CircleCheck,
  Banknote,
  Clock,
  Lock,
  UserPlus,
  ScrollText,
} from 'lucide-react';
import Layout from './components/Layout.jsx';
import PantallaPendiente from './components/PantallaPendiente.jsx';
import Dashboard from './pages/Dashboard.jsx';
import SeleccionarEspacio from './pages/SeleccionarEspacio.jsx';
import ReservasCancha from './pages/ReservasCancha.jsx';

/**
 * Router principal de la aplicación.
 *
 * La ruta raíz "/" es el Dashboard (pantalla principal del prototipo
 * elegido, Opción 3 · Por tareas). Cada una de las 9 tarjetas del
 * Dashboard navega a su propia ruta:
 *   - "Registrar reserva" → /reservar (selección de espacio) → el módulo
 *     real correspondiente (/cancha, /salon, /cabanas, /restaurante).
 *   - Las otras 8 tareas → /tareas/<id>, con una pantalla de "pendiente
 *     de implementar" hasta que exista su HU.
 *
 * Las rutas de módulo (una por cada carpeta de backend/src/modules/)
 * están declaradas todas acá. Convención para el equipo: cuando empieces
 * tu módulo, creá tu propio archivo en src/pages/ (ej.
 * src/pages/ReservasSalon.jsx) y reemplazá acá SOLO el <Route> de tu
 * módulo por tu componente — nunca toques las rutas de los demás, para
 * evitar conflictos de Git en este archivo compartido.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />

          {/* Flujo de "Registrar reserva" */}
          <Route path="reservar" element={<SeleccionarEspacio />} />

          {/* Módulos funcionales (uno por sprint/responsable) */}
          {/* Sprint 1 — Marvin */}
          <Route path="cancha" element={<ReservasCancha />} />
          {/* Sprint 2 — Wagner */}
          <Route
            path="salon"
            element={<PantallaPendiente titulo="Salón de eventos" huRelacionadas="HU-007 a HU-015" />}
          />
          {/* Sprint 3 — Kendall */}
          <Route
            path="cabanas"
            element={<PantallaPendiente titulo="Cabañas" huRelacionadas="HU-016 a HU-022, HU-127" />}
          />
          {/* Sprint 4 — Alison */}
          <Route
            path="restaurante"
            element={<PantallaPendiente titulo="Restaurante" huRelacionadas="HU-023 a HU-031" />}
          />
          {/* Sprint 5 — Marvin */}
          <Route
            path="usuarios"
            element={<PantallaPendiente titulo="Usuarios y roles" huRelacionadas="HU-032 a HU-039" />}
          />
          {/* Sprint 6 — Wagner */}
          <Route
            path="clientes"
            element={<PantallaPendiente titulo="Clientes" huRelacionadas="HU-108 a HU-112" />}
          />
          {/* Sprint 7 — Kendall */}
          <Route
            path="facturacion"
            element={<PantallaPendiente titulo="Facturación y pagos" huRelacionadas="HU-040 a HU-045" />}
          />
          {/* Sprint 8 — Alison */}
          <Route
            path="autoservicio"
            element={<PantallaPendiente titulo="Solicitudes web (autoservicio)" huRelacionadas="HU-049 a HU-072" />}
          />
          {/* Sprint 9 — Marvin */}
          <Route
            path="sinpe"
            element={<PantallaPendiente titulo="Comprobantes SINPE" huRelacionadas="HU-074 a HU-078" />}
          />
          {/* Sprint 10 — Wagner */}
          <Route
            path="disponibilidad"
            element={<PantallaPendiente titulo="Disponibilidad y bloqueos" huRelacionadas="HU-067, HU-079 a HU-101" />}
          />
          {/* Sprint 11 — Kendall */}
          <Route
            path="auditoria"
            element={<PantallaPendiente titulo="Auditoría y reportes" huRelacionadas="HU-120 a HU-124" />}
          />

          {/* Tareas del Dashboard sin módulo propio (todavía) */}
          <Route
            path="tareas/mesa"
            element={<PantallaPendiente icon={UtensilsCrossed} titulo="Abrir cuenta de mesa" huRelacionadas="HU-024" />}
          />
          <Route
            path="tareas/factura"
            element={<PantallaPendiente icon={Receipt} titulo="Cobrar y facturar" huRelacionadas="HU-028, HU-040" />}
          />
          <Route
            path="tareas/aprobar"
            element={<PantallaPendiente icon={CircleCheck} titulo="Aprobar solicitudes" huRelacionadas="HU-070, HU-071" />}
          />
          <Route
            path="tareas/sinpe"
            element={<PantallaPendiente icon={Banknote} titulo="Verificar SINPE" huRelacionadas="HU-077, HU-078" />}
          />
          <Route
            path="tareas/extender"
            element={<PantallaPendiente icon={Clock} titulo="Extender hospedaje" huRelacionadas="HU-127" />}
          />
          <Route
            path="tareas/bloquear"
            element={<PantallaPendiente icon={Lock} titulo="Bloquear espacio" huRelacionadas="HU-079 a HU-101" />}
          />
          <Route
            path="tareas/cliente"
            element={<PantallaPendiente icon={UserPlus} titulo="Registrar cliente" huRelacionadas="HU-108" />}
          />
          <Route
            path="tareas/bitacora"
            element={<PantallaPendiente icon={ScrollText} titulo="Consultar bitácora" huRelacionadas="HU-120, HU-121" />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
