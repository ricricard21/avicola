'use client';

import { ArrowLeft, Banknote, Bird, ExternalLink, Pencil, Printer, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { BotonWhatsApp, Folio, InsigniaExpediente, InsigniaPedido, ModalPago, PedidoPorCobrar } from '@/components/negocio';
import { ModalInscripcion, ModalPollitanda } from '@/components/pollitandas';
import { Aviso, Boton, Cargando, cx, Dato, DialogoMotivo, ErrorCarga, filaClic, Insignia, Modal, Progreso, Tabla, Tarjeta, Td, Th, useAviso, Vacio } from '@/components/ui';
import { api, mensajeDe, refrescarOperacion, useApi } from '@/lib/api';
import { METODO } from '@/lib/etiquetas';
import { fecha, fechaLarga, pesos, plural, relativa } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Expediente, PagoResumen, Pollitanda } from '@/lib/tipos';

interface ExpedienteDetalle extends Expediente {
  notas: string | null;
  createdAt: string;
  pollitanda: { id: number; nombre: string; pollitosPorPaquete: number; precioPaquete: number; anticipoMinimo: number; producto: string };
  pagos: PagoResumen[];
}

function DetallePollitanda() {
  const { id } = useParams<{ id: string }>();
  const parametros = useSearchParams();
  const { puede } = useSesion();
  const { data: t, error, mutate } = useApi<Pollitanda>(`/pollitandas/${id}`);
  const [inscribiendo, setInscribiendo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [expedienteId, setExpedienteId] = useState<number | null>(Number(parametros.get('expediente')) || null);
  const [cobro, setCobro] = useState<PedidoPorCobrar | null>(null);

  if (error && !t) return <ErrorCarga error={error} onReintentar={() => mutate()} />;
  if (!t) return <Cargando filas={8} />;

  const expedientes = t.expedientes ?? [];
  const sinAnticipo = expedientes.filter((e) => e.estado === 'APARTADO').length;
  const abierta = t.estado === 'ABIERTA';
  const cobrar = (e: Expediente) => setCobro({ id: e.pedido.id, folio: e.pedido.folio, saldo: e.saldo, total: e.total, cliente: e.cliente });

  return (
    <div className="entrada space-y-6">
      <div>
        <Link href="/pollitandas" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} strokeWidth={1.6} /> Pollitandas
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Insignia tono={abierta ? 'verde' : 'neutro'} punto>
                {abierta ? 'Abierta' : t.estado === 'CERRADA' ? 'Inscripciones cerradas' : t.estado === 'ENTREGADA' ? 'Entregada' : 'Cancelada'}
              </Insignia>
              {t.preventa && <Insignia tono="ambar">Preventa</Insignia>}
            </div>
            <h1 className="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.05] font-semibold">{t.nombre}</h1>
            <p className="mt-1.5 text-sm text-muted">
              {t.pollitosPorPaquete} × {t.producto?.nombre} · {pesos(t.precioPaquete)} por paquete
              {t.anticipoMinimo > 0 && ` · anticipo mínimo ${pesos(t.anticipoMinimo)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {puede('pollitandas.admin') && (
              <Boton icono={<Pencil size={15} strokeWidth={1.6} />} onClick={() => setEditando(true)}>
                Editar
              </Boton>
            )}
            {puede('pollitandas.inscribir') && abierta && (
              <Boton variante="primario" disabled={t.cupoDisponible <= 0} icono={<UserPlus size={17} strokeWidth={1.7} />} onClick={() => setInscribiendo(true)}>
                {t.cupoDisponible > 0 ? 'Inscribir participante' : 'Cupo lleno'}
              </Boton>
            )}
          </div>
        </header>
      </div>

      {/* Indicadores del programa */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <Tarjeta className="p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Cupo</p>
            <p className="text-xs text-muted">{t.cupoDisponible > 0 ? `quedan ${t.cupoDisponible}` : 'lleno'}</p>
          </div>
          <p className="cifra mt-1 text-3xl font-semibold">
            {t.paquetesVendidos} <span className="text-lg font-normal text-muted">de {t.cupoPaquetes} paquetes</span>
          </p>
          <Progreso className="mt-3" valor={t.paquetesVendidos} total={t.cupoPaquetes} />
          <p className="mt-2.5 text-xs text-muted">
            {t.participantes} participantes · {t.pollitos} {plural(t.producto?.unidad ?? 'pollito', 2)} comprometidos
          </p>
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Cobrado</p>
          <p className="cifra mt-1 text-3xl font-semibold">{pesos(t.cobrado)}</p>
          <Progreso className="mt-3" tono="ok" valor={t.cobrado} total={t.vendido} />
          <p className="mt-2.5 text-xs text-muted">de {pesos(t.vendido)} vendidos</p>
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Por cobrar</p>
          <p className={cx('cifra mt-1 text-3xl font-semibold', t.porCobrar > 0 && 'text-bad')}>{pesos(t.porCobrar)}</p>
          <p className="mt-3 text-xs text-muted">{sinAnticipo > 0 ? `${sinAnticipo} participante${sinAnticipo === 1 ? '' : 's'} sin anticipo` : 'Todos han dado anticipo'}</p>
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Entrega</p>
          <p className="cifra mt-1 text-3xl font-semibold">{fecha(t.fechaEntrega)}</p>
          <p className="mt-3 text-xs text-muted first-letter:uppercase">
            {relativa(t.fechaEntrega)}
            {t.fechaCierre && ` · inscripciones hasta el ${fecha(t.fechaCierre)}`}
          </p>
        </Tarjeta>
      </div>

      {(t.pollitosPorSurtir ?? 0) > 0 && (
        <Aviso tono="ambar" titulo={`Faltan ${t.pollitosPorSurtir} ${plural(t.producto?.unidad ?? 'pollito', 2)} por apartar`}>
          Están vendidos en preventa. Se apartan automáticamente al registrar la entrada del lote en Inventario.
        </Aviso>
      )}

      <Tarjeta className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h3 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Expedientes</h3>
          <span className="text-xs text-muted">Clic en un renglón para ver el expediente</span>
        </div>
        {expedientes.length === 0 ? (
          <Vacio icono={<Bird size={24} strokeWidth={1.5} />} titulo="Aún no hay participantes">
            Inscribe al primero con el botón de arriba.
          </Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Expediente</Th>
                <Th>Participante</Th>
                <Th derecha>Paquetes</Th>
                <Th derecha>Total</Th>
                <Th derecha>Pagado</Th>
                <Th derecha>Saldo</Th>
                <Th>Estado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {expedientes.map((e) => (
                <tr key={e.id} className={cx(filaClic, e.estado === 'CANCELADO' && 'opacity-50')} onClick={() => setExpedienteId(e.id)}>
                  <Td>
                    <Folio>{e.folio}</Folio>
                  </Td>
                  <Td>
                    <p className="font-medium">{e.cliente.nombre}</p>
                    <p className="text-xs text-muted">
                      {e.cantidadPollitos} {plural(t.producto?.unidad ?? 'pollito', 2)}{e.pollitosPorSurtir > 0 && ` · ${e.pollitosPorSurtir} por apartar`}
                    </p>
                  </Td>
                  <Td derecha>{e.paquetes}</Td>
                  <Td derecha>{pesos(e.total)}</Td>
                  <Td derecha>{pesos(e.pagado)}</Td>
                  <Td derecha className={cx('font-medium', e.saldo > 0 ? 'text-bad' : 'text-muted')}>
                    {e.saldo > 0 ? pesos(e.saldo) : '—'}
                  </Td>
                  <Td>
                    <InsigniaExpediente estado={e.estado} />
                  </Td>
                  <Td derecha onClick={(ev) => ev.stopPropagation()}>
                    {e.saldo > 0 && e.estado !== 'CANCELADO' && puede('cobranza.registrar') && (
                      <Boton tamano="sm" icono={<Banknote size={14} strokeWidth={1.6} />} onClick={() => cobrar(e)}>
                        Cobrar
                      </Boton>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <ModalInscripcion
        pollitanda={t}
        abierto={inscribiendo}
        onCerrar={() => setInscribiendo(false)}
        onInscrito={(e) => {
          setInscribiendo(false);
          setExpedienteId(e.id);
        }}
      />
      <ModalPollitanda abierto={editando} onCerrar={() => setEditando(false)} pollitanda={t} />
      <ModalExpediente id={expedienteId} onCerrar={() => setExpedienteId(null)} onCobrar={cobrar} />
      {cobro && <ModalPago pedido={cobro} onCerrar={() => setCobro(null)} />}
    </div>
  );
}

/** Expediente del participante: paquete, pagos, saldo, entrega y estado */
function ModalExpediente({ id, onCerrar, onCobrar }: { id: number | null; onCerrar: () => void; onCobrar: (e: Expediente) => void }) {
  const { puede } = useSesion();
  const aviso = useAviso();
  const { data: e, error } = useApi<ExpedienteDetalle>(id ? `/pollitandas/expedientes/${id}` : null);
  const [baja, setBaja] = useState(false);
  useEffect(() => setBaja(false), [id]);

  if (!id) return null;
  const vigente = e && e.estado !== 'CANCELADO' && e.estado !== 'ENTREGADO';
  const mensaje = e
    ? `Hola ${e.cliente.nombre}, de Avícola San Ángel. Tu participación ${e.folio} en la Pollitanda "${e.pollitanda.nombre}": ${e.cantidadPollitos} aves, pagado ${pesos(e.pagado)}${e.saldo > 0 ? `, saldo ${pesos(e.saldo)}` : ' (liquidado)'}. Entrega: ${fechaLarga(e.fechaEntrega)}.`
    : '';

  return (
    <>
      <Modal abierto={!baja} onCerrar={onCerrar} titulo={e ? e.cliente.nombre : 'Expediente'} descripcion={e ? `Expediente ${e.folio} · inscrito el ${fecha(e.createdAt)}` : undefined} ancho="max-w-xl">
        {error && !e ? (
          <ErrorCarga error={error} />
        ) : !e ? (
          <Cargando filas={4} />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <InsigniaExpediente estado={e.estado} />
              <InsigniaPedido estado={e.pedido.estado} />
              {e.pollitosPorSurtir > 0 && <Insignia tono="ambar">{e.pollitosPorSurtir} por apartar</Insignia>}
            </div>

            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">Pagado</span>
                <span className="text-sm text-muted">Total {pesos(e.total)}</span>
              </div>
              <p className="cifra mt-0.5 text-3xl font-semibold">{pesos(e.pagado)}</p>
              <Progreso className="mt-3" tono="ok" valor={e.pagado} total={e.total} />
              <p className={cx('mt-2 text-sm font-medium', e.saldo > 0 ? 'text-bad' : 'text-ok')}>{e.estado === 'CANCELADO' ? 'Participante dado de baja' : e.saldo > 0 ? `Saldo pendiente: ${pesos(e.saldo)}` : 'Liquidado'}</p>
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dato etiqueta="Paquetes">
                {e.paquetes} × {e.pollitanda.pollitosPorPaquete}
              </Dato>
              <Dato etiqueta="Recibe">{e.cantidadPollitos} aves</Dato>
              <Dato etiqueta="Entrega">
                {fecha(e.fechaEntrega)} <span className="text-xs text-muted">· {relativa(e.fechaEntrega)}</span>
              </Dato>
              <Dato etiqueta="Pedido" className="col-span-2 sm:col-span-3">
                <Link href={`/ventas/${e.pedido.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <Folio>{e.pedido.folio}</Folio> <ExternalLink size={13} strokeWidth={1.6} className="text-muted" />
                </Link>
              </Dato>
            </dl>

            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Pagos</p>
              {e.pagos.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">Sin pagos todavía: el lugar está apartado sin anticipo.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {e.pagos.map((g) => (
                    <li key={g.id} className={cx('flex items-center gap-3 px-4 py-2.5 text-sm', g.cancelado && 'opacity-50')}>
                      <span className="min-w-0 flex-1">
                        <Folio>{g.folio}</Folio> · {METODO[g.metodo]}
                        <span className="block text-xs text-muted">{fecha(g.fecha, { hora: true })}</span>
                      </span>
                      <span className={cx('num font-semibold', g.cancelado && 'line-through')}>{pesos(g.monto)}</span>
                      <Link href={`/recibo/${g.id}`} target="_blank" aria-label="Ver comprobante" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
                        <Printer size={15} strokeWidth={1.5} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              <div className="flex flex-wrap gap-2">
                <BotonWhatsApp telefono={e.cliente.telefono} mensaje={mensaje} tamano="md">
                  Enviar estado
                </BotonWhatsApp>
                {vigente && puede('pollitandas.admin', 'ventas.cancelar') && (
                  <Boton variante="peligro" onClick={() => setBaja(true)}>
                    Dar de baja
                  </Boton>
                )}
              </div>
              {vigente && e.saldo > 0 && puede('cobranza.registrar') && (
                <Boton
                  variante="primario"
                  icono={<Banknote size={16} strokeWidth={1.6} />}
                  onClick={() => {
                    onCerrar();
                    onCobrar(e);
                  }}
                >
                  Registrar pago
                </Boton>
              )}
            </div>
          </div>
        )}
      </Modal>
      <DialogoMotivo
        abierto={baja}
        onCerrar={() => setBaja(false)}
        titulo={`Dar de baja a ${e?.cliente.nombre ?? ''}`}
        descripcion="Se cancela su pedido y se libera su lugar. Si ya tiene pagos, primero hay que cancelarlos en Cobranza."
        accion="Dar de baja"
        onConfirmar={async (motivo) => {
          try {
            await api(`/pollitandas/expedientes/${id}/baja`, { cuerpo: { motivo } });
            await refrescarOperacion();
            aviso.exito('Participante dado de baja');
            setBaja(false);
          } catch (err) {
            aviso.error(mensajeDe(err));
          }
        }}
      />
    </>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Cargando />}>
      <DetallePollitanda />
    </Suspense>
  );
}
