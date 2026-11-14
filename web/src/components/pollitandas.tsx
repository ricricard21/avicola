'use client';

import { Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, mensajeDe, refrescarOperacion, useApi } from '@/lib/api';
import { METODO } from '@/lib/etiquetas';
import { fecha, hoy, pesos, plural, sumarDias } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Expediente, MetodoPago, Pollitanda, Producto, Sucursal } from '@/lib/tipos';
import { SelectorCliente } from './negocio';
import { AreaTexto, Aviso, Boton, Campo, cx, Entrada, Modal, PieModal, Selector, useAviso } from './ui';

/* ------------------------------------------------------------------ */
/*  Alta y edición de programa                                         */
/* ------------------------------------------------------------------ */

const VACIA = { nombre: '', descripcion: '', productoId: null as number | null, sucursalId: null as number | null, pollitosPorPaquete: '20', precioPaquete: '', anticipoMinimo: '', cupoPaquetes: '', fechaCierre: '', fechaEntrega: '', preventa: true, estado: 'ABIERTA' as Pollitanda['estado'] };

export function ModalPollitanda({ abierto, onCerrar, pollitanda }: { abierto: boolean; onCerrar: () => void; pollitanda?: Pollitanda | null }) {
  const aviso = useAviso();
  const router = useRouter();
  const { usuario } = useSesion();
  const { data: productos } = useApi<Producto[]>(abierto ? '/productos' : null);
  const { data: sucursales } = useApi<Sucursal[]>(abierto && !usuario.sucursalId && !pollitanda ? '/sucursales' : null);
  const [f, setF] = useState(VACIA);
  const [enviando, setEnviando] = useState(false);
  const texto = (k: 'nombre' | 'descripcion' | 'pollitosPorPaquete' | 'precioPaquete' | 'anticipoMinimo' | 'cupoPaquetes' | 'fechaCierre' | 'fechaEntrega') => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value })),
  });

  useEffect(() => {
    if (!abierto) return;
    setF(
      pollitanda
        ? {
            nombre: pollitanda.nombre,
            descripcion: pollitanda.descripcion ?? '',
            productoId: pollitanda.productoId,
            sucursalId: null,
            pollitosPorPaquete: String(pollitanda.pollitosPorPaquete),
            precioPaquete: String(pollitanda.precioPaquete),
            anticipoMinimo: String(pollitanda.anticipoMinimo || ''),
            cupoPaquetes: String(pollitanda.cupoPaquetes),
            fechaCierre: pollitanda.fechaCierre ?? '',
            fechaEntrega: pollitanda.fechaEntrega,
            preventa: pollitanda.preventa,
            estado: pollitanda.estado,
          }
        : { ...VACIA, fechaEntrega: sumarDias(hoy(), 21) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pollitanda?.id]);

  const conInscritos = (pollitanda?.participantes ?? 0) > 0 || (pollitanda?.expedientes?.length ?? 0) > 0;
  const aves = (productos ?? []).filter((p) => p.categoria === 'POLLITO' || p.categoria === 'AVE');
  const activas = (sucursales ?? []).filter((s) => s.activa);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.productoId) return aviso.error('Elige el producto del paquete');
    setEnviando(true);
    try {
      const cuerpo = {
        nombre: f.nombre,
        descripcion: f.descripcion || null,
        productoId: f.productoId,
        ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}),
        pollitosPorPaquete: Number(f.pollitosPorPaquete),
        precioPaquete: Number(f.precioPaquete),
        anticipoMinimo: Number(f.anticipoMinimo) || 0,
        cupoPaquetes: Number(f.cupoPaquetes),
        fechaCierre: f.fechaCierre || null,
        fechaEntrega: f.fechaEntrega,
        preventa: f.preventa,
        ...(pollitanda ? { estado: f.estado } : {}),
      };
      const guardada = await api<Pollitanda>(pollitanda ? `/pollitandas/${pollitanda.id}` : '/pollitandas', { metodo: pollitanda ? 'PATCH' : 'POST', cuerpo });
      await refrescarOperacion();
      aviso.exito(pollitanda ? 'Pollitanda actualizada' : 'Pollitanda creada');
      onCerrar();
      if (!pollitanda) router.push(`/pollitandas/${guardada.id}`);
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={pollitanda ? 'Editar Pollitanda' : 'Nueva Pollitanda'} ancho="max-w-2xl">
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre del programa" className="sm:col-span-2">
          <Entrada autoFocus required minLength={3} maxLength={120} placeholder="Pollitanda de Engorda · Diciembre" {...texto('nombre')} />
        </Campo>
        <Campo etiqueta="Producto del paquete" className="sm:col-span-2" ayuda={conInscritos ? 'Con participantes inscritos ya no se puede cambiar el producto, el tamaño ni el precio.' : undefined}>
          <Selector deshabilitado={conInscritos} valor={f.productoId} onCambio={(productoId) => setF((x) => ({ ...x, productoId }))} opciones={aves.map((p) => ({ valor: p.id, etiqueta: p.nombre, detalle: `${pesos(p.precio)} por ${p.unidad} en lista` }))} placeholder="Elegir pollito o ave…" />
        </Campo>
        <Campo etiqueta="Aves por paquete">
          <Entrada type="number" min={1} step={1} required disabled={conInscritos} {...texto('pollitosPorPaquete')} />
        </Campo>
        <Campo etiqueta="Precio del paquete">
          <Entrada type="number" min={0.01} step="0.01" required disabled={conInscritos} placeholder="350" {...texto('precioPaquete')} />
        </Campo>
        <Campo etiqueta="Anticipo mínimo por paquete" opcional>
          <Entrada type="number" min={0} step="0.01" placeholder="100" {...texto('anticipoMinimo')} />
        </Campo>
        <Campo etiqueta="Cupo (paquetes)">
          <Entrada type="number" min={1} step={1} required placeholder="40" {...texto('cupoPaquetes')} />
        </Campo>
        <Campo etiqueta="Cierre de inscripciones" opcional>
          <Entrada type="date" max={f.fechaEntrega || undefined} {...texto('fechaCierre')} />
        </Campo>
        <Campo etiqueta="Fecha de entrega">
          <Entrada type="date" required {...texto('fechaEntrega')} />
        </Campo>
        {activas.length > 1 && (
          <Campo etiqueta="Sucursal que entrega" className="sm:col-span-2">
            <Selector valor={f.sucursalId ?? activas[0].id} onCambio={(sucursalId) => setF((x) => ({ ...x, sucursalId }))} opciones={activas.map((s) => ({ valor: s.id, etiqueta: s.nombre }))} />
          </Campo>
        )}
        {pollitanda && (
          <Campo etiqueta="Estado">
            <Selector
              valor={f.estado}
              onCambio={(estado) => setF((x) => ({ ...x, estado }))}
              opciones={[
                { valor: 'ABIERTA', etiqueta: 'Abierta' },
                { valor: 'CERRADA', etiqueta: 'Inscripciones cerradas' },
                { valor: 'ENTREGADA', etiqueta: 'Entregada' },
                { valor: 'CANCELADA', etiqueta: 'Cancelada' },
              ]}
            />
          </Campo>
        )}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4 sm:col-span-2">
          <input type="checkbox" checked={f.preventa} onChange={(e) => setF((x) => ({ ...x, preventa: e.target.checked }))} className="mt-0.5 size-4 accent-(--accent)" />
          <span className="text-sm">
            <span className="font-medium">Venta anticipada (preventa)</span>
            <span className="block text-muted">Permite inscribir aunque las aves aún no estén en inventario. Se apartan solas cuando se registre la entrada del lote.</span>
          </span>
        </label>
        <Campo etiqueta="Descripción" opcional className="sm:col-span-2">
          <AreaTexto rows={2} maxLength={2000} {...texto('descripcion')} />
        </Campo>
        <div className="sm:col-span-2">
          <PieModal>
            <Boton variante="fantasma" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" cargando={enviando}>
              {pollitanda ? 'Guardar cambios' : 'Crear Pollitanda'}
            </Boton>
          </PieModal>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Inscripción de participante                                        */
/* ------------------------------------------------------------------ */

export function ModalInscripcion({ pollitanda, abierto, onCerrar, onInscrito }: { pollitanda: Pollitanda; abierto: boolean; onCerrar: () => void; onInscrito: (e: Expediente) => void }) {
  const aviso = useAviso();
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [paquetes, setPaquetes] = useState(1);
  const [anticipo, setAnticipo] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setClienteId(null);
    setPaquetes(1);
    setAnticipo(pollitanda.anticipoMinimo ? String(pollitanda.anticipoMinimo) : '');
    setMetodo('EFECTIVO');
    setReferencia('');
  }, [abierto, pollitanda.anticipoMinimo]);

  const total = Math.round(paquetes * pollitanda.precioPaquete * 100) / 100;
  const minimo = Math.round(paquetes * pollitanda.anticipoMinimo * 100) / 100;
  const anticipoNum = Number(anticipo) || 0;
  const anticipoBajo = anticipoNum > 0 && anticipoNum < minimo;
  const anticipoAlto = anticipoNum > total;
  const maximo = Math.max(1, pollitanda.cupoDisponible);

  const cambiarPaquetes = (n: number) => {
    const nuevo = Math.min(maximo, Math.max(1, n));
    // Si el anticipo era exactamente el mínimo, se ajusta junto con los paquetes.
    if (anticipoNum === minimo && pollitanda.anticipoMinimo > 0) setAnticipo(String(Math.round(nuevo * pollitanda.anticipoMinimo * 100) / 100));
    setPaquetes(nuevo);
  };

  async function inscribir(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) return aviso.error('Elige al participante');
    setEnviando(true);
    try {
      const expediente = await api<Expediente>(`/pollitandas/${pollitanda.id}/inscripciones`, {
        cuerpo: { clienteId, paquetes, ...(anticipoNum > 0 ? { anticipo: { monto: anticipoNum, metodo, referencia: referencia.trim() || undefined } } : {}) },
      });
      await refrescarOperacion();
      aviso.exito(`${expediente.cliente.nombre} quedó inscrito · ${expediente.folio}`);
      onInscrito(expediente);
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Inscribir participante" descripcion={`${pollitanda.nombre} · entrega ${fecha(pollitanda.fechaEntrega)}`} ancho="max-w-lg">
      <form onSubmit={inscribir} className="space-y-5">
        <Campo etiqueta="Participante">
          <SelectorCliente valor={clienteId} onCambio={setClienteId} />
        </Campo>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line p-4">
          <div>
            <p className="text-sm font-medium">Paquetes</p>
            <p className="text-xs text-muted">
              {pollitanda.pollitosPorPaquete} por paquete · quedan {pollitanda.cupoDisponible}
            </p>
          </div>
          <div className="flex items-center rounded-xl border border-line bg-surface">
            <button type="button" aria-label="Menos paquetes" onClick={() => cambiarPaquetes(paquetes - 1)} className="grid size-10 place-items-center text-muted hover:text-ink">
              <Minus size={16} strokeWidth={1.7} />
            </button>
            <span className="cifra w-10 text-center text-xl font-semibold">{paquetes}</span>
            <button type="button" aria-label="Más paquetes" onClick={() => cambiarPaquetes(paquetes + 1)} disabled={paquetes >= maximo} className="grid size-10 place-items-center text-muted hover:text-ink disabled:opacity-30">
              <Plus size={16} strokeWidth={1.7} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-center">
          <div className="bg-surface-2 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Recibe</p>
            <p className="cifra mt-0.5 text-2xl font-semibold">{paquetes * pollitanda.pollitosPorPaquete}</p>
            <p className="text-xs text-muted">{plural(pollitanda.producto?.unidad ?? 'pollito', 2)}</p>
          </div>
          <div className="bg-surface-2 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Total</p>
            <p className="cifra mt-0.5 text-2xl font-semibold">{pesos(total)}</p>
            <p className="text-xs text-muted">saldo {pesos(Math.max(0, total - anticipoNum))}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
          <Campo
            etiqueta="Anticipo que entrega hoy"
            ayuda={
              anticipoBajo ? (
                <span className="text-bad">El mínimo es {pesos(minimo)}</span>
              ) : anticipoAlto ? (
                <span className="text-bad">No puede ser mayor al total</span>
              ) : minimo > 0 ? (
                `Mínimo ${pesos(minimo)}. Déjalo en 0 para solo apartar.`
              ) : (
                'Déjalo en 0 para solo apartar.'
              )
            }
          >
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">$</span>
              <Entrada type="number" inputMode="decimal" min={0} step="0.01" value={anticipo} onChange={(e) => setAnticipo(e.target.value)} placeholder="0" className={cx('num pl-8 font-semibold')} />
            </div>
          </Campo>
          <Campo etiqueta="Forma de pago">
            <Selector deshabilitado={anticipoNum <= 0} valor={metodo} onCambio={setMetodo} opciones={(Object.keys(METODO) as MetodoPago[]).map((m) => ({ valor: m, etiqueta: METODO[m] }))} />
          </Campo>
          {anticipoNum > 0 && metodo !== 'EFECTIVO' && (
            <Campo etiqueta="Referencia" opcional className="sm:col-span-2">
              <Entrada value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={80} placeholder="Folio de transferencia o depósito" />
            </Campo>
          )}
        </div>

        {pollitanda.preventa && <Aviso tono="ambar">Programa en preventa: las aves se apartan cuando se registre la entrada del lote.</Aviso>}

        <PieModal>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={enviando} disabled={!clienteId || anticipoBajo || anticipoAlto}>
            Inscribir{anticipoNum > 0 ? ` y cobrar ${pesos(anticipoNum)}` : ' sin anticipo'}
          </Boton>
        </PieModal>
      </form>
    </Modal>
  );
}
