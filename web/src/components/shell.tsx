'use client';

import {
  Bird,
  Boxes,
  ChartColumn,
  ChevronDown,
  Egg,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Package,
  Settings,
  ShoppingCart,
  Sun,
  Tractor,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { api, mensajeDe, useApi } from '@/lib/api';
import { iniciales } from '@/lib/formato';
import { useSesion, useTema } from '@/lib/sesion';
import { Boton, Campo, cx, Entrada, Modal, PieModal, useAviso } from './ui';

const ICONO = { size: 18, strokeWidth: 1.5 } as const;

const NAVEGACION: { ruta: string; nombre: string; icono: ReactNode; permisos?: string[] }[] = [
  { ruta: '/', nombre: 'Inicio', icono: <LayoutDashboard {...ICONO} /> },
  { ruta: '/clientes', nombre: 'Clientes', icono: <Users {...ICONO} />, permisos: ['clientes.ver'] },
  { ruta: '/ventas', nombre: 'Ventas', icono: <ShoppingCart {...ICONO} />, permisos: ['ventas.ver'] },
  { ruta: '/pollitandas', nombre: 'Pollitandas', icono: <Bird {...ICONO} />, permisos: ['pollitandas.ver'] },
  { ruta: '/productos', nombre: 'Productos', icono: <Package {...ICONO} />, permisos: ['productos.ver'] },
  { ruta: '/inventario', nombre: 'Inventario', icono: <Boxes {...ICONO} />, permisos: ['inventario.ver'] },
  { ruta: '/cobranza', nombre: 'Cobranza', icono: <Wallet {...ICONO} />, permisos: ['cobranza.ver'] },
  { ruta: '/mensajes', nombre: 'Mensajes', icono: <MessageCircle {...ICONO} />, permisos: ['mensajes.ver'] },
  { ruta: '/reportes', nombre: 'Reportes', icono: <ChartColumn {...ICONO} />, permisos: ['reportes.ver'] },
  { ruta: '/configuracion', nombre: 'Configuración', icono: <Settings {...ICONO} />, permisos: ['config.usuarios', 'config.catalogos', 'config.bitacora'] },
];

/** Módulos de la siguiente etapa: visibles para saber qué viene, sin acceso todavía */
const PROXIMAMENTE = [
  { nombre: 'Granja', icono: <Tractor {...ICONO} /> },
  { nombre: 'Distribución', icono: <Truck {...ICONO} /> },
];

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-3 px-2">
      <span className="grid size-10 place-items-center rounded-[14px] bg-accent text-accent-ink shadow-glow">
        <Egg size={20} strokeWidth={1.6} />
      </span>
      <span className="leading-none">
        <span className="block text-[10px] font-semibold tracking-[0.22em] text-muted uppercase">Avícola</span>
        <span className="display mt-0.5 block text-[19px] font-semibold">San Ángel</span>
      </span>
    </Link>
  );
}

function Navegacion({ alNavegar }: { alNavegar?: () => void }) {
  const ruta = usePathname();
  const { puede } = useSesion();
  const verMensajes = puede('mensajes.ver');
  const { data: bandeja } = useApi<{ conteo: Record<string, number> }>(verMensajes ? '/notificaciones?estado=PENDIENTE&pagina=1' : null, { refreshInterval: 120_000 });
  const pendientes = bandeja?.conteo?.PENDIENTE ?? 0;

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
      {NAVEGACION.filter((n) => !n.permisos || puede(...n.permisos)).map((n) => {
        const activa = n.ruta === '/' ? ruta === '/' : ruta.startsWith(n.ruta);
        return (
          <Link
            key={n.ruta}
            href={n.ruta}
            onClick={alNavegar}
            aria-current={activa ? 'page' : undefined}
            className={cx(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
              activa ? 'bg-surface-2 font-semibold text-ink' : 'text-muted hover:bg-surface-2/60 hover:text-ink',
            )}
          >
            {activa && <span className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-accent shadow-glow" />}
            <span className={cx('transition-colors', activa && 'text-accent-text')}>{n.icono}</span>
            {n.nombre}
            {n.ruta === '/mensajes' && pendientes > 0 && <span className="num ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">{pendientes}</span>}
          </Link>
        );
      })}

      <p className="mt-6 mb-1 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted/70 uppercase">Etapa 2</p>
      {PROXIMAMENTE.map((n) => (
        <span key={n.nombre} className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted/55" title="Disponible en la Etapa 2">
          {n.icono}
          {n.nombre}
          <Lock size={13} strokeWidth={1.5} className="ml-auto" />
        </span>
      ))}
    </nav>
  );
}

function MenuUsuario() {
  const { usuario, salir } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  return (
    <div ref={raiz} className="relative">
      <button onClick={() => setAbierto((a) => !a)} aria-haspopup="menu" aria-expanded={abierto} className="flex items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 transition-colors hover:bg-surface-2">
        <span className="grid size-8 place-items-center rounded-[10px] bg-surface-3 text-xs font-semibold">{iniciales(usuario.nombre)}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-36 truncate text-[13px] font-medium">{usuario.nombre}</span>
          <span className="block text-[11px] text-muted">{usuario.rolNombre}</span>
        </span>
        <ChevronDown size={15} strokeWidth={1.6} className="text-muted" />
      </button>
      {abierto && (
        <div role="menu" className="vidrio aparecer absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line-strong p-1.5 shadow-pop">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{usuario.nombre}</p>
            <p className="truncate text-xs text-muted">{usuario.email}</p>
            <p className="mt-1 text-xs text-muted">{usuario.sucursal ? usuario.sucursal.nombre : 'Todas las sucursales'}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              setCambiando(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-surface-2"
          >
            <KeyRound size={16} strokeWidth={1.5} /> Cambiar contraseña
          </button>
          <button role="menuitem" onClick={salir} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-bad hover:bg-surface-2">
            <LogOut size={16} strokeWidth={1.5} /> Cerrar sesión
          </button>
        </div>
      )}
      <CambiarPassword abierto={cambiando} onCerrar={() => setCambiando(false)} />
    </div>
  );
}

function CambiarPassword({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const aviso = useAviso();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (abierto) {
      setActual('');
      setNueva('');
    }
  }, [abierto]);
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Cambiar contraseña" ancho="max-w-sm">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          try {
            await api('/auth/password', { cuerpo: { actual, nueva } });
            aviso.exito('Contraseña actualizada');
            onCerrar();
          } catch (err) {
            aviso.error(mensajeDe(err));
          } finally {
            setEnviando(false);
          }
        }}
      >
        <Campo etiqueta="Contraseña actual">
          <Entrada type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
        </Campo>
        <Campo etiqueta="Contraseña nueva" ayuda="Mínimo 8 caracteres">
          <Entrada type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} minLength={8} required />
        </Campo>
        <PieModal>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={enviando}>
            Guardar
          </Boton>
        </PieModal>
      </form>
    </Modal>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [tema, alternarTema] = useTema();
  const ruta = usePathname();
  useEffect(() => setMenu(false), [ruta]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barra lateral (escritorio) */}
      <aside className="no-imprimir fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/70 py-5 backdrop-blur-xl lg:flex">
        <div className="px-3 pb-5">
          <Marca />
        </div>
        <Navegacion />
        <p className="px-6 pt-3 text-[11px] text-muted/70">Etapa 1 · Administración comercial</p>
      </aside>

      {/* Menú deslizable (celular) */}
      {menu && (
        <div className="no-imprimir fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" onClick={() => setMenu(false)} />
          <aside className="aparecer absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface py-5 shadow-pop">
            <div className="flex items-center justify-between px-3 pb-5">
              <Marca />
              <button onClick={() => setMenu(false)} aria-label="Cerrar menú" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2">
                <X size={18} strokeWidth={1.6} />
              </button>
            </div>
            <Navegacion alNavegar={() => setMenu(false)} />
          </aside>
        </div>
      )}

      <header className="vidrio no-imprimir sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line px-4 sm:px-6">
        <button onClick={() => setMenu(true)} aria-label="Abrir menú" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 lg:hidden">
          <Menu size={19} strokeWidth={1.6} />
        </button>
        <div className="lg:hidden">
          <span className="display text-[17px] font-semibold">San Ángel</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={alternarTema}
            aria-label={tema === 'dia' ? 'Cambiar a modo noche' : 'Cambiar a modo día'}
            title={tema === 'dia' ? 'Modo noche' : 'Modo día'}
            className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {tema === 'dia' ? <Moon size={18} strokeWidth={1.5} /> : <Sun size={18} strokeWidth={1.5} />}
          </button>
          <MenuUsuario />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

/** Mensaje para pantallas a las que el usuario llegó sin permiso */
export function SinPermiso() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div>
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <Lock size={24} strokeWidth={1.5} />
        </div>
        <p className="display text-xl font-semibold">Sin acceso a este módulo</p>
        <p className="mt-1.5 text-sm text-muted">Pide a Dirección que active el permiso en tu usuario.</p>
      </div>
    </div>
  );
}
