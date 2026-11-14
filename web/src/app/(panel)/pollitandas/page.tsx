'use client';

import { Bird, CalendarDays, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ModalPollitanda } from '@/components/pollitandas';
import { SinPermiso } from '@/components/shell';
import { Boton, Cargando, Encabezado, ErrorCarga, Insignia, Progreso, Tarjeta, Vacio } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fecha, pesos, pesosCortos, plural, relativa } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Pollitanda } from '@/lib/tipos';

const ESTADO: Record<Pollitanda['estado'], { nombre: string; tono: 'verde' | 'neutro' | 'azul' }> = {
  ABIERTA: { nombre: 'Abierta', tono: 'verde' },
  CERRADA: { nombre: 'Inscripciones cerradas', tono: 'neutro' },
  ENTREGADA: { nombre: 'Entregada', tono: 'azul' },
  CANCELADA: { nombre: 'Cancelada', tono: 'neutro' },
};

export default function Pollitandas() {
  const { puede } = useSesion();
  const { data, error, mutate } = useApi<Pollitanda[]>(puede('pollitandas.ver') ? '/pollitandas' : null);
  const [nueva, setNueva] = useState(false);
  if (!puede('pollitandas.ver')) return <SinPermiso />;

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Pollitandas" descripcion="Programas de venta por paquetes con anticipo. Cada participante tiene su expediente con pagos, saldo y entrega.">
        {puede('pollitandas.admin') && (
          <Boton variante="primario" icono={<Plus size={17} strokeWidth={1.8} />} onClick={() => setNueva(true)}>
            Nueva Pollitanda
          </Boton>
        )}
      </Encabezado>

      {error && !data ? (
        <ErrorCarga error={error} onReintentar={() => mutate()} />
      ) : !data ? (
        <Cargando />
      ) : data.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<Bird size={24} strokeWidth={1.5} />} titulo="Aún no hay Pollitandas">
            Crea el primer programa: define el paquete, el precio, el cupo y la fecha de entrega.
          </Vacio>
        </Tarjeta>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <Link key={t.id} href={`/pollitandas/${t.id}`} className="group">
              <Tarjeta className="relative flex h-full flex-col overflow-hidden p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-line-strong">
                <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-44 rounded-full bg-[radial-gradient(closest-side,var(--halo),transparent)]" />
                <div className="relative flex items-start justify-between gap-3">
                  <Insignia tono={ESTADO[t.estado].tono} punto>
                    {ESTADO[t.estado].nombre}
                  </Insignia>
                  {t.preventa && <Insignia tono="ambar">Preventa</Insignia>}
                </div>
                <h2 className="relative mt-3 text-[1.45rem] leading-tight font-semibold">{t.nombre}</h2>
                <p className="mt-1 text-sm text-muted">
                  {t.pollitosPorPaquete} {plural(t.producto?.unidad ?? 'pollito', t.pollitosPorPaquete)} por paquete · <span className="num font-medium text-ink">{pesos(t.precioPaquete)}</span>
                </p>

                <div className="mt-5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted">Cupo</span>
                    <span className="num">
                      <span className="font-semibold">{t.paquetesVendidos}</span> de {t.cupoPaquetes} paquetes
                    </span>
                  </div>
                  <Progreso className="mt-2" valor={t.paquetesVendidos} total={t.cupoPaquetes} />
                </div>

                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
                  <div>
                    <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Inscritos</dt>
                    <dd className="cifra mt-0.5 text-xl font-semibold">{t.participantes}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Cobrado</dt>
                    <dd className="cifra mt-0.5 text-xl font-semibold">{pesosCortos(t.cobrado)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Por cobrar</dt>
                    <dd className="cifra mt-0.5 text-xl font-semibold">{pesosCortos(t.porCobrar)}</dd>
                  </div>
                </dl>

                <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
                  <span className="inline-flex items-center gap-2 text-muted">
                    <CalendarDays size={15} strokeWidth={1.5} />
                    Entrega {fecha(t.fechaEntrega)}
                    {t.estado === 'ABIERTA' && <span className="text-xs">· {relativa(t.fechaEntrega)}</span>}
                  </span>
                  {(t.sinAnticipo ?? 0) > 0 && <Insignia tono="rojo">{t.sinAnticipo} sin anticipo</Insignia>}
                </div>
              </Tarjeta>
            </Link>
          ))}
        </div>
      )}

      <ModalPollitanda abierto={nueva} onCerrar={() => setNueva(false)} />
    </div>
  );
}
