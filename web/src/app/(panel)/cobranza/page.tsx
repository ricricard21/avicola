'use client';

import { Ban, Banknote, Bird, Printer, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BotonWhatsApp, Folio, ModalPago, PedidoPorCobrar } from '@/components/negocio';
import { SinPermiso } from '@/components/shell';
import { Boton, Buscador, Cargando, cx, DialogoMotivo, Encabezado, Entrada, ErrorCarga, Insignia, Paginacion, Pestanas, Selector, Tabla, Tarjeta, Td, Th, useAviso, Vacio } from '@/components/ui';
import { api, mensajeDe, refrescarOperacion, useApi } from '@/lib/api';
import { METODO } from '@/lib/etiquetas';
import { fecha, pesos, pesosCortos, relativa } from '@/lib/formato';
import { conParametros, useRetardo } from '@/lib/hooks';
import { useSesion } from '@/lib/sesion';
import type { CuentaPorCobrar, MetodoPago, Pagina, PagoResumen, PorCobrar } from '@/lib/tipos';

interface Resumen {
  cobradoHoy: number;
  cobradoMes: number;
  pagosMes: number;
  porMetodo: { metodo: MetodoPago; monto: number; pagos: number }[];
}

const TRAMOS = [
  { clave: 'alCorriente', nombre: 'Al corriente', color: 'var(--ok)' },
  { clave: 'de1a7', nombre: '1 a 7 días', color: 'var(--accent)' },
  { clave: 'de8a30', nombre: '8 a 30 días', color: 'color-mix(in srgb, var(--bad) 65%, var(--accent))' },
  { clave: 'masDe30', nombre: 'Más de 30', color: 'var(--bad)' },
] as const;

export default function Cobranza() {
  const { puede } = useSesion();
  const aviso = useAviso();
  const ver = puede('cobranza.ver');
  const [vista, setVista] = useState<'cuentas' | 'pagos'>('cuentas');
  const [texto, setTexto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [cobro, setCobro] = useState<PedidoPorCobrar | null>(null);
  const [aCancelar, setACancelar] = useState<PagoResumen | null>(null);
  const q = useRetardo(texto);

  const { data: cartera, error } = useApi<PorCobrar>(ver ? conParametros('/cobranza/por-cobrar', { q }) : null);
  const { data: resumen } = useApi<Resumen>(ver ? '/cobranza/resumen' : null);
  const { data: pagos } = useApi<Pagina<PagoResumen>>(ver && vista === 'pagos' ? conParametros('/pagos', { metodo, desde, hasta, pagina }) : null);
  if (!ver) return <SinPermiso />;

  const recordatorio = (c: CuentaPorCobrar) =>
    `Hola ${c.cliente.nombre}, de Avícola San Ángel. Te recordamos que tu pedido ${c.folio} tiene un saldo pendiente de ${pesos(c.saldo)}${c.diasVencido > 0 ? `, vencido ${relativa(c.fechaVencimiento)}` : c.fechaVencimiento ? `, con vencimiento el ${fecha(c.fechaVencimiento)}` : ''}. ¡Gracias!`;

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Cobranza" descripcion="Saldos por cobrar, antigüedad de la cartera y pagos recibidos." />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
        <Tarjeta className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Por cobrar</p>
              <p className="cifra mt-1 text-4xl font-semibold">{cartera ? pesos(cartera.total) : '—'}</p>
            </div>
            {cartera && cartera.vencido > 0 && (
              <p className="text-sm">
                <span className="num font-semibold text-bad">{pesos(cartera.vencido)}</span> <span className="text-muted">vencido</span>
              </p>
            )}
          </div>
          {cartera && cartera.total > 0 && (
            <>
              <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Antigüedad de saldos">
                {TRAMOS.map((t) => cartera.antiguedad[t.clave] > 0 && <div key={t.clave} style={{ width: `${(cartera.antiguedad[t.clave] / cartera.total) * 100}%`, background: t.color }} className="min-w-1.5 rounded-full" />)}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                {TRAMOS.map((t) => (
                  <li key={t.clave} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: t.color }} />
                    <span className="text-muted">{t.nombre}</span>
                    <span className="num font-medium">{pesosCortos(cartera.antiguedad[t.clave])}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Cobrado hoy</p>
          <p className="cifra mt-1 text-4xl font-semibold">{resumen ? pesos(resumen.cobradoHoy) : '—'}</p>
          <p className="mt-3 text-xs text-muted">Corte al momento</p>
        </Tarjeta>
        <Tarjeta className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Cobrado en el mes</p>
          <p className="cifra mt-1 text-4xl font-semibold">{resumen ? pesos(resumen.cobradoMes) : '—'}</p>
          <p className="mt-3 text-xs text-muted">{resumen?.porMetodo.map((m) => `${METODO[m.metodo]} ${pesosCortos(m.monto)}`).join(' · ') || 'Sin pagos este mes'}</p>
        </Tarjeta>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Pestanas
          valor={vista}
          onCambio={setVista}
          opciones={[
            { valor: 'cuentas', etiqueta: 'Por cobrar', cuenta: cartera?.cuentas.length },
            { valor: 'pagos', etiqueta: 'Pagos recibidos' },
          ]}
        />
        {vista === 'cuentas' ? (
          <Buscador className="min-w-52 flex-1 sm:max-w-xs" valor={texto} onCambio={setTexto} placeholder="Cliente o folio" />
        ) : (
          <>
            <Selector
              className="w-44"
              valor={metodo}
              onCambio={(m) => {
                setMetodo(m);
                setPagina(1);
              }}
              opciones={[{ valor: '' as const, etiqueta: 'Toda forma de pago' }, ...(Object.keys(METODO) as MetodoPago[]).map((m) => ({ valor: m, etiqueta: METODO[m] }))]}
            />
            <div className="flex items-center gap-2 text-sm text-muted">
              <Entrada type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={(e) => (setDesde(e.target.value), setPagina(1))} className="w-40" />
              a
              <Entrada type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={(e) => (setHasta(e.target.value), setPagina(1))} className="w-40" />
            </div>
          </>
        )}
      </div>

      <Tarjeta className="overflow-hidden">
        {vista === 'cuentas' &&
          (error && !cartera ? (
            <ErrorCarga error={error} />
          ) : !cartera ? (
            <Cargando />
          ) : cartera.cuentas.length === 0 ? (
            <Vacio icono={<Wallet size={24} strokeWidth={1.5} />} titulo={q ? 'Sin resultados' : 'Cartera al corriente'}>
              {!q && 'No hay saldos pendientes de cobro.'}
            </Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Pedido</Th>
                  <Th>Vencimiento</Th>
                  <Th derecha>Total</Th>
                  <Th derecha>Pagado</Th>
                  <Th derecha>Saldo</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {cartera.cuentas.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`/clientes/${c.cliente.id}`} className="font-medium hover:underline">
                        {c.cliente.nombre}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Link href={`/ventas/${c.id}`} className="hover:underline">
                        <Folio>{c.folio}</Folio>
                      </Link>
                      {c.esPollitanda && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-accent-text">
                          <Bird size={12} strokeWidth={1.6} /> Pollitanda
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {c.fechaVencimiento ? (
                        c.diasVencido > 0 ? (
                          <Insignia tono="rojo">
                            Vencido {c.diasVencido} {c.diasVencido === 1 ? 'día' : 'días'}
                          </Insignia>
                        ) : (
                          <span className="text-muted">
                            {fecha(c.fechaVencimiento)} · {relativa(c.fechaVencimiento)}
                          </span>
                        )
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td derecha className="text-muted">
                      {pesos(c.total)}
                    </Td>
                    <Td derecha className="text-muted">
                      {pesos(c.pagado)}
                    </Td>
                    <Td derecha className="font-semibold">
                      {pesos(c.saldo)}
                    </Td>
                    <Td derecha>
                      <div className="flex justify-end gap-1.5">
                        <BotonWhatsApp telefono={c.cliente.telefono} mensaje={recordatorio(c)}>
                          Recordar
                        </BotonWhatsApp>
                        {puede('cobranza.registrar') && (
                          <Boton tamano="sm" icono={<Banknote size={14} strokeWidth={1.7} />} onClick={() => setCobro({ id: c.id, folio: c.folio, saldo: c.saldo, total: c.total, cliente: c.cliente })}>
                            Cobrar
                          </Boton>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          ))}

        {vista === 'pagos' &&
          (!pagos ? (
            <Cargando />
          ) : pagos.datos.length === 0 ? (
            <Vacio icono={<Banknote size={24} strokeWidth={1.5} />} titulo="Sin pagos en este periodo" />
          ) : (
            <>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Recibo</Th>
                    <Th>Fecha</Th>
                    <Th>Cliente</Th>
                    <Th>Pedido</Th>
                    <Th>Forma de pago</Th>
                    <Th derecha>Monto</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {pagos.datos.map((g) => (
                    <tr key={g.id} className={cx(g.cancelado && 'opacity-55')}>
                      <Td className="whitespace-nowrap">
                        <Folio>{g.folio}</Folio>
                        {g.cancelado && <Insignia className="ml-2">Cancelado</Insignia>}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{fecha(g.fecha, { hora: true })}</Td>
                      <Td className="font-medium">{g.cliente?.nombre}</Td>
                      <Td>
                        <Link href={`/ventas/${g.pedido!.id}`} className="hover:underline">
                          <Folio>{g.pedido!.folio}</Folio>
                        </Link>
                      </Td>
                      <Td>
                        {METODO[g.metodo]}
                        {g.referencia && <span className="block text-xs text-muted">{g.referencia}</span>}
                      </Td>
                      <Td derecha className={cx('font-semibold', g.cancelado && 'line-through')}>
                        {pesos(g.monto)}
                      </Td>
                      <Td derecha>
                        <div className="flex justify-end gap-1">
                          <Link href={`/recibo/${g.id}`} target="_blank" aria-label="Ver comprobante" title="Comprobante" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
                            <Printer size={15} strokeWidth={1.5} />
                          </Link>
                          {!g.cancelado && puede('cobranza.cancelar') && (
                            <button onClick={() => setACancelar(g)} aria-label="Cancelar pago" title="Cancelar pago" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-bad">
                              <Ban size={15} strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
              <Paginacion pagina={pagos.pagina} porPagina={pagos.porPagina} total={pagos.total} onCambio={setPagina} />
            </>
          ))}
      </Tarjeta>

      {cobro && <ModalPago pedido={cobro} onCerrar={() => setCobro(null)} />}
      <DialogoMotivo
        abierto={!!aCancelar}
        onCerrar={() => setACancelar(null)}
        titulo={`Cancelar pago ${aCancelar?.folio ?? ''}`}
        descripcion={aCancelar ? `${pesos(aCancelar.monto)} regresan al saldo del pedido. El recibo queda en el historial como cancelado.` : undefined}
        accion="Cancelar pago"
        onConfirmar={async (motivo) => {
          try {
            await api(`/pagos/${aCancelar!.id}/cancelar`, { cuerpo: { motivo } });
            await refrescarOperacion();
            aviso.exito('Pago cancelado');
            setACancelar(null);
          } catch (err) {
            aviso.error(mensajeDe(err));
          }
        }}
      />
    </div>
  );
}
