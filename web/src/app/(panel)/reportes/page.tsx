'use client';

import { ChartColumn, Download } from 'lucide-react';
import { useState } from 'react';
import { SinPermiso } from '@/components/shell';
import { Boton, Cargando, cx, Encabezado, Entrada, ErrorCarga, Progreso, Tabla, Tarjeta, Td, Th, TituloTarjeta, Vacio } from '@/components/ui';
import { useApi } from '@/lib/api';
import { CATEGORIA, METODO, TIPO_CLIENTE } from '@/lib/etiquetas';
import { descargarCsv, fecha, hoy, numero, pesos, pesosCortos, plural, sumarDias } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Categoria, MetodoPago, TipoCliente } from '@/lib/tipos';

interface Reporte {
  desde: string;
  hasta: string;
  totales: { pedidos: number; total: number; descuentos: number; cobrado: number; porCobrar: number; ticketPromedio: number; cobradoEnPeriodo: number; cotizacionesEmitidas: number; cotizacionesGanadas: number };
  porDia: { dia: string; pedidos: number; total: number }[];
  porProducto: { sku: string; nombre: string; categoria: Categoria; unidad: string; cantidad: number; importe: number }[];
  porVendedor: { vendedor: string; pedidos: number; total: number }[];
  porCliente: { id: number; nombre: string; tipo: TipoCliente; pedidos: number; total: number; saldo: number }[];
  cobranza: { metodo: MetodoPago; pagos: number; monto: number }[];
}

const primeroDelMes = (dia: string) => `${dia.slice(0, 7)}-01`;

export default function Reportes() {
  const { puede } = useSesion();
  const dia = hoy();
  const [desde, setDesde] = useState(primeroDelMes(dia));
  const [hasta, setHasta] = useState(dia);
  const ver = puede('reportes.ver');
  const { data: r, error, mutate } = useApi<Reporte>(ver && desde && hasta && desde <= hasta ? `/reportes/ventas?desde=${desde}&hasta=${hasta}` : null);
  if (!ver) return <SinPermiso />;

  const mesPasadoFin = sumarDias(primeroDelMes(dia), -1);
  const rangos: [string, string, string][] = [
    ['Este mes', primeroDelMes(dia), dia],
    ['Mes pasado', primeroDelMes(mesPasadoFin), mesPasadoFin],
    ['Últimos 7 días', sumarDias(dia, -6), dia],
    ['Últimos 30 días', sumarDias(dia, -29), dia],
  ];
  const periodo = `${desde}_a_${hasta}`;
  const maximoDia = Math.max(...(r?.porDia.map((d) => d.total) ?? []), 1);
  const maximoProducto = Math.max(...(r?.porProducto.map((p) => p.importe) ?? []), 1);
  const conversion = r && r.totales.cotizacionesEmitidas > 0 ? Math.round((r.totales.cotizacionesGanadas / r.totales.cotizacionesEmitidas) * 100) : null;

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Reportes" descripcion="Ventas y cobranza del periodo: por día, producto, vendedor y cliente. Todo se puede descargar para Excel." />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-2/60 p-1">
          {rangos.map(([nombre, d, h]) => {
            const activo = desde === d && hasta === h;
            return (
              <button
                key={nombre}
                onClick={() => {
                  setDesde(d);
                  setHasta(h);
                }}
                className={cx('rounded-xl px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors', activo ? 'bg-surface font-semibold shadow-card' : 'text-muted hover:text-ink')}
              >
                {nombre}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Entrada type="date" aria-label="Desde" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="w-40" />
          a
          <Entrada type="date" aria-label="Hasta" value={hasta} min={desde} max={dia} onChange={(e) => setHasta(e.target.value)} className="w-40" />
        </div>
      </div>

      {error && !r ? (
        <ErrorCarga error={error} onReintentar={() => mutate()} />
      ) : !r ? (
        <Cargando filas={8} />
      ) : r.totales.pedidos === 0 ? (
        <Tarjeta>
          <Vacio icono={<ChartColumn size={24} strokeWidth={1.5} />} titulo="Sin ventas en este periodo">
            Cambia las fechas para ver otro periodo.
          </Vacio>
        </Tarjeta>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ['Ventas', pesos(r.totales.total), `${r.totales.pedidos} pedidos`],
              ['Ticket promedio', pesos(r.totales.ticketPromedio), r.totales.descuentos > 0 ? `${pesosCortos(r.totales.descuentos)} en descuentos` : 'Sin descuentos'],
              ['Cobrado en el periodo', pesos(r.totales.cobradoEnPeriodo), 'Pagos recibidos en estas fechas'],
              ['Por cobrar', pesos(r.totales.porCobrar), 'De las ventas del periodo'],
              ['Cotizaciones ganadas', conversion === null ? '—' : `${conversion}%`, `${r.totales.cotizacionesGanadas} de ${r.totales.cotizacionesEmitidas} emitidas`],
            ].map(([etiqueta, valor, detalle]) => (
              <Tarjeta key={etiqueta} className="px-4 py-3.5">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{etiqueta}</p>
                <p className="cifra mt-1 text-2xl font-semibold">{valor}</p>
                <p className="mt-0.5 text-xs text-muted">{detalle}</p>
              </Tarjeta>
            ))}
          </div>

          <Tarjeta>
            <TituloTarjeta
              accion={
                <Boton tamano="sm" variante="fantasma" icono={<Download size={14} strokeWidth={1.6} />} onClick={() => descargarCsv(`ventas_por_dia_${periodo}`, ['Fecha', 'Pedidos', 'Ventas'], r.porDia.map((d) => [d.dia, d.pedidos, d.total]))}>
                  Excel
                </Boton>
              }
            >
              Ventas por día
            </TituloTarjeta>
            <div className="overflow-x-auto px-5 pb-5">
              <div className="flex h-44 items-end gap-1.5" style={{ minWidth: `${r.porDia.length * 26}px` }}>
                {r.porDia.map((d, i) => (
                  <div key={d.dia} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-base opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="num font-semibold">{pesosCortos(d.total)}</span> · {d.pedidos} ped. · {fecha(d.dia)}
                    </div>
                    <div className="barra min-h-[3px] rounded-t-md bg-[color-mix(in_srgb,var(--accent)_45%,var(--surface-3))] transition-colors group-hover:bg-accent" style={{ height: `${Math.max(2, (d.total / maximoDia) * 100)}%`, animationDelay: `${i * 25}ms` }} />
                    <span className="num mt-1.5 text-center text-[10px] text-muted">{Number(d.dia.slice(8))}</span>
                  </div>
                ))}
              </div>
            </div>
          </Tarjeta>

          <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Tarjeta className="overflow-hidden">
              <TituloTarjeta
                accion={
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    icono={<Download size={14} strokeWidth={1.6} />}
                    onClick={() => descargarCsv(`ventas_por_producto_${periodo}`, ['Clave', 'Producto', 'Categoría', 'Unidad', 'Cantidad', 'Importe'], r.porProducto.map((p) => [p.sku, p.nombre, CATEGORIA[p.categoria], p.unidad, p.cantidad, p.importe]))}
                  >
                    Excel
                  </Boton>
                }
              >
                Por producto
              </TituloTarjeta>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Producto</Th>
                    <Th derecha>Cantidad</Th>
                    <Th derecha>Importe</Th>
                    <Th className="w-1/4">Participación</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.porProducto.map((p) => (
                    <tr key={p.sku}>
                      <Td>
                        <p className="font-medium">{p.nombre}</p>
                        <p className="text-xs text-muted">{CATEGORIA[p.categoria]}</p>
                      </Td>
                      <Td derecha className="whitespace-nowrap">
                        {numero(p.cantidad)} <span className="text-xs text-muted">{plural(p.unidad, p.cantidad)}</span>
                      </Td>
                      <Td derecha className="font-medium">
                        {pesos(p.importe)}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Progreso className="flex-1" valor={p.importe} total={maximoProducto} />
                          <span className="num w-9 text-right text-xs text-muted">{Math.round((p.importe / (r.totales.total + r.totales.descuentos)) * 100)}%</span>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </Tarjeta>

            <div className="space-y-6">
              <Tarjeta>
                <TituloTarjeta>Por vendedor</TituloTarjeta>
                <ul className="space-y-4 px-5 pb-5">
                  {r.porVendedor.map((v) => (
                    <li key={v.vendedor}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{v.vendedor}</span>
                        <span className="num shrink-0">{pesos(v.total)}</span>
                      </div>
                      <Progreso className="mt-1.5" valor={v.total} total={r.totales.total} />
                      <p className="mt-1 text-xs text-muted">
                        {v.pedidos} pedidos · {Math.round((v.total / r.totales.total) * 100)}% de las ventas
                      </p>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
              <Tarjeta>
                <TituloTarjeta>Cobranza por forma de pago</TituloTarjeta>
                {r.cobranza.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-muted">Sin pagos en el periodo.</p>
                ) : (
                  <ul className="divide-y divide-line px-5 pb-3">
                    {r.cobranza.map((c) => (
                      <li key={c.metodo} className="flex items-baseline justify-between py-2.5 text-sm">
                        <span>
                          {METODO[c.metodo]} <span className="text-xs text-muted">· {c.pagos} pagos</span>
                        </span>
                        <span className="num font-medium">{pesos(c.monto)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>
          </div>

          <Tarjeta className="overflow-hidden">
            <TituloTarjeta
              accion={
                <Boton
                  tamano="sm"
                  variante="fantasma"
                  icono={<Download size={14} strokeWidth={1.6} />}
                  onClick={() => descargarCsv(`ventas_por_cliente_${periodo}`, ['Cliente', 'Tipo', 'Pedidos', 'Ventas', 'Saldo'], r.porCliente.map((c) => [c.nombre, TIPO_CLIENTE[c.tipo].nombre, c.pedidos, c.total, c.saldo]))}
                >
                  Excel
                </Boton>
              }
            >
              Mejores clientes del periodo
            </TituloTarjeta>
            <Tabla>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Tipo</Th>
                  <Th derecha>Pedidos</Th>
                  <Th derecha>Ventas</Th>
                  <Th derecha>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {r.porCliente.map((c, i) => (
                  <tr key={c.id}>
                    <Td>
                      <span className="num mr-3 text-xs text-muted">{i + 1}</span>
                      <span className="font-medium">{c.nombre}</span>
                    </Td>
                    <Td className="text-muted">{TIPO_CLIENTE[c.tipo].nombre}</Td>
                    <Td derecha>{c.pedidos}</Td>
                    <Td derecha className="font-medium">
                      {pesos(c.total)}
                    </Td>
                    <Td derecha className={c.saldo > 0 ? 'text-bad' : 'text-muted'}>
                      {c.saldo > 0 ? pesos(c.saldo) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
        </>
      )}
    </div>
  );
}
