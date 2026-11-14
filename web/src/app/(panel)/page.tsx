'use client';

import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bird,
  Boxes,
  CalendarDays,
  CircleCheck,
  Clock,
  FileText,
  PackageOpen,
  PhoneCall,
  Plus,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';
import { Folio, InsigniaPedido } from '@/components/negocio';
import { BotonEnlace, Cargando, cx, ErrorCarga, Insignia, Progreso, Tarjeta, TituloTarjeta, Vacio } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fecha, fechaLarga, numero, pesos, pesosCortos, plural, relativa } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Alerta, Tablero } from '@/lib/tipos';

const ICONO_ALERTA: Record<Alerta['tipo'], ReactNode> = {
  inventario: <Boxes size={17} strokeWidth={1.5} />,
  caducidad: <Clock size={17} strokeWidth={1.5} />,
  preventa: <PackageOpen size={17} strokeWidth={1.5} />,
  cotizacion: <FileText size={17} strokeWidth={1.5} />,
  cobranza: <Wallet size={17} strokeWidth={1.5} />,
  anticipo: <Banknote size={17} strokeWidth={1.5} />,
  incidencia: <TriangleAlert size={17} strokeWidth={1.5} />,
};

function saludo() {
  const hora = Number(new Intl.DateTimeFormat('es-MX', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(new Date()));
  return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** Ventas de los últimos 14 días. Cada barra muestra su importe al pasar el cursor. */
function Barras({ serie }: { serie: NonNullable<Tablero['serie']> }) {
  const maximo = Math.max(...serie.map((d) => d.total), 1);
  return (
    <div className="flex h-36 items-end gap-1.5 sm:gap-2" role="img" aria-label="Ventas de los últimos 14 días">
      {serie.map((d, i) => {
        const esHoy = i === serie.length - 1;
        return (
          <div key={d.dia} className="group relative flex h-full flex-1 flex-col justify-end">
            <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-base opacity-0 transition-opacity group-hover:opacity-100">
              <span className="num font-semibold">{pesosCortos(d.total)}</span> · {fecha(d.dia)}
            </div>
            <div
              className={cx('barra min-h-[3px] rounded-t-md transition-colors', esHoy ? 'bg-accent shadow-glow' : 'bg-[color-mix(in_srgb,var(--accent)_38%,var(--surface-3))] group-hover:bg-accent')}
              style={{ height: `${Math.max(2, (d.total / maximo) * 100)}%`, animationDelay: `${i * 35}ms` }}
            />
            <span className={cx('num mt-1.5 text-center text-[10px]', esHoy ? 'font-semibold text-ink' : 'text-muted')}>{Number(d.dia.slice(8))}</span>
          </div>
        );
      })}
    </div>
  );
}

function Indicador({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: string; detalle?: ReactNode; tono?: 'rojo' }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{etiqueta}</p>
      <p className={cx('cifra mt-1 text-[1.65rem] leading-none font-semibold', tono === 'rojo' && 'text-bad')}>{valor}</p>
      {detalle && <p className="mt-1.5 text-xs text-muted">{detalle}</p>}
    </div>
  );
}

function Etapa({ nombre, cuenta, href, icono, alerta }: { nombre: string; cuenta: number; href: string; icono: ReactNode; alerta?: boolean }) {
  return (
    <Link href={href} className={cx('group relative flex flex-1 items-center gap-3 rounded-2xl border px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:shadow-card', alerta && cuenta > 0 ? 'tono tono-rojo' : 'border-line bg-surface')}>
      <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', alerta && cuenta > 0 ? 'bg-current/10' : 'bg-surface-2 text-muted')}>{icono}</span>
      <span className="min-w-0">
        <span className="cifra block text-2xl leading-none font-semibold text-ink">{cuenta}</span>
        <span className="mt-0.5 block text-xs leading-tight text-muted">{nombre}</span>
      </span>
      <ArrowUpRight size={15} strokeWidth={1.6} className="absolute top-3 right-3 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export default function Inicio() {
  const { usuario, puede } = useSesion();
  const { data, error, mutate } = useApi<Tablero>('/dashboard', { refreshInterval: 60_000 });

  if (error && !data) return <ErrorCarga error={error} onReintentar={() => mutate()} />;
  if (!data) return <Cargando filas={8} />;

  const { dinero, pedidos, serie } = data;
  const variacion = dinero && dinero.ventasMesAnterior > 0 ? Math.round(((dinero.ventasMes - dinero.ventasMesAnterior) / dinero.ventasMesAnterior) * 100) : null;

  const tarjetaEntregas = pedidos && (
    <Tarjeta>
      <TituloTarjeta accion={<Link href="/ventas?grupo=activos" className="text-xs text-muted hover:text-ink">Ver todos</Link>}>Próximas entregas</TituloTarjeta>
      {data.entregas.length === 0 ? (
        <Vacio icono={<CalendarDays size={24} strokeWidth={1.5} />} titulo="Sin entregas esta semana" />
      ) : (
        <ul className="px-2.5 pb-3">
          {data.entregas.slice(0, 7).map((e) => (
            <li key={e.id}>
              <Link href={`/ventas/${e.id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-2">
                <span className={cx('w-[4.5rem] shrink-0 text-xs font-medium first-letter:uppercase', e.atrasada ? 'text-bad' : 'text-muted')}>{relativa(e.fechaEntrega)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.cliente}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Folio>{e.folio}</Folio>
                    {e.esPollitanda && <span>· Pollitanda</span>}
                    {e.saldo > 0 && <span>· debe {pesosCortos(e.saldo)}</span>}
                  </span>
                </span>
                <InsigniaPedido estado={e.estado} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );

  return (
    <div className="entrada space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted first-letter:uppercase">{fechaLarga(data.fecha)}</p>
          <h1 className="mt-1 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-[1.05] font-semibold">
            {saludo()}, <em className="font-normal text-accent-text">{usuario.nombre.split(' ')[0]}</em>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {puede('pollitandas.inscribir') && (
            <BotonEnlace href="/pollitandas" icono={<Bird size={16} strokeWidth={1.6} />}>
              Pollitandas
            </BotonEnlace>
          )}
          {puede('ventas.crear') && (
            <BotonEnlace href="/ventas/nuevo" variante="primario" icono={<Plus size={17} strokeWidth={1.8} />}>
              Nueva venta
            </BotonEnlace>
          )}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.75fr_1fr]">
        {/* Ventas del mes */}
        {dinero && serie ? (
          <Tarjeta className="relative overflow-hidden p-6 sm:p-7">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-[radial-gradient(closest-side,var(--halo),transparent)]" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-end">
              <div>
                <p className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Ventas del mes</p>
                <p className="cifra mt-2 text-[clamp(2.8rem,5.4vw,4.2rem)] leading-[0.95] font-semibold">{pesosCortos(dinero.ventasMes)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                  {variacion !== null && (
                    <Insignia tono={variacion >= 0 ? 'verde' : 'rojo'}>
                      {variacion >= 0 ? <TrendingUp size={13} strokeWidth={1.8} /> : <TrendingDown size={13} strokeWidth={1.8} />}
                      {variacion >= 0 ? '+' : ''}
                      {variacion}% vs. mes anterior
                    </Insignia>
                  )}
                  <span>
                    <span className="num font-medium text-ink">{dinero.pedidosMes}</span> pedidos
                  </span>
                </div>
              </div>
              <div>
                <p className="mb-3 text-right text-xs text-muted">Últimos 14 días</p>
                <Barras serie={serie} />
              </div>
            </div>
            <div className="relative mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 lg:grid-cols-4">
              <Indicador etiqueta="Vendido hoy" valor={pesosCortos(dinero.ventasHoy)} />
              <Indicador etiqueta="Cobrado hoy" valor={pesosCortos(dinero.cobradoHoy)} />
              <Indicador etiqueta="Cobrado en el mes" valor={pesosCortos(dinero.cobradoMes)} />
              <Indicador
                etiqueta="Por cobrar"
                valor={pesosCortos(dinero.porCobrar)}
                detalle={dinero.vencido > 0 ? <span className="text-bad">{pesosCortos(dinero.vencido)} vencido</span> : 'Sin saldos vencidos'}
              />
            </div>
          </Tarjeta>
        ) : (
          (tarjetaEntregas ?? (
            <Tarjeta className="flex flex-col justify-center p-7">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Tu jornada</p>
              <p className="display mt-2 text-3xl leading-tight font-semibold">{data.alertas.length ? `${data.alertas.length} avisos por revisar` : 'Todo en orden'}</p>
              <p className="mt-2 text-sm text-muted">Aquí verás las alertas y pendientes de los módulos a los que tienes acceso.</p>
            </Tarjeta>
          ))
        )}

        {/* Alertas */}
        <Tarjeta className="flex flex-col">
          <TituloTarjeta accion={data.alertas.length > 0 && <Insignia tono={data.alertas.some((a) => a.nivel === 'alta') ? 'rojo' : 'ambar'}>{data.alertas.length}</Insignia>}>Requiere atención</TituloTarjeta>
          {data.alertas.length === 0 ? (
            <Vacio icono={<CircleCheck size={24} strokeWidth={1.5} />} titulo="Todo en orden">
              No hay alertas por ahora.
            </Vacio>
          ) : (
            <ul className="max-h-[23rem] flex-1 space-y-1 overflow-y-auto px-2.5 pb-3">
              {data.alertas.map((a, i) => (
                <li key={i}>
                  <Link href={a.enlace} className="group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-2">
                    <span className={cx('tono mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] border', a.nivel === 'alta' ? 'tono-rojo' : 'tono-ambar')}>{ICONO_ALERTA[a.tipo]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug font-medium">{a.titulo}</span>
                      <span className="block text-xs text-muted">{a.detalle}</span>
                    </span>
                    <ArrowRight size={15} strokeWidth={1.6} className="mt-2 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      {/* Flujo de pedidos */}
      {pedidos && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Etapa nombre="Cotizaciones abiertas" cuenta={pedidos.cotizaciones} href="/ventas?grupo=cotizaciones" icono={<FileText size={17} strokeWidth={1.5} />} />
          <Etapa nombre="Pedidos por preparar" cuenta={pedidos.recibidos} href="/ventas?estado=RECIBIDO" icono={<PackageOpen size={17} strokeWidth={1.5} />} />
          <Etapa nombre="Listos para entregar" cuenta={pedidos.preparados} href="/ventas?estado=PREPARADO" icono={<Boxes size={17} strokeWidth={1.5} />} />
          <Etapa nombre="En ruta" cuenta={pedidos.enRuta} href="/ventas?estado=EN_RUTA" icono={<Truck size={17} strokeWidth={1.5} />} />
          <Etapa nombre="Con incidencia" cuenta={pedidos.incidencias} href="/ventas?estado=INCIDENCIA" icono={<TriangleAlert size={17} strokeWidth={1.5} />} alerta />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr]">
        {dinero && tarjetaEntregas}

        {/* Pollitandas */}
        {puede('pollitandas.ver') && (
          <Tarjeta>
            <TituloTarjeta accion={<Link href="/pollitandas" className="text-xs text-muted hover:text-ink">Ver todas</Link>}>Pollitandas abiertas</TituloTarjeta>
            {data.pollitandas.length === 0 ? (
              <Vacio icono={<Bird size={24} strokeWidth={1.5} />} titulo="Sin programas abiertos" />
            ) : (
              <ul className="space-y-1 px-2.5 pb-3">
                {data.pollitandas.map((t) => (
                  <li key={t.id}>
                    <Link href={`/pollitandas/${t.id}`} className="block rounded-xl px-2.5 py-3 transition-colors hover:bg-surface-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium">{t.nombre}</span>
                        <span className="num shrink-0 text-xs text-muted">
                          {t.paquetes}/{t.cupoPaquetes} paq.
                        </span>
                      </div>
                      <Progreso className="mt-2" valor={t.paquetes} total={t.cupoPaquetes} />
                      <div className="mt-2 flex justify-between text-xs text-muted">
                        <span>Entrega {fecha(t.fechaEntrega)}</span>
                        <span>
                          Cobrado <span className="num font-medium text-ink">{pesosCortos(t.cobrado)}</span> de {pesosCortos(t.vendido)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}

        {/* Seguimiento comercial o productos más vendidos */}
        {puede('clientes.ver') && data.seguimientos.length > 0 ? (
          <Tarjeta>
            <TituloTarjeta>Contactos pendientes</TituloTarjeta>
            <ul className="px-2.5 pb-3">
              {data.seguimientos.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link href={`/clientes/${s.cliente!.id}`} className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-2">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-muted">
                      <PhoneCall size={15} strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.cliente!.nombre}</span>
                      <span className="line-clamp-1 text-xs text-muted">{s.nota}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted first-letter:uppercase">{relativa(s.proximaAccion)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : (
          data.topProductos && (
            <Tarjeta>
              <TituloTarjeta>Lo más vendido del mes</TituloTarjeta>
              <TopProductos productos={data.topProductos} />
            </Tarjeta>
          )
        )}
      </div>

      {puede('clientes.ver') && data.seguimientos.length > 0 && data.topProductos && data.topProductos.length > 0 && (
        <Tarjeta>
          <TituloTarjeta>Lo más vendido del mes</TituloTarjeta>
          <TopProductos productos={data.topProductos} horizontal />
        </Tarjeta>
      )}
    </div>
  );
}

function TopProductos({ productos, horizontal }: { productos: NonNullable<Tablero['topProductos']>; horizontal?: boolean }) {
  const maximo = Math.max(...productos.map((p) => p.importe), 1);
  if (productos.length === 0) return <Vacio titulo="Aún no hay ventas este mes" />;
  return (
    <ul className={cx('gap-x-8 gap-y-4 px-5 pb-5', horizontal ? 'grid sm:grid-cols-2 xl:grid-cols-5' : 'space-y-4')}>
      {productos.map((p, i) => (
        <li key={p.nombre}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">
              <span className="num mr-2 text-xs text-muted">{i + 1}</span>
              {p.nombre}
            </span>
            <span className="num shrink-0 font-medium">{pesosCortos(p.importe)}</span>
          </div>
          <Progreso className="mt-1.5" valor={p.importe} total={maximo} />
          <p className="mt-1 text-xs text-muted">
            {numero(p.cantidad)} {plural(p.unidad, p.cantidad)} · {pesos(p.importe / p.cantidad)} promedio
          </p>
        </li>
      ))}
    </ul>
  );
}
