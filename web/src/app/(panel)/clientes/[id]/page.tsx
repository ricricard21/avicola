'use client';

import { ArrowLeft, Check, Footprints, Mail, MapPin, MessageCircle, Pencil, Phone, PhoneCall, Plus, StickyNote } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { BotonWhatsApp, Folio, InsigniaCliente, InsigniaPedido, ModalCliente } from '@/components/negocio';
import { AreaTexto, Boton, BotonEnlace, Campo, Cargando, cx, Dato, Entrada, ErrorCarga, filaClic, Insignia, Pestanas, Selector, Tabla, Tarjeta, Td, Th, TituloTarjeta, useAviso, Vacio } from '@/components/ui';
import { api, mensajeDe, refrescar, useApi } from '@/lib/api';
import { ETAPAS, METODO, SEGUIMIENTO } from '@/lib/etiquetas';
import { fecha, pesos, relativa, telefono } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import { enlace } from '@/lib/transporte';
import type { ClienteDetalle, Seguimiento } from '@/lib/tipos';

const ICONO_SEGUIMIENTO: Record<Seguimiento['tipo'], ReactNode> = {
  LLAMADA: <PhoneCall size={15} strokeWidth={1.5} />,
  WHATSAPP: <MessageCircle size={15} strokeWidth={1.5} />,
  VISITA: <Footprints size={15} strokeWidth={1.5} />,
  NOTA: <StickyNote size={15} strokeWidth={1.5} />,
};

export default function DetalleCliente() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { puede } = useSesion();
  const aviso = useAviso();
  const { data: c, error, mutate } = useApi<ClienteDetalle>(`/clientes/${id}`);
  const [pestana, setPestana] = useState<'pedidos' | 'pagos' | 'pollitandas'>('pedidos');
  const [editando, setEditando] = useState(false);
  const [seg, setSeg] = useState({ tipo: 'LLAMADA' as Seguimiento['tipo'], nota: '', proximaAccion: '' });
  const [guardando, setGuardando] = useState(false);

  if (error && !c) return <ErrorCarga error={error} onReintentar={() => mutate()} />;
  if (!c) return <Cargando filas={8} />;
  const contacto = c.whatsapp || c.telefono;

  async function agregarSeguimiento(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api(`/clientes/${id}/seguimientos`, { cuerpo: { tipo: seg.tipo, nota: seg.nota, proximaAccion: seg.proximaAccion || null } });
      setSeg({ tipo: 'LLAMADA', nota: '', proximaAccion: '' });
      await refrescar('clientes', 'seguimientos', 'dashboard');
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setGuardando(false);
    }
  }

  async function completar(s: Seguimiento) {
    try {
      await api(`/seguimientos/${s.id}`, { metodo: 'PATCH', cuerpo: { completado: !s.completado } });
      await refrescar('clientes', 'seguimientos', 'dashboard');
    } catch (err) {
      aviso.error(mensajeDe(err));
    }
  }

  return (
    <div className="entrada space-y-6">
      <div>
        <Link href="/clientes" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} strokeWidth={1.6} /> Clientes
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <InsigniaCliente tipo={c.tipo} />
              {c.etapa && <Insignia>{ETAPAS[c.etapa]}</Insignia>}
            </div>
            <h1 className="text-[clamp(1.6rem,3vw,2.3rem)] leading-[1.05] font-semibold">{c.nombre}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <BotonWhatsApp telefono={contacto} tamano="md" />
            {puede('clientes.editar') && (
              <Boton icono={<Pencil size={15} strokeWidth={1.6} />} onClick={() => setEditando(true)}>
                Editar
              </Boton>
            )}
            {puede('ventas.crear') && (
              <BotonEnlace href={`/ventas/nuevo?cliente=${c.id}`} variante="primario" icono={<Plus size={17} strokeWidth={1.8} />}>
                Nueva venta
              </BotonEnlace>
            )}
          </div>
        </header>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Comprado', pesos(c.resumen.comprado), false],
              ['Pagado', pesos(c.resumen.pagado), false],
              ['Saldo', pesos(c.resumen.saldo), c.resumen.saldo > 0],
              ['Pedidos', String(c.resumen.pedidos), false],
            ].map(([etiqueta, valor, alerta]) => (
              <Tarjeta key={String(etiqueta)} className="px-4 py-3.5">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{etiqueta}</p>
                <p className={cx('cifra mt-1 text-xl font-semibold', alerta && 'text-bad')}>{valor}</p>
              </Tarjeta>
            ))}
          </div>

          <Tarjeta className="overflow-hidden">
            <div className="p-3">
              <Pestanas
                valor={pestana}
                onCambio={setPestana}
                opciones={[
                  { valor: 'pedidos', etiqueta: 'Pedidos', cuenta: c.pedidos.length },
                  { valor: 'pagos', etiqueta: 'Pagos', cuenta: c.pagos.length },
                  { valor: 'pollitandas', etiqueta: 'Pollitandas', cuenta: c.pollitandas.length },
                ]}
              />
            </div>
            {pestana === 'pedidos' &&
              (c.pedidos.length === 0 ? (
                <Vacio titulo="Sin pedidos todavía" />
              ) : (
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Folio</Th>
                      <Th>Fecha</Th>
                      <Th>Estado</Th>
                      <Th derecha>Total</Th>
                      <Th derecha>Saldo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.pedidos.map((p) => (
                      <tr key={p.id} className={filaClic} onClick={() => router.push(`/ventas/${p.id}`)}>
                        <Td>
                          <Folio>{p.folio}</Folio>
                        </Td>
                        <Td className="whitespace-nowrap text-muted">{fecha(p.createdAt)}</Td>
                        <Td>
                          <InsigniaPedido estado={p.estado} />
                        </Td>
                        <Td derecha>{pesos(p.total)}</Td>
                        <Td derecha className={cx(p.saldo > 0 && p.estado !== 'COTIZACION' && p.estado !== 'CANCELADO' ? 'font-medium text-bad' : 'text-muted')}>
                          {p.saldo > 0 && p.estado !== 'COTIZACION' && p.estado !== 'CANCELADO' ? pesos(p.saldo) : '—'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              ))}
            {pestana === 'pagos' &&
              (c.pagos.length === 0 ? (
                <Vacio titulo="Sin pagos registrados" />
              ) : (
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Recibo</Th>
                      <Th>Fecha</Th>
                      <Th>Pedido</Th>
                      <Th>Forma de pago</Th>
                      <Th derecha>Monto</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.pagos.map((g) => (
                      <tr key={g.id} className={cx(filaClic, g.cancelado && 'opacity-50')} onClick={() => window.open(enlace(`/recibo/${g.id}`), '_blank')}>
                        <Td>
                          <Folio>{g.folio}</Folio>
                          {g.cancelado && <Insignia className="ml-2">Cancelado</Insignia>}
                        </Td>
                        <Td className="whitespace-nowrap text-muted">{fecha(g.fecha, { hora: true })}</Td>
                        <Td>
                          <Folio>{g.pedido!.folio}</Folio>
                        </Td>
                        <Td>{METODO[g.metodo]}</Td>
                        <Td derecha className={cx('font-medium', g.cancelado && 'line-through')}>
                          {pesos(g.monto)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              ))}
            {pestana === 'pollitandas' &&
              (c.pollitandas.length === 0 ? (
                <Vacio titulo="No participa en Pollitandas" />
              ) : (
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Expediente</Th>
                      <Th>Programa</Th>
                      <Th derecha>Pollitos</Th>
                      <Th>Entrega</Th>
                      <Th derecha>Pagado</Th>
                      <Th derecha>Saldo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.pollitandas.map((t) => (
                      <tr key={t.id} className={filaClic} onClick={() => router.push(`/pollitandas/${t.pollitandaId}?expediente=${t.id}`)}>
                        <Td>
                          <Folio>{t.folio}</Folio>
                        </Td>
                        <Td>{t.programa}</Td>
                        <Td derecha>{t.cantidadPollitos}</Td>
                        <Td className="whitespace-nowrap text-muted">{fecha(t.fechaEntrega)}</Td>
                        <Td derecha>{pesos(t.pagado)}</Td>
                        <Td derecha className={cx(t.saldo > 0 && t.estadoPedido !== 'CANCELADO' ? 'font-medium text-bad' : 'text-muted')}>
                          {t.estadoPedido === 'CANCELADO' ? 'Baja' : t.saldo > 0 ? pesos(t.saldo) : 'Liquidado'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              ))}
          </Tarjeta>
        </div>

        <div className="space-y-6">
          <Tarjeta>
            <TituloTarjeta>Datos de contacto</TituloTarjeta>
            <ul className="space-y-3 px-5 pb-5 text-sm">
              <li className="flex items-start gap-3">
                <Phone size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" />
                <span className="num">{contacto ? telefono(contacto) : <span className="text-muted">Sin teléfono</span>}</span>
              </li>
              {c.email && (
                <li className="flex items-start gap-3">
                  <Mail size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" />
                  <a href={`mailto:${c.email}`} className="break-all hover:underline">
                    {c.email}
                  </a>
                </li>
              )}
              <li className="flex items-start gap-3">
                <MapPin size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" />
                <span>{[c.direccion, c.municipio].filter(Boolean).join(', ') || <span className="text-muted">Sin dirección</span>}</span>
              </li>
            </ul>
            <dl className="grid grid-cols-2 gap-4 border-t border-line px-5 py-4">
              <Dato etiqueta="Atiende">{c.vendedor?.nombre ?? '—'}</Dato>
              <Dato etiqueta="Cliente desde">{fecha(c.createdAt, { anio: true })}</Dato>
              {c.rfc && <Dato etiqueta="RFC">{c.rfc}</Dato>}
              {c.origen && <Dato etiqueta="Origen">{c.origen}</Dato>}
              {c.notas && (
                <Dato etiqueta="Notas" className="col-span-2">
                  <span className="whitespace-pre-line text-ink/85">{c.notas}</span>
                </Dato>
              )}
            </dl>
          </Tarjeta>

          <Tarjeta>
            <TituloTarjeta>Seguimiento</TituloTarjeta>
            {puede('clientes.editar') && (
              <form onSubmit={agregarSeguimiento} className="space-y-3 border-b border-line px-5 pb-5">
                <AreaTexto rows={2} required minLength={2} maxLength={2000} placeholder="¿Qué pasó en el contacto?" value={seg.nota} onChange={(e) => setSeg((s) => ({ ...s, nota: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Tipo">
                    <Selector valor={seg.tipo} onCambio={(tipo) => setSeg((s) => ({ ...s, tipo }))} opciones={(Object.keys(SEGUIMIENTO) as Seguimiento['tipo'][]).map((t) => ({ valor: t, etiqueta: SEGUIMIENTO[t] }))} />
                  </Campo>
                  <Campo etiqueta="Volver a contactar" opcional>
                    <Entrada type="date" value={seg.proximaAccion} onChange={(e) => setSeg((s) => ({ ...s, proximaAccion: e.target.value }))} />
                  </Campo>
                </div>
                <Boton type="submit" tamano="sm" cargando={guardando} disabled={seg.nota.trim().length < 2}>
                  Guardar seguimiento
                </Boton>
              </form>
            )}
            {c.seguimientos.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Sin contactos registrados.</p>
            ) : (
              <ol className="relative space-y-5 px-5 py-5 before:absolute before:top-7 before:bottom-7 before:left-[2.2rem] before:w-px before:bg-line">
                {c.seguimientos.map((s) => {
                  const pendiente = !!s.proximaAccion && !s.completado;
                  return (
                    <li key={s.id} className="relative flex gap-3">
                      <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted">{ICONO_SEGUIMIENTO[s.tipo]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted">
                          {SEGUIMIENTO[s.tipo]} · {fecha(s.createdAt, { hora: true })}
                          {s.usuario && ` · ${s.usuario.nombre.split(' ')[0]}`}
                        </p>
                        <p className="mt-0.5 text-sm whitespace-pre-line">{s.nota}</p>
                        {s.proximaAccion && (
                          <button
                            onClick={() => completar(s)}
                            disabled={!puede('clientes.editar')}
                            className={cx('tono mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80', pendiente ? 'tono-ambar' : 'tono-verde')}
                            title={pendiente ? 'Marcar como atendido' : 'Marcar como pendiente'}
                          >
                            <Check size={12} strokeWidth={2} />
                            {pendiente ? `Volver a contactar ${relativa(s.proximaAccion)}` : 'Atendido'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Tarjeta>
        </div>
      </div>

      <ModalCliente abierto={editando} onCerrar={() => setEditando(false)} cliente={c} />
    </div>
  );
}
