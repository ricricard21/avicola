'use client';

import { ArrowLeft, Minus, PackageOpen, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { SelectorCliente } from '@/components/negocio';
import { SinPermiso } from '@/components/shell';
import { AreaTexto, Aviso, Boton, Campo, Cargando, cx, Entrada, Selector, Tarjeta, TituloTarjeta, useAviso, Vacio } from '@/components/ui';
import { api, ErrorApi, mensajeDe, refrescarOperacion, useApi } from '@/lib/api';
import { CATEGORIA } from '@/lib/etiquetas';
import { hoy, numero, pesos, plural } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Existencia, PedidoDetalle, Sucursal } from '@/lib/tipos';

interface Renglon {
  productoId: number;
  cantidad: string;
  precio: string;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

function NuevaVenta() {
  const { puede, usuario } = useSesion();
  const router = useRouter();
  const aviso = useAviso();
  const parametros = useSearchParams();

  const { data: sucursales } = useApi<Sucursal[]>(usuario.sucursalId ? null : '/sucursales');
  const [clienteId, setClienteId] = useState<number | null>(Number(parametros.get('cliente')) || null);
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [descuento, setDescuento] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [notas, setNotas] = useState('');
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState<'pedido' | 'cotizacion' | 'preventa' | null>(null);
  const [sinExistencia, setSinExistencia] = useState<string | null>(null);

  const puedeDescontar = puede('ventas.descuento');
  const activas = (sucursales ?? []).filter((s) => s.activa);
  // Lo disponible se consulta para la sucursal que va a surtir el pedido.
  const sucursalActiva = usuario.sucursalId ?? sucursalId ?? activas[0]?.id ?? null;
  const { data: existencias } = useApi<Existencia[]>(sucursalActiva ? `/inventario/existencias?sucursalId=${sucursalActiva}` : null);
  const porId = useMemo(() => new Map((existencias ?? []).map((e) => [e.id, e])), [existencias]);

  const lineas = renglones.filter((r) => porId.has(r.productoId)).map((r) => {
    const producto = porId.get(r.productoId)!;
    const cantidad = Number(r.cantidad) || 0;
    const precio = Number(r.precio) || 0;
    return { ...r, producto, cantidadNum: cantidad, importe: redondear(cantidad * precio), excede: cantidad > producto.disponible };
  });
  const subtotal = redondear(lineas.reduce((s, l) => s + l.importe, 0));
  const descuentoNum = Math.min(subtotal, Number(descuento) || 0);
  const total = redondear(subtotal - descuentoNum);
  const hayFaltante = lineas.some((l) => l.excede);
  const valido = !!clienteId && lineas.length > 0 && lineas.every((l) => l.cantidadNum > 0);

  if (!puede('ventas.crear')) return <SinPermiso />;

  function agregar(productoId: number) {
    setSinExistencia(null);
    setRenglones((rs) => {
      const existe = rs.find((r) => r.productoId === productoId);
      if (existe) return rs.map((r) => (r === existe ? { ...r, cantidad: String((Number(r.cantidad) || 0) + 1) } : r));
      return [...rs, { productoId, cantidad: '1', precio: String(porId.get(productoId)!.precio) }];
    });
  }
  const cambiar = (productoId: number, cambios: Partial<Renglon>) => {
    setSinExistencia(null);
    setRenglones((rs) => rs.map((r) => (r.productoId === productoId ? { ...r, ...cambios } : r)));
  };

  async function guardar(modo: 'pedido' | 'cotizacion' | 'preventa') {
    setEnviando(modo);
    setSinExistencia(null);
    try {
      const pedido = await api<PedidoDetalle>('/pedidos', {
        cuerpo: {
          clienteId,
          items: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidadNum, ...(puedeDescontar ? { precioUnitario: Number(l.precio) } : {}) })),
          ...(descuentoNum > 0 ? { descuento: descuentoNum } : {}),
          fechaEntrega: fechaEntrega || null,
          notas: notas.trim() || null,
          ...(!usuario.sucursalId && sucursalActiva ? { sucursalId: sucursalActiva } : {}),
          confirmar: modo !== 'cotizacion',
          permitirFaltante: modo === 'preventa',
        },
      });
      await refrescarOperacion();
      aviso.exito(modo === 'cotizacion' ? `Cotización ${pedido.folio} guardada` : `Pedido ${pedido.folio} confirmado`);
      router.push(`/ventas/${pedido.id}`);
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'SIN_EXISTENCIA') setSinExistencia(err.message);
      else aviso.error(mensajeDe(err));
      setEnviando(null);
    }
  }

  return (
    <div className="entrada space-y-6">
      <div>
        <Link href="/ventas" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} strokeWidth={1.6} /> Ventas
        </Link>
        <h1 className="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.05] font-semibold">Nueva venta</h1>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <Tarjeta className="p-5">
            <Campo etiqueta="Cliente">
              <SelectorCliente valor={clienteId} onCambio={setClienteId} />
            </Campo>
          </Tarjeta>

          <Tarjeta>
            <TituloTarjeta>Productos</TituloTarjeta>
            <div className="px-5 pb-4">
              <Selector
                valor={null}
                onCambio={agregar}
                buscable
                placeholder={existencias ? 'Agregar producto…' : 'Cargando catálogo…'}
                opciones={(existencias ?? []).map((e) => ({
                  valor: e.id,
                  etiqueta: e.nombre,
                  detalle: `${CATEGORIA[e.categoria]} · ${pesos(e.precio)} por ${e.unidad} · ${e.disponible > 0 ? `${numero(e.disponible)} disponibles` : 'sin existencia'}`,
                }))}
              />
            </div>

            {lineas.length === 0 ? (
              <Vacio icono={<PackageOpen size={24} strokeWidth={1.5} />} titulo="Agrega los productos del pedido">
                Busca por nombre o categoría. Verás el precio y lo disponible al momento.
              </Vacio>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {lineas.map((l) => (
                  <li key={l.productoId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[1fr_auto_7.5rem_6.5rem_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.producto.nombre}</p>
                      <p className={cx('text-xs', l.excede ? 'font-medium text-bad' : 'text-muted')}>
                        {l.excede ? `Solo hay ${numero(l.producto.disponible)} ${plural(l.producto.unidad, l.producto.disponible)} disponibles` : `${numero(l.producto.disponible)} ${plural(l.producto.unidad, l.producto.disponible)} disponibles`}
                      </p>
                    </div>
                    <div className="flex items-center rounded-xl border border-line bg-surface">
                      <button type="button" aria-label="Quitar uno" onClick={() => cambiar(l.productoId, { cantidad: String(Math.max(1, l.cantidadNum - 1)) })} className="grid size-9 place-items-center text-muted hover:text-ink">
                        <Minus size={15} strokeWidth={1.7} />
                      </button>
                      <input
                        aria-label="Cantidad"
                        inputMode="decimal"
                        value={l.cantidad}
                        onChange={(e) => cambiar(l.productoId, { cantidad: e.target.value.replace(/[^\d.]/g, '') })}
                        className="num h-9 w-14 bg-transparent text-center text-sm font-semibold focus:outline-none"
                      />
                      <button type="button" aria-label="Agregar uno" onClick={() => cambiar(l.productoId, { cantidad: String(l.cantidadNum + 1) })} className="grid size-9 place-items-center text-muted hover:text-ink">
                        <Plus size={15} strokeWidth={1.7} />
                      </button>
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">$</span>
                      <Entrada
                        aria-label="Precio unitario"
                        inputMode="decimal"
                        disabled={!puedeDescontar}
                        title={puedeDescontar ? 'Precio unitario' : 'Precio de lista'}
                        value={l.precio}
                        onChange={(e) => cambiar(l.productoId, { precio: e.target.value.replace(/[^\d.]/g, '') })}
                        className="num h-9 pl-6 text-right"
                      />
                    </div>
                    <p className="num text-right text-sm font-semibold">{pesos(l.importe)}</p>
                    <button type="button" aria-label={`Quitar ${l.producto.nombre}`} onClick={() => setRenglones((rs) => rs.filter((r) => r.productoId !== l.productoId))} className="grid size-9 place-items-center justify-self-end rounded-xl text-muted hover:bg-surface-2 hover:text-bad">
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        {/* Resumen */}
        <Tarjeta className="p-5 lg:sticky lg:top-20">
          <h3 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Resumen</h3>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="num">{pesos(subtotal)}</dd>
            </div>
            {puedeDescontar && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Descuento</dt>
                <dd className="relative w-28">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">$</span>
                  <Entrada aria-label="Descuento" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" className="num h-8 pl-6 text-right" />
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sm text-muted">Total</span>
            <span className="cifra text-4xl font-semibold">{pesos(total)}</span>
          </div>

          <div className="mt-6 space-y-4">
            {!usuario.sucursalId && activas.length > 1 && (
              <Campo etiqueta="Sucursal que surte">
                <Selector valor={sucursalActiva} onCambio={setSucursalId} opciones={activas.map((s) => ({ valor: s.id, etiqueta: s.nombre }))} />
              </Campo>
            )}
            <Campo etiqueta="Fecha de entrega" opcional>
              <Entrada type="date" min={hoy()} value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            </Campo>
            <Campo etiqueta="Notas" opcional>
              <AreaTexto rows={2} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Indicaciones de entrega, acuerdos…" />
            </Campo>
          </div>

          {(sinExistencia || hayFaltante) && (
            <Aviso tono="rojo" className="mt-5" titulo={sinExistencia ? 'No alcanza el inventario' : 'Hay productos sin existencia suficiente'}>
              <p>{sinExistencia ?? 'Ajusta las cantidades o véndelo en preventa: se aparta en cuanto entre el lote.'}</p>
            </Aviso>
          )}

          <div className="mt-5 space-y-2">
            {sinExistencia || hayFaltante ? (
              <Boton variante="primario" tamano="lg" className="w-full" disabled={!valido || !!enviando} cargando={enviando === 'preventa'} onClick={() => guardar('preventa')}>
                Vender en preventa
              </Boton>
            ) : (
              <Boton variante="primario" tamano="lg" className="w-full" disabled={!valido || !!enviando} cargando={enviando === 'pedido'} onClick={() => guardar('pedido')}>
                Confirmar pedido
              </Boton>
            )}
            <Boton className="w-full" disabled={!valido || !!enviando} cargando={enviando === 'cotizacion'} onClick={() => guardar('cotizacion')}>
              Guardar como cotización
            </Boton>
          </div>
          <p className="mt-3 text-center text-xs text-muted">Al confirmar se aparta el inventario y se genera el folio del pedido.</p>
        </Tarjeta>
      </div>
    </div>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Cargando />}>
      <NuevaVenta />
    </Suspense>
  );
}
