'use client';

import { UserPlus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InsigniaCliente, ModalCliente } from '@/components/negocio';
import { SinPermiso } from '@/components/shell';
import { Boton, Buscador, Cargando, cx, Encabezado, ErrorCarga, filaClic, Insignia, Paginacion, Pestanas, Tabla, Tarjeta, Td, Th, Vacio } from '@/components/ui';
import { useApi } from '@/lib/api';
import { ETAPAS } from '@/lib/etiquetas';
import { pesos, telefono } from '@/lib/formato';
import { conParametros, useRetardo } from '@/lib/hooks';
import { useSesion } from '@/lib/sesion';
import type { Cliente, Pagina } from '@/lib/tipos';

type Filtro = '' | 'CLIENTE' | 'DISTRIBUIDOR' | 'PROSPECTO' | 'saldo';

export default function Clientes() {
  const { puede } = useSesion();
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('');
  const [pagina, setPagina] = useState(1);
  const [nuevo, setNuevo] = useState(false);
  const q = useRetardo(texto);

  const { data, error, mutate } = useApi<Pagina<Cliente>>(
    puede('clientes.ver') ? conParametros('/clientes', { q, tipo: filtro === 'saldo' ? '' : filtro, conSaldo: filtro === 'saldo', pagina, porPagina: 25 }) : null,
  );
  if (!puede('clientes.ver')) return <SinPermiso />;

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Clientes" descripcion="Clientes, distribuidores y prospectos, con su historial de compras, pagos y seguimiento.">
        {puede('clientes.editar') && (
          <Boton variante="primario" icono={<UserPlus size={17} strokeWidth={1.7} />} onClick={() => setNuevo(true)}>
            Nuevo cliente
          </Boton>
        )}
      </Encabezado>

      <div className="flex flex-wrap items-center gap-3">
        <Pestanas
          valor={filtro}
          onCambio={(f) => {
            setFiltro(f);
            setPagina(1);
          }}
          opciones={[
            { valor: '', etiqueta: 'Todos' },
            { valor: 'CLIENTE', etiqueta: 'Clientes' },
            { valor: 'DISTRIBUIDOR', etiqueta: 'Distribuidores' },
            { valor: 'PROSPECTO', etiqueta: 'Prospectos' },
            { valor: 'saldo', etiqueta: 'Con saldo' },
          ]}
        />
        <Buscador
          className="min-w-56 flex-1 sm:max-w-xs"
          valor={texto}
          onCambio={(v) => {
            setTexto(v);
            setPagina(1);
          }}
          placeholder="Nombre, teléfono o localidad"
        />
      </div>

      <Tarjeta className="overflow-hidden">
        {error && !data ? (
          <ErrorCarga error={error} onReintentar={() => mutate()} />
        ) : !data ? (
          <Cargando />
        ) : data.datos.length === 0 ? (
          <Vacio icono={<Users size={24} strokeWidth={1.5} />} titulo={q || filtro ? 'Sin resultados' : 'Aún no hay clientes'}>
            {q || filtro ? 'Prueba con otra búsqueda o cambia el filtro.' : 'Registra el primero con el botón "Nuevo cliente".'}
          </Vacio>
        ) : (
          <>
            <Tabla>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Tipo</Th>
                  <Th>Teléfono</Th>
                  <Th derecha>Comprado</Th>
                  <Th derecha>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {data.datos.map((c) => (
                  <tr key={c.id} className={filaClic} onClick={() => router.push(`/clientes/${c.id}`)}>
                    <Td>
                      <p className="font-medium">{c.nombre}</p>
                      <p className="text-xs text-muted">{[c.direccion, c.municipio].filter(Boolean).join(' · ') || 'Sin dirección'}</p>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <InsigniaCliente tipo={c.tipo} />
                        {c.etapa && <Insignia>{ETAPAS[c.etapa]}</Insignia>}
                      </div>
                    </Td>
                    <Td className="num whitespace-nowrap">{telefono(c.whatsapp || c.telefono)}</Td>
                    <Td derecha>{c.comprado ? pesos(c.comprado) : <span className="text-muted">—</span>}</Td>
                    <Td derecha className={cx('font-medium', c.saldo ? 'text-bad' : 'text-muted')}>
                      {c.saldo ? pesos(c.saldo) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
            <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambio={setPagina} />
          </>
        )}
      </Tarjeta>

      <ModalCliente abierto={nuevo} onCerrar={() => setNuevo(false)} onGuardado={(c) => router.push(`/clientes/${c.id}`)} />
    </div>
  );
}
