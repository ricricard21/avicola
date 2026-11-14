'use client';

import { MessageCircle, Printer, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, mensajeDe, refrescar, refrescarOperacion, useApi } from '@/lib/api';
import { ESTADO_EXPEDIENTE, ESTADO_PEDIDO, ETAPAS, METODO, TIPO_CLIENTE } from '@/lib/etiquetas';
import { enlaceWhatsApp, pesos } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Cliente, EstadoExpediente, EstadoPedido, MetodoPago, Pagina, TipoCliente } from '@/lib/tipos';
import { AreaTexto, Boton, Campo, cx, Entrada, Insignia, Modal, PieModal, Selector, useAviso } from './ui';

export function InsigniaPedido({ estado }: { estado: EstadoPedido }) {
  const e = ESTADO_PEDIDO[estado];
  return (
    <Insignia tono={e.tono} punto>
      {e.nombre}
    </Insignia>
  );
}

export function InsigniaExpediente({ estado }: { estado: EstadoExpediente }) {
  const e = ESTADO_EXPEDIENTE[estado];
  return (
    <Insignia tono={e.tono} punto>
      {e.nombre}
    </Insignia>
  );
}

export function InsigniaCliente({ tipo }: { tipo: TipoCliente }) {
  return <Insignia tono={TIPO_CLIENTE[tipo].tono}>{TIPO_CLIENTE[tipo].nombre}</Insignia>;
}

export function Folio({ children, className }: { children: string; className?: string }) {
  return <span className={cx('folio', className)}>{children}</span>;
}

/** Botón que abre WhatsApp con el mensaje escrito */
export function BotonWhatsApp({ telefono, mensaje, children = 'WhatsApp', tamano = 'sm' }: { telefono: string | null | undefined; mensaje?: string; children?: React.ReactNode; tamano?: 'sm' | 'md' }) {
  const enlace = enlaceWhatsApp(telefono, mensaje);
  if (!enlace) return null;
  return (
    <a href={enlace} target="_blank" rel="noreferrer" className={cx('inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 whitespace-nowrap transition-colors hover:bg-surface-3', tamano === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm')}>
      <MessageCircle size={15} strokeWidth={1.6} />
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Selector de cliente con alta rápida                                */
/* ------------------------------------------------------------------ */

export function SelectorCliente({ valor, onCambio }: { valor: number | null; onCambio: (id: number) => void }) {
  const { puede } = useSesion();
  const { data } = useApi<Pagina<Cliente>>('/clientes?porPagina=200');
  const [nuevo, setNuevo] = useState(false);
  const opciones = useMemo(
    () => (data?.datos ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre, detalle: [TIPO_CLIENTE[c.tipo].nombre, c.whatsapp || c.telefono].filter(Boolean).join(' · ') })),
    [data],
  );
  return (
    <div className="flex gap-2">
      <Selector className="min-w-0 flex-1" valor={valor} onCambio={onCambio} opciones={opciones} buscable placeholder={data ? 'Buscar cliente…' : 'Cargando clientes…'} />
      {puede('clientes.editar') && (
        <Boton onClick={() => setNuevo(true)} icono={<UserPlus size={16} strokeWidth={1.6} />} aria-label="Nuevo cliente" title="Nuevo cliente" className="px-3" />
      )}
      <ModalCliente
        abierto={nuevo}
        onCerrar={() => setNuevo(false)}
        onGuardado={(c) => {
          setNuevo(false);
          onCambio(c.id);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Alta y edición de cliente                                          */
/* ------------------------------------------------------------------ */

const CLIENTE_VACIO = { nombre: '', tipo: 'CLIENTE' as TipoCliente, telefono: '', whatsapp: '', email: '', direccion: '', municipio: '', rfc: '', etapa: 'NUEVO', origen: '', notas: '' };

export function ModalCliente({ abierto, onCerrar, cliente, onGuardado }: { abierto: boolean; onCerrar: () => void; cliente?: Cliente | null; onGuardado?: (c: Cliente) => void }) {
  const aviso = useAviso();
  const [f, setF] = useState(CLIENTE_VACIO);
  const [enviando, setEnviando] = useState(false);
  const campo = <K extends keyof typeof CLIENTE_VACIO>(k: K) => ({ value: f[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value })) });

  useEffect(() => {
    if (!abierto) return;
    setF(
      cliente
        ? {
            nombre: cliente.nombre,
            tipo: cliente.tipo,
            telefono: cliente.telefono ?? '',
            whatsapp: cliente.whatsapp ?? '',
            email: cliente.email ?? '',
            direccion: cliente.direccion ?? '',
            municipio: cliente.municipio ?? '',
            rfc: cliente.rfc ?? '',
            etapa: cliente.etapa ?? 'NUEVO',
            origen: cliente.origen ?? '',
            notas: cliente.notas ?? '',
          }
        : CLIENTE_VACIO,
    );
    // Se carga al abrir; una actualización de datos en segundo plano no debe borrar lo que se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cliente?.id]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      // Si solo capturan un número, se usa también para WhatsApp.
      const cuerpo = { ...f, whatsapp: f.whatsapp || f.telefono, etapa: f.tipo === 'PROSPECTO' ? f.etapa : null };
      const guardado = await api<Cliente>(cliente ? `/clientes/${cliente.id}` : '/clientes', { metodo: cliente ? 'PATCH' : 'POST', cuerpo });
      await refrescar('clientes', 'dashboard');
      aviso.exito(cliente ? 'Cliente actualizado' : `${guardado.nombre} quedó registrado`);
      onGuardado?.(guardado);
      if (!onGuardado) onCerrar();
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'} ancho="max-w-2xl">
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre o razón social" className="sm:col-span-2">
          <Entrada autoFocus required minLength={2} maxLength={160} {...campo('nombre')} />
        </Campo>
        <Campo etiqueta="Tipo">
          <Selector valor={f.tipo} onCambio={(tipo) => setF((x) => ({ ...x, tipo }))} opciones={(Object.keys(TIPO_CLIENTE) as TipoCliente[]).map((t) => ({ valor: t, etiqueta: TIPO_CLIENTE[t].nombre }))} />
        </Campo>
        {f.tipo === 'PROSPECTO' ? (
          <Campo etiqueta="Etapa">
            <Selector valor={f.etapa} onCambio={(etapa) => setF((x) => ({ ...x, etapa }))} opciones={Object.entries(ETAPAS).map(([valor, etiqueta]) => ({ valor, etiqueta }))} />
          </Campo>
        ) : (
          <Campo etiqueta="RFC" opcional>
            <Entrada maxLength={13} {...campo('rfc')} />
          </Campo>
        )}
        <Campo etiqueta="Teléfono" opcional>
          <Entrada type="tel" inputMode="tel" maxLength={30} placeholder="10 dígitos" {...campo('telefono')} />
        </Campo>
        <Campo etiqueta="WhatsApp" opcional ayuda="Si lo dejas vacío se usa el teléfono">
          <Entrada type="tel" inputMode="tel" maxLength={30} {...campo('whatsapp')} />
        </Campo>
        <Campo etiqueta="Dirección" opcional className="sm:col-span-2">
          <Entrada maxLength={240} {...campo('direccion')} />
        </Campo>
        <Campo etiqueta="Municipio o localidad" opcional>
          <Entrada maxLength={120} {...campo('municipio')} />
        </Campo>
        <Campo etiqueta="Correo" opcional>
          <Entrada type="email" maxLength={160} {...campo('email')} />
        </Campo>
        <Campo etiqueta="¿Cómo llegó?" opcional>
          <Entrada maxLength={60} placeholder="Recomendación, Facebook, mostrador…" {...campo('origen')} />
        </Campo>
        <Campo etiqueta="Notas" opcional className="sm:col-span-2">
          <AreaTexto maxLength={2000} {...campo('notas')} />
        </Campo>
        <div className="sm:col-span-2">
          <PieModal>
            <Boton variante="fantasma" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" cargando={enviando}>
              {cliente ? 'Guardar cambios' : 'Registrar cliente'}
            </Boton>
          </PieModal>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Registro de pago                                                   */
/* ------------------------------------------------------------------ */

export interface PedidoPorCobrar {
  id: number;
  folio: string;
  saldo: number;
  total: number;
  cliente?: { nombre: string } | string;
}

export function ModalPago({ pedido, onCerrar }: { pedido: PedidoPorCobrar | null; onCerrar: () => void }) {
  const aviso = useAviso();
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recibo, setRecibo] = useState<{ id: number; folio: string; saldoPedido: number } | null>(null);

  useEffect(() => {
    if (!pedido) return;
    setMonto(String(pedido.saldo));
    setMetodo('EFECTIVO');
    setReferencia('');
    setRecibo(null);
    // Solo al abrir otro pedido: los datos se refrescan tras cobrar y no deben borrar el comprobante en pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.id]);

  if (!pedido) return null;
  const valor = Number(monto);
  const excede = valor > pedido.saldo + 0.001;
  const nombreCliente = typeof pedido.cliente === 'string' ? pedido.cliente : pedido.cliente?.nombre;

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api<{ id: number; folio: string; saldoPedido: number }>('/pagos', { cuerpo: { pedidoId: pedido!.id, monto: valor, metodo, referencia: referencia.trim() || undefined } });
      await refrescarOperacion();
      setRecibo(r);
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  if (recibo) {
    return (
      <Modal abierto onCerrar={onCerrar} titulo="Pago registrado" ancho="max-w-sm">
        <div className="rounded-2xl bg-surface-2 p-5 text-center">
          <p className="folio text-muted">{recibo.folio}</p>
          <p className="cifra mt-1 text-4xl font-semibold">{pesos(valor)}</p>
          <p className="mt-2 text-sm text-muted">{recibo.saldoPedido > 0 ? `Saldo pendiente: ${pesos(recibo.saldoPedido)}` : 'El pedido quedó liquidado'}</p>
        </div>
        <PieModal>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cerrar
          </Boton>
          <Link href={`/recibo/${recibo.id}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition-all hover:shadow-glow">
            <Printer size={16} strokeWidth={1.6} /> Ver comprobante
          </Link>
        </PieModal>
      </Modal>
    );
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Registrar pago" descripcion={`${pedido.folio}${nombreCliente ? ` · ${nombreCliente}` : ''}`} ancho="max-w-md">
      <form onSubmit={registrar} className="space-y-4">
        <div className="flex items-baseline justify-between rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-sm text-muted">Saldo pendiente</span>
          <span className="cifra text-2xl font-semibold">{pesos(pedido.saldo)}</span>
        </div>
        <Campo etiqueta="Monto recibido" ayuda={excede ? <span className="text-bad">El monto no puede ser mayor al saldo</span> : undefined}>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">$</span>
            <Entrada autoFocus type="number" inputMode="decimal" step="0.01" min="0.01" required value={monto} onChange={(e) => setMonto(e.target.value)} className="num h-12 pl-8 text-lg font-semibold" />
          </div>
        </Campo>
        <div className="flex flex-wrap gap-2">
          {[1, 0.5].map((parte) => (
            <button key={parte} type="button" onClick={() => setMonto(String(Math.round(pedido.saldo * parte * 100) / 100))} className="rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink">
              {parte === 1 ? 'Liquidar todo' : 'La mitad'}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Forma de pago">
            <Selector valor={metodo} onCambio={setMetodo} opciones={(Object.keys(METODO) as MetodoPago[]).map((m) => ({ valor: m, etiqueta: METODO[m] }))} />
          </Campo>
          <Campo etiqueta="Referencia" opcional>
            <Entrada value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={80} placeholder="Folio de transferencia" />
          </Campo>
        </div>
        <PieModal>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={enviando} disabled={!(valor > 0) || excede}>
            Registrar {valor > 0 ? pesos(valor) : 'pago'}
          </Boton>
        </PieModal>
      </form>
    </Modal>
  );
}
