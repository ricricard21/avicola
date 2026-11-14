'use client';

import { ArrowDownToLine, Boxes, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Folio } from '@/components/negocio';
import { SinPermiso } from '@/components/shell';
import { AreaTexto, Aviso, Boton, Campo, Cargando, cx, Encabezado, Entrada, ErrorCarga, filaClic, Insignia, Modal, Paginacion, PieModal, Pestanas, Selector, Tabla, Tarjeta, Td, Th, useAviso, Vacio } from '@/components/ui';
import { api, mensajeDe, refrescarOperacion, useApi } from '@/lib/api';
import { CATEGORIA, MOVIMIENTO } from '@/lib/etiquetas';
import { fecha, hoy, numero, pesosCortos, plural, relativa } from '@/lib/formato';
import { conParametros } from '@/lib/hooks';
import { useSesion } from '@/lib/sesion';
import type { Existencia, Lote, Movimiento, Pagina, Sucursal } from '@/lib/tipos';

type Vista = 'existencias' | 'lotes' | 'movimientos';

function Inventario() {
  const { puede, usuario } = useSesion();
  const parametros = useSearchParams();
  const productoInicial = Number(parametros.get('producto')) || null;
  const [vista, setVista] = useState<Vista>(productoInicial ? 'lotes' : 'existencias');
  const [productoId, setProductoId] = useState<number | null>(productoInicial);
  const [pagina, setPagina] = useState(1);
  const [entrada, setEntrada] = useState(false);
  const [ajuste, setAjuste] = useState<Lote | null>(null);
  const ver = puede('inventario.ver');

  const { data: existencias, error } = useApi<Existencia[]>(ver ? '/inventario/existencias' : null);
  const { data: lotes } = useApi<Lote[]>(ver && vista === 'lotes' ? conParametros('/inventario/lotes', { productoId }) : null);
  const { data: movimientos } = useApi<Pagina<Movimiento>>(ver && vista === 'movimientos' ? conParametros('/inventario/movimientos', { productoId, pagina }) : null);

  const resumen = useMemo(() => {
    const e = existencias ?? [];
    return {
      valor: e.reduce((s, x) => s + x.valor, 0),
      bajos: e.filter((x) => x.bajoMinimo).length,
      porVencer: e.filter((x) => x.porCaducar).length,
      porSurtir: e.filter((x) => x.porSurtir > 0).length,
    };
  }, [existencias]);

  if (!ver) return <SinPermiso />;
  const filtrado = existencias?.find((e) => e.id === productoId);
  const abrirProducto = (id: number, v: Vista = 'lotes') => {
    setProductoId(id);
    setPagina(1);
    setVista(v);
  };

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Inventario" descripcion="Existencia física, apartada y disponible por producto y por lote. Disponible = física − apartada en pedidos.">
        {puede('inventario.entrada') && (
          <Boton variante="primario" icono={<ArrowDownToLine size={17} strokeWidth={1.7} />} onClick={() => setEntrada(true)}>
            Registrar entrada
          </Boton>
        )}
      </Encabezado>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Valor del inventario', pesosCortos(resumen.valor), 'A costo de los lotes', false],
          ['Bajo el mínimo', String(resumen.bajos), resumen.bajos ? 'Productos por resurtir' : 'Todo sobre el mínimo', resumen.bajos > 0],
          ['Lotes por vencer', String(resumen.porVencer), resumen.porVencer ? 'Productos con fecha próxima' : 'Sin vencimientos próximos', resumen.porVencer > 0],
          ['Vendido sin lote', String(resumen.porSurtir), resumen.porSurtir ? 'Productos en preventa' : 'Nada pendiente de surtir', resumen.porSurtir > 0],
        ].map(([etiqueta, valor, detalle, alerta]) => (
          <Tarjeta key={String(etiqueta)} className="px-4 py-3.5">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{etiqueta}</p>
            <p className={cx('cifra mt-1 text-2xl font-semibold', alerta && 'text-bad')}>{existencias ? valor : '—'}</p>
            <p className="mt-0.5 text-xs text-muted">{detalle}</p>
          </Tarjeta>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Pestanas
          valor={vista}
          onCambio={(v) => {
            setVista(v);
            setPagina(1);
          }}
          opciones={[
            { valor: 'existencias', etiqueta: 'Existencias' },
            { valor: 'lotes', etiqueta: 'Lotes' },
            { valor: 'movimientos', etiqueta: 'Movimientos' },
          ]}
        />
        {vista !== 'existencias' &&
          (filtrado ? (
            <span className="tono tono-ambar inline-flex items-center gap-2 rounded-full border py-1 pr-1.5 pl-3 text-sm">
              {filtrado.nombre}
              <button onClick={() => setProductoId(null)} aria-label="Quitar filtro" className="grid size-5 place-items-center rounded-full hover:bg-current/15">
                <X size={13} strokeWidth={2} />
              </button>
            </span>
          ) : (
            <Selector
              className="w-72 max-w-full"
              valor={productoId}
              onCambio={(id) => {
                setProductoId(id);
                setPagina(1);
              }}
              buscable
              placeholder="Filtrar por producto…"
              opciones={(existencias ?? []).map((e) => ({ valor: e.id, etiqueta: e.nombre, detalle: CATEGORIA[e.categoria] }))}
            />
          ))}
      </div>

      <Tarjeta className="overflow-hidden">
        {vista === 'existencias' &&
          (error && !existencias ? (
            <ErrorCarga error={error} />
          ) : !existencias ? (
            <Cargando />
          ) : existencias.length === 0 ? (
            <Vacio icono={<Boxes size={24} strokeWidth={1.5} />} titulo="Sin productos en el catálogo" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th derecha>Física</Th>
                  <Th derecha>Apartada</Th>
                  <Th derecha>Disponible</Th>
                  <Th derecha>Mínimo</Th>
                  <Th>Avisos</Th>
                </tr>
              </thead>
              <tbody>
                {existencias.map((e) => (
                  <tr key={e.id} className={filaClic} onClick={() => abrirProducto(e.id)}>
                    <Td>
                      <p className="font-medium">{e.nombre}</p>
                      <p className="text-xs text-muted">
                        {CATEGORIA[e.categoria]} · {e.lotes} {e.lotes === 1 ? 'lote' : 'lotes'}
                      </p>
                    </Td>
                    <Td derecha>{numero(e.fisica)}</Td>
                    <Td derecha className="text-muted">
                      {e.reservada > 0 ? numero(e.reservada) : '—'}
                    </Td>
                    <Td derecha>
                      <span className={cx('cifra text-lg font-semibold', e.disponible <= 0 && 'text-bad')}>{numero(e.disponible)}</span> <span className="text-xs text-muted">{plural(e.unidad, e.disponible)}</span>
                    </Td>
                    <Td derecha className="text-muted">
                      {e.stockMinimo > 0 ? numero(e.stockMinimo) : '—'}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {e.porSurtir > 0 && <Insignia tono="rojo">{numero(e.porSurtir)} por surtir</Insignia>}
                        {e.bajoMinimo && e.porSurtir === 0 && <Insignia tono={e.disponible <= 0 ? 'rojo' : 'ambar'}>{e.disponible <= 0 ? 'Agotado' : 'Bajo mínimo'}</Insignia>}
                        {e.porCaducar && <Insignia tono="ambar">Vence {relativa(e.proximaCaducidad)}</Insignia>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          ))}

        {vista === 'lotes' &&
          (!lotes ? (
            <Cargando />
          ) : lotes.length === 0 ? (
            <Vacio icono={<Boxes size={24} strokeWidth={1.5} />} titulo="Sin lotes con existencia">
              {puede('inventario.entrada') && 'Registra la entrada de mercancía para crear el primer lote.'}
            </Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Lote</Th>
                  <Th>Producto</Th>
                  <Th>Ingreso</Th>
                  <Th>Límite de venta</Th>
                  <Th derecha>Física</Th>
                  <Th derecha>Apartada</Th>
                  <Th derecha>Disponible</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => {
                  const dias = l.fechaLimiteVenta ? Math.round((new Date(l.fechaLimiteVenta).getTime() - new Date(hoy()).getTime()) / 86_400_000) : null;
                  return (
                    <tr key={l.id}>
                      <Td>
                        <Folio>{l.codigo}</Folio>
                        <p className="text-xs text-muted">{[l.ubicacion, usuario.sucursalId ? null : l.sucursal.nombre].filter(Boolean).join(' · ') || '—'}</p>
                      </Td>
                      <Td className="font-medium">{l.producto.nombre}</Td>
                      <Td className="whitespace-nowrap text-muted">{fecha(l.fechaIngreso)}</Td>
                      <Td className="whitespace-nowrap">
                        {l.fechaLimiteVenta ? (
                          <>
                            {fecha(l.fechaLimiteVenta)}
                            {dias !== null && dias <= l.producto.diasAlerta && (
                              <Insignia tono={l.caducado ? 'rojo' : 'ambar'} className="ml-2">
                                {l.caducado ? 'Vencido' : relativa(l.fechaLimiteVenta)}
                              </Insignia>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">Sin fecha</span>
                        )}
                      </Td>
                      <Td derecha>{numero(l.cantidadFisica)}</Td>
                      <Td derecha className="text-muted">
                        {l.cantidadReservada > 0 ? numero(l.cantidadReservada) : '—'}
                      </Td>
                      <Td derecha className="font-semibold">
                        {numero(l.disponible)} <span className="text-xs font-normal text-muted">{plural(l.producto.unidad, l.disponible)}</span>
                      </Td>
                      <Td derecha>
                        <div className="flex justify-end gap-1">
                          <Boton tamano="sm" variante="fantasma" onClick={() => abrirProducto(l.productoId, 'movimientos')}>
                            Historial
                          </Boton>
                          {puede('inventario.ajustar') && (
                            <Boton tamano="sm" icono={<SlidersHorizontal size={14} strokeWidth={1.6} />} onClick={() => setAjuste(l)}>
                              Ajustar
                            </Boton>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          ))}

        {vista === 'movimientos' &&
          (!movimientos ? (
            <Cargando />
          ) : movimientos.datos.length === 0 ? (
            <Vacio titulo="Sin movimientos" />
          ) : (
            <>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Movimiento</Th>
                    <Th>Producto y lote</Th>
                    <Th derecha>Cantidad</Th>
                    <Th derecha>Queda física</Th>
                    <Th derecha>Queda apartada</Th>
                    <Th>Referencia</Th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.datos.map((m) => (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap text-muted">{fecha(m.createdAt, { hora: true })}</Td>
                      <Td>
                        <Insignia tono={MOVIMIENTO[m.tipo].tono}>{MOVIMIENTO[m.tipo].nombre}</Insignia>
                      </Td>
                      <Td>
                        <p className="font-medium">{m.producto.nombre}</p>
                        <p className="folio text-muted">{m.lote.codigo}</p>
                      </Td>
                      <Td derecha className={cx('font-semibold', m.tipo === 'RESERVA' || m.tipo === 'LIBERACION' ? '' : m.cantidad < 0 ? 'text-bad' : 'text-ok')}>
                        {m.cantidad > 0 && '+'}
                        {numero(m.cantidad)}
                      </Td>
                      <Td derecha>{numero(m.saldoFisico)}</Td>
                      <Td derecha className="text-muted">
                        {numero(m.saldoReservado)}
                      </Td>
                      <Td>
                        <p className="text-sm">{m.referencia && m.referencia !== m.lote.codigo ? <Folio>{m.referencia}</Folio> : m.motivo}</p>
                        <p className="text-xs text-muted">
                          {m.referencia && m.referencia !== m.lote.codigo && m.motivo ? `${m.motivo} · ` : ''}
                          {m.usuarioNombre}
                        </p>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
              <Paginacion pagina={movimientos.pagina} porPagina={movimientos.porPagina} total={movimientos.total} onCambio={setPagina} />
            </>
          ))}
      </Tarjeta>

      <ModalEntrada abierto={entrada} onCerrar={() => setEntrada(false)} existencias={existencias ?? []} productoInicial={productoId} />
      <ModalAjuste lote={ajuste} onCerrar={() => setAjuste(null)} />
    </div>
  );
}

function ModalEntrada({ abierto, onCerrar, existencias, productoInicial }: { abierto: boolean; onCerrar: () => void; existencias: Existencia[]; productoInicial: number | null }) {
  const aviso = useAviso();
  const { usuario } = useSesion();
  const { data: sucursales } = useApi<Sucursal[]>(abierto && !usuario.sucursalId ? '/sucursales' : null);
  const [f, setF] = useState({ productoId: null as number | null, sucursalId: null as number | null, cantidad: '', costoUnitario: '', ubicacion: '', fechaLimiteVenta: '', notas: '' });
  const [enviando, setEnviando] = useState(false);
  const activas = (sucursales ?? []).filter((s) => s.activa);
  const producto = existencias.find((e) => e.id === f.productoId);

  useEffect(() => {
    if (abierto) setF({ productoId: productoInicial, sucursalId: null, cantidad: '', costoUnitario: '', ubicacion: '', fechaLimiteVenta: '', notas: '' });
  }, [abierto, productoInicial]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.productoId) return aviso.error('Elige el producto');
    setEnviando(true);
    try {
      const r = await api<{ lote: Lote; pedidosSurtidos: string[] }>('/inventario/lotes', {
        cuerpo: {
          productoId: f.productoId,
          ...(usuario.sucursalId ? {} : { sucursalId: f.sucursalId ?? activas[0]?.id }),
          cantidad: Number(f.cantidad),
          costoUnitario: Number(f.costoUnitario) || 0,
          ubicacion: f.ubicacion || undefined,
          fechaLimiteVenta: f.fechaLimiteVenta || undefined,
          notas: f.notas || undefined,
        },
      });
      await refrescarOperacion();
      aviso.exito(r.pedidosSurtidos.length ? `Lote ${r.lote.codigo} registrado. Se apartó mercancía para: ${r.pedidosSurtidos.join(', ')}` : `Lote ${r.lote.codigo} registrado`);
      onCerrar();
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Registrar entrada" descripcion="Crea un lote nuevo con la mercancía que ingresa." ancho="max-w-xl">
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Producto" className="sm:col-span-2">
          <Selector valor={f.productoId} onCambio={(productoId) => setF((x) => ({ ...x, productoId }))} buscable placeholder="Buscar producto…" opciones={existencias.map((e) => ({ valor: e.id, etiqueta: e.nombre, detalle: `${CATEGORIA[e.categoria]} · ${numero(e.disponible)} disponibles` }))} />
        </Campo>
        <Campo etiqueta={`Cantidad${producto ? ` (${plural(producto.unidad, 2)})` : ''}`}>
          <Entrada type="number" min={0.01} step="0.01" required value={f.cantidad} onChange={(e) => setF((x) => ({ ...x, cantidad: e.target.value }))} className="num font-semibold" />
        </Campo>
        <Campo etiqueta="Costo unitario" opcional ayuda="Para valuar el inventario">
          <Entrada type="number" min={0} step="0.01" value={f.costoUnitario} onChange={(e) => setF((x) => ({ ...x, costoUnitario: e.target.value }))} className="num" />
        </Campo>
        <Campo etiqueta="Ubicación" opcional>
          <Entrada maxLength={80} value={f.ubicacion} onChange={(e) => setF((x) => ({ ...x, ubicacion: e.target.value }))} placeholder="Cámara 1, Galpón 3, Bodega…" />
        </Campo>
        <Campo etiqueta="Fecha límite de venta" opcional>
          <Entrada type="date" min={hoy()} value={f.fechaLimiteVenta} onChange={(e) => setF((x) => ({ ...x, fechaLimiteVenta: e.target.value }))} />
        </Campo>
        {activas.length > 1 && (
          <Campo etiqueta="Sucursal que recibe" className="sm:col-span-2">
            <Selector valor={f.sucursalId ?? activas[0].id} onCambio={(sucursalId) => setF((x) => ({ ...x, sucursalId }))} opciones={activas.map((s) => ({ valor: s.id, etiqueta: s.nombre }))} />
          </Campo>
        )}
        <Campo etiqueta="Notas" opcional className="sm:col-span-2">
          <Entrada maxLength={240} value={f.notas} onChange={(e) => setF((x) => ({ ...x, notas: e.target.value }))} placeholder="Proveedor, nacedora, observaciones…" />
        </Campo>
        {producto && producto.porSurtir > 0 && (
          <Aviso tono="ambar" className="sm:col-span-2">
            Hay <strong>{numero(producto.porSurtir)}</strong> vendidos en preventa. Al guardar se apartan de este lote.
          </Aviso>
        )}
        <div className="sm:col-span-2">
          <PieModal>
            <Boton variante="fantasma" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" cargando={enviando}>
              Registrar entrada
            </Boton>
          </PieModal>
        </div>
      </form>
    </Modal>
  );
}

function ModalAjuste({ lote, onCerrar }: { lote: Lote | null; onCerrar: () => void }) {
  const aviso = useAviso();
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (lote) {
      setCantidad(String(lote.cantidadFisica));
      setMotivo('');
    }
  }, [lote]);
  if (!lote) return null;
  const diferencia = Math.round((Number(cantidad) - lote.cantidadFisica) * 100) / 100;
  const bajoApartado = Number(cantidad) < lote.cantidadReservada;

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Ajustar existencia" descripcion={`${lote.producto.nombre} · lote ${lote.codigo}`} ancho="max-w-md">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          try {
            await api(`/inventario/lotes/${lote.id}/ajuste`, { cuerpo: { cantidadFisica: Number(cantidad), motivo } });
            await refrescarOperacion();
            aviso.exito('Existencia ajustada');
            onCerrar();
          } catch (err) {
            aviso.error(mensajeDe(err));
          } finally {
            setEnviando(false);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-center">
          <div className="bg-surface-2 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">En sistema</p>
            <p className="cifra mt-0.5 text-2xl font-semibold">{numero(lote.cantidadFisica)}</p>
          </div>
          <div className="bg-surface-2 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Apartado</p>
            <p className="cifra mt-0.5 text-2xl font-semibold">{numero(lote.cantidadReservada)}</p>
          </div>
        </div>
        <Campo
          etiqueta={`Cantidad real contada (${plural(lote.producto.unidad, 2)})`}
          ayuda={
            bajoApartado ? (
              <span className="text-bad">No puede quedar por debajo de lo apartado en pedidos</span>
            ) : diferencia !== 0 && cantidad !== '' ? (
              <span className={diferencia < 0 ? 'text-bad' : 'text-ok'}>
                Diferencia: {diferencia > 0 ? '+' : ''}
                {numero(diferencia)}
              </span>
            ) : undefined
          }
        >
          <Entrada autoFocus type="number" min={0} step="0.01" required value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="num h-12 text-lg font-semibold" />
        </Campo>
        <Campo etiqueta="Motivo">
          <AreaTexto rows={2} required minLength={3} maxLength={240} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Conteo físico, merma, mortalidad, rotura…" />
        </Campo>
        <PieModal>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={enviando} disabled={diferencia === 0 || bajoApartado || motivo.trim().length < 3}>
            Guardar ajuste
          </Boton>
        </PieModal>
      </form>
    </Modal>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Cargando />}>
      <Inventario />
    </Suspense>
  );
}
