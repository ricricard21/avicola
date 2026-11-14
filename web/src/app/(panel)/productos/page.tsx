'use client';

import { Package, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SinPermiso } from '@/components/shell';
import { Boton, Buscador, Campo, Cargando, cx, Encabezado, Entrada, ErrorCarga, filaClic, Insignia, Modal, PieModal, Pestanas, Selector, Tabla, Tarjeta, Td, Th, useAviso, Vacio } from '@/components/ui';
import { api, mensajeDe, refrescar, useApi } from '@/lib/api';
import { CATEGORIA } from '@/lib/etiquetas';
import { numero, pesos } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Categoria, Producto } from '@/lib/tipos';

const VACIO = { sku: '', nombre: '', categoria: 'HUEVO' as Categoria, unidad: 'caja', precio: '', stockMinimo: '', diasAlerta: '3', activo: true };

export default function Productos() {
  const { puede } = useSesion();
  const aviso = useAviso();
  const { data, error, mutate } = useApi<Producto[]>(puede('productos.ver') ? '/productos?todos=1' : null);
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<Producto | 'nuevo' | null>(null);
  const [f, setF] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const editar = puede('productos.editar');

  useEffect(() => {
    if (!editando) return;
    setF(
      editando === 'nuevo'
        ? VACIO
        : { sku: editando.sku, nombre: editando.nombre, categoria: editando.categoria, unidad: editando.unidad, precio: String(editando.precio), stockMinimo: String(editando.stockMinimo || ''), diasAlerta: String(editando.diasAlerta), activo: editando.activo },
    );
  }, [editando]);

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (data ?? []).filter((p) => (!categoria || p.categoria === categoria) && (!t || p.nombre.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t)));
  }, [data, categoria, texto]);

  if (!puede('productos.ver')) return <SinPermiso />;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const cuerpo = { sku: f.sku, nombre: f.nombre, categoria: f.categoria, unidad: f.unidad, precio: Number(f.precio), stockMinimo: Number(f.stockMinimo) || 0, diasAlerta: Number(f.diasAlerta) || 0, activo: f.activo };
      const esNuevo = editando === 'nuevo';
      await api(esNuevo ? '/productos' : `/productos/${(editando as Producto).id}`, { metodo: esNuevo ? 'POST' : 'PATCH', cuerpo });
      await refrescar('productos', 'inventario', 'dashboard');
      aviso.exito(esNuevo ? 'Producto agregado al catálogo' : 'Producto actualizado');
      setEditando(null);
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Productos" descripcion="Catálogo de huevo, pollitos, aves, alimento, empaques e insumos, con su precio de lista y existencia mínima.">
        {editar && (
          <Boton variante="primario" icono={<Plus size={17} strokeWidth={1.8} />} onClick={() => setEditando('nuevo')}>
            Nuevo producto
          </Boton>
        )}
      </Encabezado>

      <div className="flex flex-wrap items-center gap-3">
        <Pestanas valor={categoria} onCambio={setCategoria} opciones={[{ valor: '' as const, etiqueta: 'Todo' }, ...(Object.keys(CATEGORIA) as Categoria[]).map((c) => ({ valor: c, etiqueta: CATEGORIA[c] }))]} />
        <Buscador className="min-w-52 flex-1 sm:max-w-xs" valor={texto} onCambio={setTexto} placeholder="Nombre o clave" />
      </div>

      <Tarjeta className="overflow-hidden">
        {error && !data ? (
          <ErrorCarga error={error} onReintentar={() => mutate()} />
        ) : !data ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Vacio icono={<Package size={24} strokeWidth={1.5} />} titulo="Sin productos" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Categoría</Th>
                <Th>Unidad</Th>
                <Th derecha>Precio de lista</Th>
                <Th derecha>Existencia mínima</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} className={cx(editar && filaClic, !p.activo && 'opacity-50')} onClick={() => editar && setEditando(p)}>
                  <Td>
                    <p className="font-medium">{p.nombre}</p>
                    <p className="folio text-muted">{p.sku}</p>
                  </Td>
                  <Td>{CATEGORIA[p.categoria]}</Td>
                  <Td className="text-muted">{p.unidad}</Td>
                  <Td derecha className="font-medium">
                    {pesos(p.precio)}
                  </Td>
                  <Td derecha>{p.stockMinimo > 0 ? numero(p.stockMinimo) : <span className="text-muted">—</span>}</Td>
                  <Td derecha>{!p.activo && <Insignia>Inactivo</Insignia>}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <Modal abierto={!!editando} onCerrar={() => setEditando(null)} titulo={editando === 'nuevo' ? 'Nuevo producto' : 'Editar producto'} ancho="max-w-xl">
        <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre" className="sm:col-span-2">
            <Entrada autoFocus required minLength={2} maxLength={160} value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} placeholder="Huevo blanco · caja 360 pzas" />
          </Campo>
          <Campo etiqueta="Clave (SKU)">
            <Entrada required minLength={2} maxLength={30} value={f.sku} onChange={(e) => setF((x) => ({ ...x, sku: e.target.value.toUpperCase() }))} placeholder="HUE-BCO-360" className="font-mono" />
          </Campo>
          <Campo etiqueta="Categoría">
            <Selector valor={f.categoria} onCambio={(categoria) => setF((x) => ({ ...x, categoria }))} opciones={(Object.keys(CATEGORIA) as Categoria[]).map((c) => ({ valor: c, etiqueta: CATEGORIA[c] }))} />
          </Campo>
          <Campo etiqueta="Unidad de venta" ayuda="En singular: caja, pollito, bulto…">
            <Entrada required maxLength={30} value={f.unidad} onChange={(e) => setF((x) => ({ ...x, unidad: e.target.value.toLowerCase() }))} />
          </Campo>
          <Campo etiqueta="Precio de lista">
            <Entrada type="number" min={0} step="0.01" required value={f.precio} onChange={(e) => setF((x) => ({ ...x, precio: e.target.value }))} className="num" />
          </Campo>
          <Campo etiqueta="Existencia mínima" opcional ayuda="Avisa cuando lo disponible baje de aquí">
            <Entrada type="number" min={0} step="0.01" value={f.stockMinimo} onChange={(e) => setF((x) => ({ ...x, stockMinimo: e.target.value }))} className="num" />
          </Campo>
          <Campo etiqueta="Aviso de vencimiento" ayuda="Días antes de la fecha límite de venta">
            <Entrada type="number" min={0} step={1} value={f.diasAlerta} onChange={(e) => setF((x) => ({ ...x, diasAlerta: e.target.value }))} className="num" />
          </Campo>
          {editando !== 'nuevo' && (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line p-4 sm:col-span-2">
              <input type="checkbox" checked={f.activo} onChange={(e) => setF((x) => ({ ...x, activo: e.target.checked }))} className="size-4 accent-(--accent)" />
              <span className="text-sm">
                <span className="font-medium">Producto activo</span>
                <span className="block text-muted">Los inactivos ya no aparecen al vender, pero conservan su historial.</span>
              </span>
            </label>
          )}
          <div className="sm:col-span-2">
            <PieModal>
              <Boton variante="fantasma" onClick={() => setEditando(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" variante="primario" cargando={enviando}>
                Guardar
              </Boton>
            </PieModal>
          </div>
        </form>
      </Modal>
    </div>
  );
}
