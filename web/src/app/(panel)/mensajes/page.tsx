'use client';

import { BellRing, Check, MessageCircle, Send, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SelectorCliente } from '@/components/negocio';
import { SinPermiso } from '@/components/shell';
import { AreaTexto, Aviso, Boton, Campo, Cargando, cx, Encabezado, ErrorCarga, Insignia, Modal, Paginacion, PieModal, Pestanas, Tarjeta, useAviso, Vacio } from '@/components/ui';
import { api, mensajeDe, refrescar, useApi } from '@/lib/api';
import { PLANTILLA } from '@/lib/etiquetas';
import { enlaceWhatsApp, fecha, telefono } from '@/lib/formato';
import { conParametros } from '@/lib/hooks';
import { useSesion } from '@/lib/sesion';
import type { Notificacion, Pagina } from '@/lib/tipos';

type Estado = Notificacion['estado'];
type Bandeja = Pagina<Notificacion> & { conteo: Partial<Record<Estado, number>>; envioAutomatico: boolean };

export default function Mensajes() {
  const { puede } = useSesion();
  const aviso = useAviso();
  const ver = puede('mensajes.ver');
  const enviar = puede('mensajes.enviar');
  const [estado, setEstado] = useState<Estado>('PENDIENTE');
  const [pagina, setPagina] = useState(1);
  const [ocupado, setOcupado] = useState<number | 'recordatorios' | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const { data, error, mutate } = useApi<Bandeja>(ver ? conParametros('/notificaciones', { estado, pagina }) : null);
  if (!ver) return <SinPermiso />;

  async function marcar(n: Notificacion, nuevoEstado: Estado) {
    setOcupado(n.id);
    try {
      await api(`/notificaciones/${n.id}/estado`, { cuerpo: { estado: nuevoEstado } });
      await refrescar('notificaciones');
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setOcupado(null);
    }
  }

  async function generar() {
    setOcupado('recordatorios');
    try {
      const r = await api<Record<string, number>>('/notificaciones/recordatorios', { cuerpo: {} });
      const total = Object.values(r).reduce((s, n) => s + n, 0);
      await refrescar('notificaciones');
      aviso.exito(total ? `Se generaron ${total} recordatorios` : 'No hay recordatorios nuevos por generar');
      setEstado('PENDIENTE');
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Mensajes" descripcion="Avisos de WhatsApp que el sistema prepara solo: confirmaciones, pagos, entregas y recordatorios.">
        {enviar && (
          <>
            <Boton icono={<BellRing size={16} strokeWidth={1.6} />} cargando={ocupado === 'recordatorios'} onClick={generar}>
              Generar recordatorios
            </Boton>
            <Boton variante="primario" icono={<MessageCircle size={16} strokeWidth={1.7} />} onClick={() => setNuevo(true)}>
              Nuevo mensaje
            </Boton>
          </>
        )}
      </Encabezado>

      {data && !data.envioAutomatico && (
        <Aviso tono="azul" titulo="Envío con un clic">
          La API oficial de WhatsApp aún no está conectada. Mientras tanto, cada mensaje se abre en WhatsApp ya escrito: solo presiona enviar. Los recordatorios se generan solos todos los días a las 9:00 am.
        </Aviso>
      )}

      <Pestanas
        className="w-fit"
        valor={estado}
        onCambio={(e) => {
          setEstado(e);
          setPagina(1);
        }}
        opciones={[
          { valor: 'PENDIENTE', etiqueta: 'Por enviar', cuenta: data?.conteo.PENDIENTE ?? 0 },
          { valor: 'ENVIADA', etiqueta: 'Enviados' },
          { valor: 'DESCARTADA', etiqueta: 'Descartados' },
          ...(data?.conteo.FALLIDA ? [{ valor: 'FALLIDA' as const, etiqueta: 'Con error', cuenta: data.conteo.FALLIDA }] : []),
        ]}
      />

      {error && !data ? (
        <ErrorCarga error={error} onReintentar={() => mutate()} />
      ) : !data ? (
        <Cargando />
      ) : data.datos.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<Check size={24} strokeWidth={1.5} />} titulo={estado === 'PENDIENTE' ? 'Bandeja al día' : 'Sin mensajes'}>
            {estado === 'PENDIENTE' && 'No hay mensajes pendientes de envío.'}
          </Vacio>
        </Tarjeta>
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {data.datos.map((n) => {
              const enlace = enlaceWhatsApp(n.destinatario, n.mensaje);
              return (
                <li key={n.id}>
                  <Tarjeta className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {n.cliente ? (
                          <Link href={`/clientes/${n.cliente.id}`} className="block truncate font-medium hover:underline">
                            {n.cliente.nombre}
                          </Link>
                        ) : (
                          <p className="font-medium">Cliente eliminado</p>
                        )}
                        <p className="num text-xs text-muted">
                          {telefono(n.destinatario)} · {fecha(n.createdAt, { hora: true })}
                        </p>
                      </div>
                      <Insignia tono={n.plantilla.startsWith('recordatorio') ? 'ambar' : 'neutro'}>{PLANTILLA[n.plantilla] ?? n.plantilla}</Insignia>
                    </div>

                    {/* Burbuja del mensaje */}
                    <p className="mt-4 flex-1 rounded-2xl rounded-tl-md bg-surface-2 px-4 py-3 text-sm leading-relaxed whitespace-pre-line">{n.mensaje}</p>
                    {n.error && <p className="mt-2 text-xs text-bad">{n.error}</p>}

                    {enviar && (
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        {n.estado === 'PENDIENTE' || n.estado === 'FALLIDA' ? (
                          <>
                            <Boton tamano="sm" variante="fantasma" icono={<X size={14} strokeWidth={1.7} />} disabled={ocupado === n.id} onClick={() => marcar(n, 'DESCARTADA')}>
                              Descartar
                            </Boton>
                            {enlace && (
                              <a
                                href={enlace}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => void marcar(n, 'ENVIADA')}
                                className={cx('inline-flex h-8 items-center gap-2 rounded-xl bg-accent px-3.5 text-[13px] font-semibold text-accent-ink transition-all hover:shadow-glow', ocupado === n.id && 'pointer-events-none opacity-50')}
                              >
                                <Send size={14} strokeWidth={1.8} /> Enviar por WhatsApp
                              </a>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="mr-auto text-xs text-muted">{n.estado === 'ENVIADA' ? `Enviado ${fecha(n.enviadaAt, { hora: true })}` : 'Descartado'}</span>
                            <Boton tamano="sm" variante="fantasma" icono={<Undo2 size={14} strokeWidth={1.6} />} disabled={ocupado === n.id} onClick={() => marcar(n, 'PENDIENTE')}>
                              Regresar a pendientes
                            </Boton>
                          </>
                        )}
                      </div>
                    )}
                  </Tarjeta>
                </li>
              );
            })}
          </ul>
          <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambio={setPagina} />
        </>
      )}

      <ModalMensaje abierto={nuevo} onCerrar={() => setNuevo(false)} />
    </div>
  );
}

function ModalMensaje({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const aviso = useAviso();
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nuevo mensaje" descripcion="Queda en la bandeja para enviarse por WhatsApp." ancho="max-w-md">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          try {
            await api('/notificaciones', { cuerpo: { clienteId, mensaje } });
            await refrescar('notificaciones');
            aviso.exito('Mensaje agregado a la bandeja');
            setMensaje('');
            setClienteId(null);
            onCerrar();
          } catch (err) {
            aviso.error(mensajeDe(err));
          } finally {
            setEnviando(false);
          }
        }}
      >
        <Campo etiqueta="Cliente">
          <SelectorCliente valor={clienteId} onCambio={setClienteId} />
        </Campo>
        <Campo etiqueta="Mensaje">
          <AreaTexto rows={5} required minLength={3} maxLength={1000} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
        </Campo>
        <PieModal>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={enviando} disabled={!clienteId || mensaje.trim().length < 3}>
            Agregar a la bandeja
          </Boton>
        </PieModal>
      </form>
    </Modal>
  );
}
