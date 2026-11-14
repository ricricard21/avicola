'use client';

import clsx from 'clsx';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, LoaderCircle, Search, X } from 'lucide-react';
import Link from 'next/link';
import {
  ButtonHTMLAttributes,
  ComponentProps,
  createContext,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

export const cx = clsx;

/* ------------------------------------------------------------------ */
/*  Botones                                                            */
/* ------------------------------------------------------------------ */

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-accent text-accent-ink font-semibold hover:shadow-glow hover:-translate-y-px active:translate-y-0',
  secundario: 'bg-surface-2 text-ink border border-line hover:bg-surface-3',
  fantasma: 'text-muted hover:text-ink hover:bg-surface-2',
  peligro: 'text-bad border border-[color-mix(in_srgb,var(--bad)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--bad)_10%,transparent)]',
};
const baseBoton =
  'inline-flex items-center justify-center gap-2 rounded-xl whitespace-nowrap transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none select-none';
const TAMANOS = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-[15px]' };

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: keyof typeof TAMANOS;
  icono?: ReactNode;
  cargando?: boolean;
}

export function Boton({ variante = 'secundario', tamano = 'md', icono, cargando, className, children, disabled, type = 'button', ...resto }: PropsBoton) {
  return (
    <button type={type} disabled={disabled || cargando} className={cx(baseBoton, VARIANTES[variante], TAMANOS[tamano], className)} {...resto}>
      {cargando ? <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> : icono}
      {children}
    </button>
  );
}

export function BotonEnlace({ variante = 'secundario', tamano = 'md', icono, className, children, ...resto }: ComponentProps<typeof Link> & { variante?: Variante; tamano?: keyof typeof TAMANOS; icono?: ReactNode }) {
  return (
    <Link className={cx(baseBoton, VARIANTES[variante], TAMANOS[tamano], className)} {...resto}>
      {icono}
      {children}
    </Link>
  );
}

/** Menú de acciones secundarias (vidrio) */
export function Menu({ etiqueta = 'Más acciones', opciones }: { etiqueta?: string; opciones: { etiqueta: string; icono?: ReactNode; onClick: () => void; peligro?: boolean }[] }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);
  if (opciones.length === 0) return null;
  return (
    <div ref={raiz} className="relative">
      <Boton aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        {etiqueta}
        <ChevronDown size={15} strokeWidth={1.6} className={cx('text-muted transition-transform', abierto && 'rotate-180')} />
      </Boton>
      {abierto && (
        <div role="menu" className="vidrio aparecer absolute right-0 z-40 mt-2 min-w-56 overflow-hidden rounded-2xl border border-line-strong p-1.5 shadow-pop">
          {opciones.map((o) => (
            <button
              key={o.etiqueta}
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                o.onClick();
              }}
              className={cx('flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm whitespace-nowrap transition-colors hover:bg-surface-2', o.peligro && 'text-bad')}
            >
              {o.icono}
              {o.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Superficies                                                        */
/* ------------------------------------------------------------------ */

export function Tarjeta({ className, children, ...resto }: ComponentProps<'section'>) {
  return (
    <section className={cx('rounded-card border border-line bg-surface shadow-card', className)} {...resto}>
      {children}
    </section>
  );
}

export function TituloTarjeta({ children, accion, className }: { children: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
      {accion}
    </div>
  );
}

export function Encabezado({ titulo, descripcion, children }: { titulo: ReactNode; descripcion?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.05] font-semibold">{titulo}</h1>
        {descripcion && <p className="mt-1.5 max-w-2xl text-sm text-muted">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export type Tono = 'ambar' | 'verde' | 'rojo' | 'azul' | 'neutro';

export function Insignia({ tono = 'neutro', children, className, punto }: { tono?: Tono; children: ReactNode; className?: string; punto?: boolean }) {
  return (
    <span className={cx('tono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', `tono-${tono}`, className)}>
      {punto && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Aviso({ tono = 'ambar', titulo, children, accion, className }: { tono?: Tono; titulo?: ReactNode; children?: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <div className={cx('tono flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 text-sm', `tono-${tono}`, className)}>
      <CircleAlert size={18} strokeWidth={1.6} className="shrink-0" />
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className="text-ink/80">{children}</div>}
      </div>
      {accion}
    </div>
  );
}

export function Progreso({ valor, total, className, tono = 'accent' }: { valor: number; total: number; className?: string; tono?: 'accent' | 'ok' }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-700', tono === 'ok' ? 'bg-ok' : 'bg-accent')} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Formularios                                                        */
/* ------------------------------------------------------------------ */

const baseControl =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20 disabled:opacity-60';

export function Campo({ etiqueta, ayuda, children, className, opcional }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode; className?: string; opcional?: boolean }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink/85">
        {etiqueta}
        {opcional && <span className="text-xs font-normal text-muted">opcional</span>}
      </span>
      {children}
      {ayuda && <span className="mt-1.5 block text-xs text-muted">{ayuda}</span>}
    </label>
  );
}

export function Entrada({ className, ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(baseControl, 'h-10', className)} {...resto} />;
}

export function AreaTexto({ className, ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} className={cx(baseControl, 'py-2.5 leading-relaxed', className)} {...resto} />;
}

export function Buscador({ valor, onCambio, placeholder = 'Buscar…', className }: { valor: string; onCambio: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={16} strokeWidth={1.6} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
      <input type="search" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} className={cx(baseControl, 'h-10 pl-10')} />
    </div>
  );
}

export interface Opcion<V extends string | number> {
  valor: V;
  etiqueta: string;
  detalle?: string;
  deshabilitada?: boolean;
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Menú desplegable propio (vidrio), con búsqueda opcional y manejo por teclado */
export function Selector<V extends string | number>({
  valor,
  onCambio,
  opciones,
  placeholder = 'Seleccionar…',
  buscable,
  deshabilitado,
  className,
  compacto,
}: {
  valor: V | null | undefined;
  onCambio: (v: V) => void;
  opciones: Opcion<V>[];
  placeholder?: string;
  buscable?: boolean;
  deshabilitado?: boolean;
  className?: string;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const filtradas = useMemo(() => {
    const t = sinAcentos(texto.trim());
    return t ? opciones.filter((o) => sinAcentos(`${o.etiqueta} ${o.detalle ?? ''}`).includes(t)) : opciones;
  }, [opciones, texto]);
  const actual = opciones.find((o) => o.valor === valor);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setTexto('');
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto, cerrar]);

  useEffect(() => {
    lista.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activo, abierto]);

  const elegir = (o: Opcion<V>) => {
    if (o.deshabilitada) return;
    onCambio(o.valor);
    cerrar();
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierto) {
      if (['ArrowDown', 'Enter', ' '].includes(e.key) && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setAbierto(true);
        setActivo(Math.max(0, filtradas.findIndex((o) => o.valor === valor)));
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((a) => Math.min(filtradas.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtradas[activo]) elegir(filtradas[activo]);
    }
  };

  return (
    <div ref={raiz} className={cx('relative', className)} onKeyDown={teclas}>
      <button
        type="button"
        disabled={deshabilitado}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={idLista}
        onClick={() => {
          setAbierto((a) => !a);
          setActivo(Math.max(0, opciones.findIndex((o) => o.valor === valor)));
        }}
        className={cx(baseControl, compacto ? 'h-8 px-3 text-[13px]' : 'h-10', 'flex items-center justify-between gap-2 text-left', abierto && 'border-accent ring-3 ring-accent/20')}
      >
        <span className={cx('truncate', !actual && 'text-muted/80')}>{actual?.etiqueta ?? placeholder}</span>
        <ChevronDown size={16} strokeWidth={1.6} className={cx('shrink-0 text-muted transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="vidrio aparecer absolute z-50 mt-1.5 w-full min-w-56 overflow-hidden rounded-2xl border border-line-strong shadow-pop">
          {buscable && (
            <div className="relative border-b border-line">
              <Search size={15} strokeWidth={1.6} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setActivo(0);
                }}
                placeholder="Escribe para buscar…"
                className="h-10 w-full bg-transparent pr-3 pl-10 text-sm placeholder:text-muted/70 focus:outline-none"
              />
            </div>
          )}
          <ul ref={lista} id={idLista} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {filtradas.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Sin resultados</li>}
            {filtradas.map((o, i) => (
              <li
                key={String(o.valor)}
                role="option"
                aria-selected={o.valor === valor}
                aria-disabled={o.deshabilitada}
                data-activo={i === activo}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(o)}
                className={cx(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm',
                  i === activo && 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]',
                  o.deshabilitada && 'cursor-not-allowed opacity-45',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.etiqueta}</span>
                  {o.detalle && <span className="block truncate text-xs text-muted">{o.detalle}</span>}
                </span>
                {o.valor === valor && <Check size={15} strokeWidth={2} className="shrink-0 text-accent-text" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pestañas, tablas y estados vacíos                                  */
/* ------------------------------------------------------------------ */

export function Pestanas<V extends string>({ valor, onCambio, opciones, className }: { valor: V; onCambio: (v: V) => void; opciones: { valor: V; etiqueta: string; cuenta?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-2/60 p-1', className)}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          role="tab"
          aria-selected={o.valor === valor}
          onClick={() => onCambio(o.valor)}
          className={cx(
            'flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors',
            o.valor === valor ? 'bg-surface font-semibold text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.etiqueta}
          {o.cuenta !== undefined && (
            <span className={cx('num rounded-full px-1.5 text-xs', o.valor === valor ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-muted')}>{o.cuenta}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Tabla({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, derecha, className }: { children?: ReactNode; derecha?: boolean; className?: string }) {
  return (
    <th className={cx('border-b border-line px-4 py-2.5 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted uppercase first:pl-5 last:pr-5', derecha ? 'text-right' : 'text-left', className)}>
      {children}
    </th>
  );
}

export function Td({ children, derecha, className, ...resto }: ComponentProps<'td'> & { derecha?: boolean }) {
  return (
    <td className={cx('border-b border-line/70 px-4 py-3 align-middle first:pl-5 last:pr-5', derecha && 'num text-right', className)} {...resto}>
      {children}
    </td>
  );
}

export const filaClic = 'cursor-pointer transition-colors hover:bg-surface-2/60';

export function Vacio({ icono, titulo, children }: { icono?: ReactNode; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icono && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">{icono}</div>}
      <p className="display text-lg font-semibold">{titulo}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Cargando({ filas = 5 }: { filas?: number }) {
  return (
    <div className="space-y-2.5 p-5" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="esqueleto h-9" style={{ width: `${100 - ((i * 13) % 35)}%`, animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}

export function ErrorCarga({ error, onReintentar }: { error: Error; onReintentar?: () => void }) {
  return (
    <Vacio icono={<CircleAlert size={24} strokeWidth={1.5} />} titulo="No se pudo cargar">
      <p>{error.message}</p>
      {onReintentar && (
        <Boton className="mt-4" tamano="sm" onClick={onReintentar}>
          Reintentar
        </Boton>
      )}
    </Vacio>
  );
}

export function Paginacion({ pagina, porPagina, total, onCambio }: { pagina: number; porPagina: number; total: number; onCambio: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-muted">
      <span className="num">
        {(pagina - 1) * porPagina + 1}–{Math.min(total, pagina * porPagina)} de {total}
      </span>
      <div className="flex items-center gap-1">
        <Boton variante="fantasma" tamano="sm" disabled={pagina <= 1} onClick={() => onCambio(pagina - 1)} aria-label="Página anterior" icono={<ChevronLeft size={16} strokeWidth={1.6} />} />
        <span className="num px-2">
          {pagina} / {paginas}
        </span>
        <Boton variante="fantasma" tamano="sm" disabled={pagina >= paginas} onClick={() => onCambio(pagina + 1)} aria-label="Página siguiente" icono={<ChevronRight size={16} strokeWidth={1.6} />} />
      </div>
    </div>
  );
}

/** Par etiqueta / valor para fichas de detalle */
export function Dato({ etiqueta, children, className }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Diálogos                                                           */
/* ------------------------------------------------------------------ */

export function Modal({ abierto, onCerrar, titulo, descripcion, children, ancho = 'max-w-lg' }: { abierto: boolean; onCerrar: () => void; titulo: ReactNode; descripcion?: ReactNode; children: ReactNode; ancho?: string }) {
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = previo;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" onClick={onCerrar} />
      <div className={cx('aparecer relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line-strong bg-surface shadow-pop sm:rounded-3xl', ancho)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            <h2 className="text-xl leading-tight font-semibold">{titulo}</h2>
            {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink">
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function PieModal({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{children}</div>;
}

/** Diálogo que exige escribir un motivo (cancelaciones, bajas, incidencias) */
export function DialogoMotivo({
  abierto,
  onCerrar,
  onConfirmar,
  titulo,
  descripcion,
  etiqueta = 'Motivo',
  accion = 'Confirmar',
  minimo = 5,
  peligro = true,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
  titulo: string;
  descripcion?: ReactNode;
  etiqueta?: string;
  accion?: string;
  minimo?: number;
  peligro?: boolean;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (abierto) setMotivo('');
  }, [abierto]);
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={titulo} descripcion={descripcion} ancho="max-w-md">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          try {
            await onConfirmar(motivo.trim());
          } finally {
            setEnviando(false);
          }
        }}
      >
        <Campo etiqueta={etiqueta}>
          <AreaTexto autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={240} />
        </Campo>
        <PieModal>
          <Boton variante="fantasma" onClick={onCerrar}>
            Volver
          </Boton>
          <Boton type="submit" variante={peligro ? 'peligro' : 'primario'} cargando={enviando} disabled={motivo.trim().length < minimo}>
            {accion}
          </Boton>
        </PieModal>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Avisos flotantes                                                   */
/* ------------------------------------------------------------------ */

interface AvisoFlotante {
  id: number;
  tipo: 'exito' | 'error';
  texto: string;
}
const ContextoAvisos = createContext<{ exito: (t: string) => void; error: (t: string) => void } | null>(null);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<AvisoFlotante[]>([]);
  const agregar = useCallback((tipo: AvisoFlotante['tipo'], texto: string) => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a.slice(-3), { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'error' ? 7000 : 4000);
  }, []);
  const valor = useMemo(() => ({ exito: (t: string) => agregar('exito', t), error: (t: string) => agregar('error', t) }), [agregar]);
  return (
    <ContextoAvisos.Provider value={valor}>
      {children}
      <div className="no-imprimir pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className="vidrio aparecer pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-line-strong px-4 py-3 text-sm shadow-pop">
            {a.tipo === 'exito' ? <CircleCheck size={18} strokeWidth={1.6} className="mt-0.5 shrink-0 text-ok" /> : <CircleAlert size={18} strokeWidth={1.6} className="mt-0.5 shrink-0 text-bad" />}
            <span>{a.texto}</span>
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

export function useAviso() {
  const c = useContext(ContextoAvisos);
  if (!c) throw new Error('useAviso debe usarse dentro de ProveedorAvisos');
  return c;
}
