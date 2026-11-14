'use client';

import { Egg, Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Boton, Cargando, ErrorCarga } from '@/components/ui';
import { useApi } from '@/lib/api';
import { METODO } from '@/lib/etiquetas';
import { fecha, pesos, telefono } from '@/lib/formato';
import { ProveedorSesion } from '@/lib/sesion';
import type { MetodoPago } from '@/lib/tipos';

interface Recibo {
  id: number;
  folio: string;
  fecha: string;
  monto: number;
  metodo: MetodoPago;
  referencia: string | null;
  notas: string | null;
  cancelado: boolean;
  motivoCancelacion: string | null;
  recibio: string | null;
  cliente: { id: number; nombre: string; telefono: string | null; direccion: string | null };
  pedido: { id: number; folio: string; total: number; sucursal: string };
  pollitanda: { folio: string; programa: string } | null;
  acumulado: number;
  saldoDespues: number;
}

function Comprobante() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error } = useApi<Recibo>(`/pagos/${id}`);
  if (error && !r) return <ErrorCarga error={error} />;
  if (!r) return <Cargando />;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="no-imprimir mb-5 flex items-center justify-between">
        <p className="text-sm text-muted">Comprobante interno de pago</p>
        <Boton variante="primario" icono={<Printer size={16} strokeWidth={1.6} />} onClick={() => window.print()}>
          Imprimir o guardar PDF
        </Boton>
      </div>

      {/* El recibo usa colores fijos (papel) para verse igual impreso y en modo noche */}
      <article className="recibo relative overflow-hidden rounded-3xl border border-black/10 bg-white p-8 text-[#2b2117] shadow-pop sm:p-10">
        {r.cancelado && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded-2xl border-4 border-[#b03f2c]/70 px-6 py-2 text-4xl font-bold tracking-widest text-[#b03f2c]/70 uppercase">Cancelado</span>
          </div>
        )}

        <header className="flex items-start justify-between gap-4 border-b border-black/10 pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#e9a21b] text-[#2b2117]">
              <Egg size={22} strokeWidth={1.6} />
            </span>
            <div className="leading-none">
              <p className="text-[10px] font-semibold tracking-[0.22em] text-black/50 uppercase">Avícola</p>
              <p className="display mt-0.5 text-xl font-semibold">San Ángel</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-black/50 uppercase">Recibo de pago</p>
            <p className="mt-1 text-lg font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
              {r.folio}
            </p>
            <p className="text-xs text-black/55">{fecha(r.fecha, { hora: true, anio: true })}</p>
          </div>
        </header>

        <section className="py-7 text-center">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-black/50 uppercase">Recibimos de</p>
          <p className="display mt-1 text-2xl font-semibold">{r.cliente.nombre}</p>
          <p className="cifra mt-4 text-6xl font-semibold">{pesos(r.monto)}</p>
          <p className="mt-2 text-sm text-black/60">
            {METODO[r.metodo]}
            {r.referencia && ` · Ref. ${r.referencia}`}
          </p>
        </section>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-black/10 py-6 text-sm">
          <div>
            <dt className="text-[10px] font-semibold tracking-[0.12em] text-black/50 uppercase">Concepto</dt>
            <dd className="mt-0.5">
              {r.pollitanda ? `Pollitanda ${r.pollitanda.programa}` : 'Abono a pedido'}
              <span className="block text-xs text-black/55" style={{ fontFamily: 'var(--font-mono)' }}>
                {r.pedido.folio}
                {r.pollitanda && ` · ${r.pollitanda.folio}`}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold tracking-[0.12em] text-black/50 uppercase">Sucursal</dt>
            <dd className="mt-0.5">{r.pedido.sucursal}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold tracking-[0.12em] text-black/50 uppercase">Total del pedido</dt>
            <dd className="num mt-0.5">{pesos(r.pedido.total)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold tracking-[0.12em] text-black/50 uppercase">Pagado a la fecha</dt>
            <dd className="num mt-0.5">{pesos(r.acumulado)}</dd>
          </div>
          <div className="col-span-2 flex items-baseline justify-between rounded-2xl bg-[#f4eee2] px-4 py-3">
            <dt className="font-medium">{r.saldoDespues > 0 ? 'Saldo pendiente' : 'Pedido liquidado'}</dt>
            <dd className="cifra text-2xl font-semibold">{pesos(Math.max(0, r.saldoDespues))}</dd>
          </div>
        </dl>

        <footer className="pt-6 text-xs text-black/55">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p>Recibió: {r.recibio ?? '—'}</p>
              {r.cliente.telefono && <p>Tel. del cliente: {telefono(r.cliente.telefono)}</p>}
              {r.cancelado && <p className="mt-1 font-medium text-[#b03f2c]">Cancelado: {r.motivoCancelacion}</p>}
            </div>
            <div className="w-44 border-t border-black/30 pt-1.5 text-center">Firma de recibido</div>
          </div>
          <p className="mt-6 text-center text-[10px] text-black/40">Comprobante interno. No es un comprobante fiscal (CFDI).</p>
        </footer>
      </article>
    </div>
  );
}

export default function Pagina() {
  return (
    <ProveedorSesion>
      <Comprobante />
    </ProveedorSesion>
  );
}
