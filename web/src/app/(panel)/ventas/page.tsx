'use client';

import { Bird, Plus, ShoppingCart } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Folio, InsigniaPedido } from '@/components/negocio';
import { SinPermiso } from '@/components/shell';
import { BotonEnlace, Buscador, Cargando, cx, Encabezado, ErrorCarga, filaClic, Paginacion, Pestanas, Selector, Tabla, Tarjeta, Td, Th, Vacio } from '@/components/ui';
import { useApi } from '@/lib/api';
import { ESTADO_PEDIDO } from '@/lib/etiquetas';
import { fecha, pesos, relativa } from '@/lib/formato';
import { conParametros, useRetardo } from '@/lib/hooks';
import { useSesion } from '@/lib/sesion';
import type { EstadoPedido, Pagina, PedidoResumen } from '@/lib/tipos';

type Grupo = 'activos' | 'cotizaciones' | 'cerrados' | 'todos';
const ESTADOS_POR_GRUPO: Record<Grupo, EstadoPedido[]> = {
  activos: ['RECIBIDO', 'PREPARADO', 'EN_RUTA', 'INCIDENCIA'],
  cotizaciones: [],
  cerrados: ['ENTREGADO', 'CANCELADO'],
  todos: [],
};

function Ventas() {
  const { puede } = useSesion();
  const router = useRouter();
  const parametros = useSearchParams();
  const estadoInicial = (parametros.get('estado') as EstadoPedido | null) ?? '';
  const [grupo, setGrupo] = useState<Grupo>(
    (parametros.get('grupo') as Grupo | null) ?? (estadoInicial ? ((Object.keys(ESTADOS_POR_GRUPO) as Grupo[]).find((g) => ESTADOS_POR_GRUPO[g].includes(estadoInicial)) ?? 'todos') : 'activos'),
  );
  const [estado, setEstado] = useState<EstadoPedido | ''>(estadoInicial);
  const [texto, setTexto] = useState('');
  const [pagina, setPagina] = useState(1);
  const q = useRetardo(texto);

  const { data, error, mutate } = useApi<Pagina<PedidoResumen> & { conteo: Record<string, number> }>(
    puede('ventas.ver') ? conParametros('/pedidos', { grupo: grupo === 'todos' || estado ? '' : grupo, estado, q, pagina, porPagina: 25 }) : null,
  );
  if (!puede('ventas.ver')) return <SinPermiso />;

  const n = (e: EstadoPedido) => data?.conteo[e] ?? 0;
  const activos = n('RECIBIDO') + n('PREPARADO') + n('EN_RUTA') + n('INCIDENCIA');

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Ventas" descripcion="Cotizaciones y pedidos, desde que se capturan hasta que se entregan.">
        {puede('ventas.crear') && (
          <BotonEnlace href="/ventas/nuevo" variante="primario" icono={<Plus size={17} strokeWidth={1.8} />}>
            Nueva venta
          </BotonEnlace>
        )}
      </Encabezado>

      <div className="flex flex-wrap items-center gap-3">
        <Pestanas
          valor={grupo}
          onCambio={(g) => {
            setGrupo(g);
            setEstado('');
            setPagina(1);
          }}
          opciones={[
            { valor: 'activos', etiqueta: 'En proceso', cuenta: data ? activos : undefined },
            { valor: 'cotizaciones', etiqueta: 'Cotizaciones', cuenta: data ? n('COTIZACION') : undefined },
            { valor: 'cerrados', etiqueta: 'Cerrados' },
            { valor: 'todos', etiqueta: 'Todos' },
          ]}
        />
        {ESTADOS_POR_GRUPO[grupo].length > 0 && (
          <Selector
            className="w-48"
            valor={estado}
            onCambio={(e) => {
              setEstado(e);
              setPagina(1);
            }}
            opciones={[{ valor: '' as const, etiqueta: 'Todos los estados' }, ...ESTADOS_POR_GRUPO[grupo].map((e) => ({ valor: e, etiqueta: `${ESTADO_PEDIDO[e].nombre} (${n(e)})` }))]}
          />
        )}
        <Buscador
          className="min-w-56 flex-1 sm:max-w-xs"
          valor={texto}
          onCambio={(v) => {
            setTexto(v);
            setPagina(1);
          }}
          placeholder="Folio o cliente"
        />
      </div>

      <Tarjeta className="overflow-hidden">
        {error && !data ? (
          <ErrorCarga error={error} onReintentar={() => mutate()} />
        ) : !data ? (
          <Cargando />
        ) : data.datos.length === 0 ? (
          <Vacio icono={<ShoppingCart size={24} strokeWidth={1.5} />} titulo="Nada por aquí">
            No hay pedidos con estos filtros.
          </Vacio>
        ) : (
          <>
            <Tabla>
              <thead>
                <tr>
                  <Th>Folio</Th>
                  <Th>Cliente</Th>
                  <Th>Estado</Th>
                  <Th>Entrega</Th>
                  <Th derecha>Total</Th>
                  <Th derecha>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {data.datos.map((p) => {
                  const abierto = ['RECIBIDO', 'PREPARADO', 'EN_RUTA', 'INCIDENCIA'].includes(p.estado);
                  const atrasado = abierto && !!p.fechaEntrega && relativa(p.fechaEntrega).startsWith('hace') ;
                  return (
                    <tr key={p.id} className={filaClic} onClick={() => router.push(`/ventas/${p.id}`)}>
                      <Td className="whitespace-nowrap">
                        <Folio>{p.folio}</Folio>
                        <p className="text-xs text-muted">{fecha(p.createdAt)}</p>
                      </Td>
                      <Td>
                        <p className="font-medium">{p.cliente?.nombre}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          {p.pollitanda && (
                            <span className="inline-flex items-center gap-1 text-accent-text">
                              <Bird size={12} strokeWidth={1.6} /> Pollitanda ·
                            </span>
                          )}
                          {p.vendedor?.nombre ?? 'Sin vendedor'}
                        </p>
                      </Td>
                      <Td>
                        <InsigniaPedido estado={p.estado} />
                      </Td>
                      <Td className="whitespace-nowrap">
                        {p.fechaEntrega ? (
                          <>
                            <span>{fecha(p.fechaEntrega)}</span>
                            {abierto && <span className={cx('block text-xs first-letter:uppercase', atrasado ? 'text-bad' : 'text-muted')}>{relativa(p.fechaEntrega)}</span>}
                          </>
                        ) : (
                          <span className="text-muted">Sin fecha</span>
                        )}
                      </Td>
                      <Td derecha className="font-medium">
                        {pesos(p.total)}
                      </Td>
                      <Td derecha className={p.saldo > 0 ? 'font-medium text-bad' : 'text-muted'}>
                        {p.estado === 'COTIZACION' || p.estado === 'CANCELADO' ? '—' : p.saldo > 0 ? pesos(p.saldo) : 'Pagado'}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
            <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambio={setPagina} />
          </>
        )}
      </Tarjeta>
    </div>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Cargando />}>
      <Ventas />
    </Suspense>
  );
}
