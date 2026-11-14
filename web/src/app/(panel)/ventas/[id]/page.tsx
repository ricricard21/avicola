'use client';

import { ArrowLeft, Ban, Banknote, Bird, Check, MapPin, PackageCheck, Phone, Printer, RefreshCw, TriangleAlert, Truck, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { BotonWhatsApp, Folio, InsigniaCliente, InsigniaPedido, ModalPago } from '@/components/negocio';
import { AreaTexto, Aviso, Boton, Campo, Cargando, cx, Dato, DialogoMotivo, Entrada, ErrorCarga, Insignia, Menu, Modal, PieModal, Tabla, Tarjeta, Td, Th, TituloTarjeta, useAviso } from '@/components/ui';
import { api, mensajeDe, refrescarOperacion, useApi } from '@/lib/api';
import { ACCION_ESTADO, ESTADO_PEDIDO, METODO } from '@/lib/etiquetas';
import { fecha, fechaLarga, numero, pesos, plural, relativa, telefono } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { EstadoPedido, PagoResumen, PedidoDetalle } from '@/lib/tipos';

const RUTA: EstadoPedido[] = ['RECIBIDO', 'PREPARADO', 'EN_RUTA', 'ENTREGADO'];
const ICONO_ACCION: Partial<Record<EstadoPedido, ReactNode>> = {
  PREPARADO: <PackageCheck size={17} strokeWidth={1.6} />,
  EN_RUTA: <Truck size={17} strokeWidth={1.6} />,
  ENTREGADO: <Check size={17} strokeWidth={1.8} />,
  RECIBIDO: <Undo2 size={16} strokeWidth={1.6} />,
};

/** Línea de avance: Recibido → Preparado → En ruta → Entregado */
function Avance({ pedido }: { pedido: PedidoDetalle }) {
  const referencia = pedido.estado === 'INCIDENCIA' ? (pedido.siguientes[0] ?? 'RECIBIDO') : pedido.estado;
  const actual = RUTA.indexOf(referencia);
  return (
    <ol className="flex items-center">
      {RUTA.map((e, i) => {
        const hecho = i <= actual;
        const esActual = i === actual;
        return (
          <li key={e} className={cx('flex items-center', i > 0 && 'flex-1')}>
            {i > 0 && <span className={cx('mx-2 h-px flex-1 sm:mx-3', hecho ? 'bg-accent' : 'bg-line-strong')} />}
            <span className="flex items-center gap-2">
              <span
                className={cx(
                  'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-all',
                  hecho ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong text-muted',
                  esActual && pedido.estado !== 'ENTREGADO' && 'shadow-glow',
                  esActual && pedido.estado === 'INCIDENCIA' && 'border-bad bg-bad text-white shadow-none',
                )}
              >
                {hecho && !esActual ? <Check size={14} strokeWidth={2.2} /> : pedido.estado === 'INCIDENCIA' && esActual ? '!' : i + 1}
              </span>
              <span className={cx('hidden text-sm sm:block', esActual ? 'font-semibold' : hecho ? 'text-ink' : 'text-muted')}>{ESTADO_PEDIDO[e].nombre}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function DetallePedido() {
  const { id } = useParams<{ id: string }>();
  const { puede } = useSesion();
  const aviso = useAviso();
  const { data: p, error, mutate } = useApi<PedidoDetalle>(`/pedidos/${id}`);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const [entrega, setEntrega] = useState({ recibidoPor: '', nota: '' });
  const [dialogo, setDialogo] = useState<'cancelar' | 'incidencia' | null>(null);
  const [pagoACancelar, setPagoACancelar] = useState<PagoResumen | null>(null);

  if (error && !p) return <ErrorCarga error={error} onReintentar={() => mutate()} />;
  if (!p) return <Cargando filas={8} />;

  const esCotizacion = p.estado === 'COTIZACION';
  const abierto = ['RECIBIDO', 'PREPARADO', 'EN_RUTA', 'INCIDENCIA'].includes(p.estado);
  const faltante = p.items.reduce((s, i) => s + i.faltante, 0);
  const vencido = p.saldo > 0 && !!p.fechaVencimiento && relativa(p.fechaVencimiento).startsWith('hace');

  /** Ejecuta una operación sobre el pedido y refresca todo lo relacionado */
  async function operar(clave: string, ruta: string, cuerpo: object, exito: string) {
    setOcupado(clave);
    try {
      await api(ruta, { cuerpo });
      await refrescarOperacion();
      aviso.exito(exito);
      return true;
    } catch (err) {
      aviso.error(mensajeDe(err));
      return false;
    } finally {
      setOcupado(null);
    }
  }

  const avanzar = (estado: EstadoPedido) => {
    if (estado === 'ENTREGADO') {
      setEntrega({ recibidoPor: p.cliente.nombre, nota: '' });
      setEntregando(true);
    } else void operar(estado, `/pedidos/${id}/estado`, { estado }, `Pedido ${ESTADO_PEDIDO[estado].nombre.toLowerCase()}`);
  };

  // El paso que sigue en la ruta es la acción principal; lo demás va al menú.
  const pasos = puede('ventas.estado') ? p.siguientes.filter((e) => e !== 'INCIDENCIA') : [];
  const principal = p.estado === 'INCIDENCIA' ? pasos[0] : pasos.find((e) => RUTA.indexOf(e) > RUTA.indexOf(p.estado));
  const etiquetaAccion = (e: EstadoPedido) =>
    p.estado === 'INCIDENCIA' ? 'Resolver y continuar' : RUTA.indexOf(e) < RUTA.indexOf(p.estado) ? `Regresar a ${ESTADO_PEDIDO[e].nombre.toLowerCase()}` : (ACCION_ESTADO[e] ?? ESTADO_PEDIDO[e].nombre);
  const secundarias = [
    ...pasos.filter((e) => e !== principal).map((e) => ({ etiqueta: etiquetaAccion(e), icono: ICONO_ACCION[e], onClick: () => avanzar(e) })),
    ...(abierto && p.estado !== 'INCIDENCIA' && puede('ventas.estado') ? [{ etiqueta: 'Reportar incidencia', icono: <TriangleAlert size={16} strokeWidth={1.6} />, onClick: () => setDialogo('incidencia') }] : []),
    ...((esCotizacion ? puede('ventas.crear') : abierto && puede('ventas.cancelar'))
      ? [{ etiqueta: esCotizacion ? 'Descartar cotización' : 'Cancelar pedido', icono: <Ban size={16} strokeWidth={1.6} />, onClick: () => setDialogo('cancelar'), peligro: true }]
      : []),
  ];

  return (
    <div className="entrada space-y-6">
      <div>
        <Link href="/ventas" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} strokeWidth={1.6} /> Ventas
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <InsigniaPedido estado={p.estado} />
              {p.pollitanda && (
                <Link href={`/pollitandas/${p.pollitanda.pollitandaId}?expediente=${p.pollitanda.inscripcionId}`}>
                  <Insignia tono="ambar">
                    <Bird size={12} strokeWidth={1.7} /> Pollitanda · {p.pollitanda.folio}
                  </Insignia>
                </Link>
              )}
              {p.folioCotizacion && <span className="text-xs text-muted">Cotizado como {p.folioCotizacion}</span>}
            </div>
            <h1 className="text-[clamp(1.6rem,3vw,2.2rem)] leading-none font-semibold tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>
              {p.folio}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {esCotizacion ? 'Cotizado' : 'Capturado'} el {fecha(p.createdAt, { hora: true })} por {p.vendedor?.nombre ?? 'el sistema'} · {p.sucursal.nombre}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Menu opciones={secundarias} />
            {!esCotizacion && p.estado !== 'CANCELADO' && p.saldo > 0 && puede('cobranza.registrar') && (
              <Boton icono={<Banknote size={16} strokeWidth={1.6} />} onClick={() => setCobrando(true)}>
                Registrar pago
              </Boton>
            )}
            {esCotizacion && puede('ventas.crear') && (
              <Boton variante="primario" cargando={ocupado === 'confirmar'} icono={<Check size={17} strokeWidth={1.8} />} onClick={() => operar('confirmar', `/pedidos/${id}/confirmar`, {}, 'Pedido confirmado: inventario apartado')}>
                Confirmar pedido
              </Boton>
            )}
            {principal && (
              <Boton variante="primario" cargando={ocupado === principal} icono={ICONO_ACCION[principal]} onClick={() => avanzar(principal)}>
                {etiquetaAccion(principal)}
              </Boton>
            )}
          </div>
        </header>
      </div>

      {!esCotizacion && p.estado !== 'CANCELADO' && (
        <Tarjeta className="px-5 py-4 sm:px-7">
          <Avance pedido={p} />
        </Tarjeta>
      )}

      {p.estado === 'INCIDENCIA' && (
        <Aviso tono="rojo" titulo="Pedido detenido por incidencia">
          {p.incidencia}
        </Aviso>
      )}
      {p.estado === 'CANCELADO' && (
        <Aviso tono="neutro" titulo={`Cancelado el ${fecha(p.canceladoAt, { hora: true })}`}>
          {p.motivoCancelacion}
        </Aviso>
      )}
      {abierto && faltante > 0 && (
        <Aviso
          tono="ambar"
          titulo="Venta en preventa: falta inventario por apartar"
          accion={
            <Boton tamano="sm" cargando={ocupado === 'reservar'} icono={<RefreshCw size={14} strokeWidth={1.6} />} onClick={() => operar('reservar', `/pedidos/${id}/reservar`, {}, 'Se revisó el inventario disponible')}>
              Revisar de nuevo
            </Boton>
          }
        >
          Se aparta automáticamente cuando se registre la entrada del lote. Mientras tanto no se puede preparar ni entregar.
        </Aviso>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <Tarjeta className="overflow-hidden">
            <TituloTarjeta>Productos</TituloTarjeta>
            <Tabla>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th derecha>Cantidad</Th>
                  <Th derecha>Precio</Th>
                  <Th derecha>Importe</Th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <p className="font-medium">{i.descripcion}</p>
                      {i.lotes.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted">
                          {i.lotes.some((l) => l.surtida) ? 'Surtido de' : 'Apartado en'}{' '}
                          {i.lotes.map((l) => `${l.codigo}${l.ubicacion ? ` (${l.ubicacion})` : ''}${i.lotes.length > 1 ? ` × ${numero(l.cantidad)}` : ''}`).join(', ')}
                        </p>
                      )}
                      {i.faltante > 0 && <p className="mt-0.5 text-xs font-medium text-bad">Faltan {numero(i.faltante)} por apartar</p>}
                    </Td>
                    <Td derecha className="whitespace-nowrap">
                      {numero(i.cantidad)} <span className="text-xs text-muted">{plural(i.unidad, i.cantidad)}</span>
                    </Td>
                    <Td derecha>{pesos(i.precioUnitario)}</Td>
                    <Td derecha className="font-medium">
                      {pesos(i.importe)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
            <dl className="ml-auto w-full max-w-xs space-y-1.5 px-5 py-4 text-sm">
              {p.descuento > 0 && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted">Subtotal</dt>
                    <dd className="num">{pesos(p.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Descuento</dt>
                    <dd className="num">−{pesos(p.descuento)}</dd>
                  </div>
                </>
              )}
              <div className="flex items-baseline justify-between">
                <dt className="text-muted">Total</dt>
                <dd className="cifra text-2xl font-semibold">{pesos(p.total)}</dd>
              </div>
              {!esCotizacion && p.estado !== 'CANCELADO' && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted">Pagado</dt>
                    <dd className="num">{pesos(p.pagado)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-2">
                    <dt className="font-medium">Saldo</dt>
                    <dd className={cx('num font-semibold', p.saldo > 0 ? 'text-bad' : 'text-ok')}>{p.saldo > 0 ? pesos(p.saldo) : 'Liquidado'}</dd>
                  </div>
                </>
              )}
            </dl>
          </Tarjeta>

          {!esCotizacion && (
            <Tarjeta className="overflow-hidden">
              <TituloTarjeta>Pagos</TituloTarjeta>
              {p.pagos.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-muted">Aún no se registran pagos para este pedido.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {p.pagos.map((g) => (
                    <li key={g.id} className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3', g.cancelado && 'opacity-55')}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <Folio>{g.folio}</Folio> · {METODO[g.metodo]}
                          {g.referencia && <span className="text-muted"> · {g.referencia}</span>}
                        </p>
                        <p className="text-xs text-muted">
                          {fecha(g.fecha, { hora: true })} · recibió {g.usuarioNombre}
                          {g.cancelado && ` · Cancelado: ${g.motivoCancelacion}`}
                        </p>
                      </div>
                      <span className={cx('num text-sm font-semibold', g.cancelado && 'line-through')}>{pesos(g.monto)}</span>
                      <div className="flex gap-1">
                        <Link href={`/recibo/${g.id}`} target="_blank" aria-label="Ver comprobante" title="Comprobante" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
                          <Printer size={15} strokeWidth={1.5} />
                        </Link>
                        {!g.cancelado && puede('cobranza.cancelar') && (
                          <button onClick={() => setPagoACancelar(g)} aria-label="Cancelar pago" title="Cancelar pago" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-bad">
                            <Ban size={15} strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}
        </div>

        <div className="space-y-6">
          <Tarjeta>
            <TituloTarjeta accion={<InsigniaCliente tipo={p.cliente.tipo} />}>Cliente</TituloTarjeta>
            <div className="px-5 pb-5">
              <Link href={`/clientes/${p.cliente.id}`} className="display text-xl leading-tight font-semibold hover:underline">
                {p.cliente.nombre}
              </Link>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-start gap-2.5">
                  <Phone size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" />
                  <span className="num">{p.cliente.telefono ? telefono(p.cliente.telefono) : <span className="text-muted">Sin teléfono</span>}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" />
                  <span>{[p.cliente.direccion, p.cliente.municipio].filter(Boolean).join(', ') || <span className="text-muted">Sin dirección</span>}</span>
                </li>
              </ul>
              <div className="mt-4">
                <BotonWhatsApp telefono={p.cliente.telefono} mensaje={`Hola ${p.cliente.nombre}, te escribimos de Avícola San Ángel sobre tu ${esCotizacion ? 'cotización' : 'pedido'} ${p.folio}.`} />
              </div>
            </div>
          </Tarjeta>

          <Tarjeta>
            <TituloTarjeta>Entrega y cobro</TituloTarjeta>
            <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
              <Dato etiqueta="Entrega programada">
                {p.fechaEntrega ? (
                  <>
                    <span className="first-letter:uppercase">{fechaLarga(p.fechaEntrega)}</span>
                    {abierto && <span className="block text-xs text-muted first-letter:uppercase">{relativa(p.fechaEntrega)}</span>}
                  </>
                ) : (
                  <span className="text-muted">Sin fecha</span>
                )}
              </Dato>
              {!esCotizacion && (
                <Dato etiqueta="Vencimiento del saldo">
                  {p.fechaVencimiento ? <span className={cx(vencido && 'font-medium text-bad')}>{fecha(p.fechaVencimiento, { anio: true })}</span> : '—'}
                  {vencido && <span className="block text-xs text-bad first-letter:uppercase">Venció {relativa(p.fechaVencimiento)}</span>}
                </Dato>
              )}
              {p.entregadoAt && <Dato etiqueta="Entregado">{fecha(p.entregadoAt, { hora: true })}</Dato>}
              {p.recibidoPor && <Dato etiqueta="Recibió">{p.recibidoPor}</Dato>}
              {p.notas && (
                <Dato etiqueta="Notas" className="col-span-2">
                  <span className="whitespace-pre-line text-ink/85">{p.notas}</span>
                </Dato>
              )}
            </dl>
          </Tarjeta>
        </div>
      </div>

      {/* Diálogos */}
      {cobrando && <ModalPago pedido={{ id: p.id, folio: p.folio, saldo: p.saldo, total: p.total, cliente: p.cliente }} onCerrar={() => setCobrando(false)} />}

      <Modal abierto={entregando} onCerrar={() => setEntregando(false)} titulo="Registrar entrega" descripcion="Al confirmar, la mercancía sale del inventario." ancho="max-w-md">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await operar('ENTREGADO', `/pedidos/${id}/estado`, { estado: 'ENTREGADO', recibidoPor: entrega.recibidoPor, nota: entrega.nota || null }, 'Pedido entregado')) setEntregando(false);
          }}
        >
          <Campo etiqueta="¿Quién recibió?">
            <Entrada autoFocus required maxLength={120} value={entrega.recibidoPor} onChange={(e) => setEntrega((x) => ({ ...x, recibidoPor: e.target.value }))} />
          </Campo>
          <Campo etiqueta="Observaciones" opcional>
            <AreaTexto rows={2} maxLength={500} value={entrega.nota} onChange={(e) => setEntrega((x) => ({ ...x, nota: e.target.value }))} />
          </Campo>
          {p.saldo > 0 && (
            <Aviso tono="ambar">
              Queda un saldo de <strong>{pesos(p.saldo)}</strong>. Seguirá en cuentas por cobrar.
            </Aviso>
          )}
          <PieModal>
            <Boton variante="fantasma" onClick={() => setEntregando(false)}>
              Volver
            </Boton>
            <Boton type="submit" variante="primario" cargando={ocupado === 'ENTREGADO'}>
              Confirmar entrega
            </Boton>
          </PieModal>
        </form>
      </Modal>

      <DialogoMotivo
        abierto={dialogo === 'cancelar'}
        onCerrar={() => setDialogo(null)}
        titulo={esCotizacion ? 'Descartar cotización' : `Cancelar ${p.folio}`}
        descripcion={esCotizacion ? undefined : 'Se libera el inventario apartado. Esta acción no se puede deshacer.'}
        accion={esCotizacion ? 'Descartar' : 'Cancelar pedido'}
        onConfirmar={async (motivo) => {
          if (await operar('cancelar', `/pedidos/${id}/cancelar`, { motivo }, esCotizacion ? 'Cotización descartada' : 'Pedido cancelado')) setDialogo(null);
        }}
      />
      <DialogoMotivo
        abierto={dialogo === 'incidencia'}
        onCerrar={() => setDialogo(null)}
        titulo="Reportar incidencia"
        descripcion="El pedido se detiene hasta que se resuelva."
        etiqueta="¿Qué pasó?"
        accion="Reportar"
        onConfirmar={async (nota) => {
          if (await operar('incidencia', `/pedidos/${id}/estado`, { estado: 'INCIDENCIA', nota }, 'Incidencia registrada')) setDialogo(null);
        }}
      />
      <DialogoMotivo
        abierto={!!pagoACancelar}
        onCerrar={() => setPagoACancelar(null)}
        titulo={`Cancelar pago ${pagoACancelar?.folio ?? ''}`}
        descripcion={pagoACancelar ? `${pesos(pagoACancelar.monto)} regresan al saldo del pedido. El recibo queda en el historial como cancelado.` : undefined}
        accion="Cancelar pago"
        onConfirmar={async (motivo) => {
          if (await operar('pago', `/pagos/${pagoACancelar!.id}/cancelar`, { motivo }, 'Pago cancelado')) setPagoACancelar(null);
        }}
      />
    </div>
  );
}
