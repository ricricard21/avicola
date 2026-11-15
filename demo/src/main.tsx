import { ComponentType, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import PanelLayout from '@/app/(panel)/layout';
import Inicio from '@/app/(panel)/page';
import Clientes from '@/app/(panel)/clientes/page';
import Cliente from '@/app/(panel)/clientes/[id]/page';
import Ventas from '@/app/(panel)/ventas/page';
import NuevaVenta from '@/app/(panel)/ventas/nuevo/page';
import Pedido from '@/app/(panel)/ventas/[id]/page';
import Pollitandas from '@/app/(panel)/pollitandas/page';
import Pollitanda from '@/app/(panel)/pollitandas/[id]/page';
import Productos from '@/app/(panel)/productos/page';
import Inventario from '@/app/(panel)/inventario/page';
import Cobranza from '@/app/(panel)/cobranza/page';
import Mensajes from '@/app/(panel)/mensajes/page';
import Reportes from '@/app/(panel)/reportes/page';
import Configuracion from '@/app/(panel)/configuracion/page';
import Login from '@/app/login/page';
import Recibo from '@/app/recibo/[id]/page';
import { ProveedorAvisos } from '@/components/ui';
import { ContextoParametros, useUbicacion } from './shims/navigation';
import './estilos.css';

/** Las mismas pantallas del panel; aquí solo se decide cuál mostrar según la dirección */
const RUTAS: [RegExp, ComponentType, boolean][] = [
  [/^\/$/, Inicio, true],
  [/^\/clientes$/, Clientes, true],
  [/^\/clientes\/(\d+)$/, Cliente, true],
  [/^\/ventas$/, Ventas, true],
  [/^\/ventas\/nuevo$/, NuevaVenta, true],
  [/^\/ventas\/(\d+)$/, Pedido, true],
  [/^\/pollitandas$/, Pollitandas, true],
  [/^\/pollitandas\/(\d+)$/, Pollitanda, true],
  [/^\/productos$/, Productos, true],
  [/^\/inventario$/, Inventario, true],
  [/^\/cobranza$/, Cobranza, true],
  [/^\/mensajes$/, Mensajes, true],
  [/^\/reportes$/, Reportes, true],
  [/^\/configuracion$/, Configuracion, true],
  [/^\/login$/, Login, false],
  [/^\/recibo\/(\d+)$/, Recibo, false],
];

function App() {
  const { pathname, search } = useUbicacion();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  for (const [patron, Pantalla, enPanel] of RUTAS) {
    const coincide = patron.exec(pathname);
    if (!coincide) continue;
    const pantalla = (
      <ContextoParametros.Provider value={{ id: coincide[1] }}>
        <Pantalla key={`${pathname}?${search}`} />
      </ContextoParametros.Provider>
    );
    return enPanel ? <PanelLayout>{pantalla}</PanelLayout> : pantalla;
  }
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="display text-2xl font-semibold">Esta pantalla no existe</p>
        <a href="#/" className="mt-3 inline-block text-sm text-accent-text underline">
          Volver al inicio
        </a>
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProveedorAvisos>
      <App />
    </ProveedorAvisos>
  </StrictMode>,
);
