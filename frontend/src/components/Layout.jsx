import { Outlet } from 'react-router-dom';
import { TreePalm } from 'lucide-react';

/**
 * Layout general de la aplicación.
 *
 * Header fiel al prototipo elegido (Opción 3 · Por tareas): franja verde
 * oscura (--g900 del prototipo, acá primary-900), marca, toggle
 * Colaboradores/Clientes y usuario. Envuelve TODAS las páginas del panel
 * de colaboradores — cada módulo solo se preocupa por su propio
 * contenido, nunca por repetir el header.
 *
 * La navegación entre pantallas ocurre desde el Dashboard (ver
 * pages/Dashboard.jsx): cada una de las 9 tarjetas de tarea es un enlace
 * a su propia ruta. No hay menú lateral de módulos — así es el diseño
 * del prototipo elegido por el equipo.
 *
 * NOTA para el equipo: el bloque "usuario logueado" (las iniciales "MT" y
 * el nombre) todavía es texto fijo (hardcodeado). Cuando se implemente
 * HU-048 (inicio de sesión), ese dato debe venir del contexto de
 * autenticación (ver src/context/), no quedar escrito a mano acá.
 */
function Layout() {
  return (
    <div className="flex h-screen flex-col bg-surface-alt">
      <header className="flex h-[62px] shrink-0 items-center justify-between bg-primary-900 px-7">
        {/* Marca */}
        <div className="flex items-center gap-3">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary-600">
            <TreePalm size={18} strokeWidth={2} className="text-white" />
          </span>
          <div>
            <h1 className="font-display text-[17px] font-semibold leading-tight text-white">
              Rojas Mora
            </h1>
            <span className="block text-[9.5px] uppercase tracking-widest text-primary-200">
              Sports &amp; Lodge
            </span>
          </div>
        </div>

        {/* Lado derecho: toggle de vista + usuario (ambos solo visuales por ahora) */}
        <div className="flex items-center gap-2.5">
          <div className="flex gap-0.5 rounded-full bg-white/10 p-[3px]">
            <button
              type="button"
              className="rounded-full bg-white px-[15px] py-[5px] text-xs font-medium text-primary-800"
              disabled
              title="Vista de colaboradores (panel interno) — la vista de clientes se arma en el módulo de autoservicio web"
            >
              Colaboradores
            </button>
            <button
              type="button"
              className="rounded-full px-[15px] py-[5px] text-xs font-medium text-white/60"
              disabled
            >
              Clientes
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/[0.12] py-1 pl-1 pr-3.5">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-teal-400 text-[10px] font-bold text-white">
              MT
            </span>
            <span className="text-xs text-white">Marvin T. · Recepción</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-auto">
        {/* Acá se renderiza la página de cada ruta hija */}
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
