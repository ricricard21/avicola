'use client';

import { Building2, Check, Minus, Plus, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SinPermiso } from '@/components/shell';
import { Boton, Campo, Cargando, cx, Encabezado, Entrada, ErrorCarga, filaClic, Insignia, Modal, Paginacion, PieModal, Pestanas, Selector, Tabla, Tarjeta, Td, Th, useAviso, Vacio } from '@/components/ui';
import { api, mensajeDe, refrescar, useApi } from '@/lib/api';
import { MODULO, ROL } from '@/lib/etiquetas';
import { fecha } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import type { Pagina, Rol, Sucursal, Usuario } from '@/lib/tipos';

interface Catalogo {
  permisos: { clave: string; descripcion: string; modulo: string }[];
  roles: { rol: Rol; nombre: string; permisos: string[] }[];
}
interface Registro {
  id: number;
  usuarioNombre: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  resumen: string | null;
  createdAt: string;
}
type Vista = 'usuarios' | 'sucursales' | 'permisos' | 'bitacora';

export default function Configuracion() {
  const { puede } = useSesion();
  const vistas = useMemo(
    () =>
      [
        puede('config.usuarios') && { valor: 'usuarios' as const, etiqueta: 'Usuarios' },
        puede('config.catalogos') && { valor: 'sucursales' as const, etiqueta: 'Sucursales' },
        puede('config.usuarios') && { valor: 'permisos' as const, etiqueta: 'Permisos por rol' },
        puede('config.bitacora') && { valor: 'bitacora' as const, etiqueta: 'Bitácora' },
      ].filter(Boolean) as { valor: Vista; etiqueta: string }[],
    [puede],
  );
  const [vista, setVista] = useState<Vista | null>(null);
  const actual = vista ?? vistas[0]?.valor;
  if (!actual) return <SinPermiso />;

  return (
    <div className="entrada space-y-6">
      <Encabezado titulo="Configuración" descripcion="Usuarios, permisos, sucursales y bitácora de cambios." />
      <Pestanas className="w-fit max-w-full" valor={actual} onCambio={setVista} opciones={vistas} />
      {actual === 'usuarios' && <Usuarios />}
      {actual === 'sucursales' && <Sucursales />}
      {actual === 'permisos' && <Permisos />}
      {actual === 'bitacora' && <Bitacora />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Usuarios                                                           */
/* ------------------------------------------------------------------ */

const USUARIO_VACIO = { nombre: '', email: '', password: '', rol: 'VENTAS' as Rol, sucursalId: 0, activo: true, extra: [] as string[], denegados: [] as string[] };

function Usuarios() {
  const aviso = useAviso();
  const { usuario: yo } = useSesion();
  const { data: usuarios, error } = useApi<Usuario[]>('/usuarios');
  const { data: catalogo } = useApi<Catalogo>('/usuarios/permisos');
  const { data: sucursales } = useApi<Sucursal[]>('/sucursales');
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);
  const [f, setF] = useState(USUARIO_VACIO);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!editando) return;
    setF(
      editando === 'nuevo'
        ? USUARIO_VACIO
        : { nombre: editando.nombre, email: editando.email, password: '', rol: editando.rol, sucursalId: editando.sucursalId ?? 0, activo: editando.activo, extra: editando.permisosExtra, denegados: editando.permisosDenegados },
    );
  }, [editando]);

  const delRol = new Set(catalogo?.roles.find((r) => r.rol === f.rol)?.permisos ?? []);
  const esNuevo = editando === 'nuevo';
  const soyYo = !esNuevo && editando?.id === yo.id;

  /** Cada permiso tiene tres posiciones: lo que marca el rol, concedido extra o retirado */
  function alternar(clave: string) {
    setF((x) => {
      const base = delRol.has(clave);
      const activo = (base && !x.denegados.includes(clave)) || x.extra.includes(clave);
      if (base) return { ...x, denegados: activo ? [...x.denegados, clave] : x.denegados.filter((p) => p !== clave) };
      return { ...x, extra: activo ? x.extra.filter((p) => p !== clave) : [...x.extra, clave] };
    });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const cuerpo = {
        nombre: f.nombre,
        email: f.email,
        rol: f.rol,
        sucursalId: f.sucursalId || null,
        // Solo se guardan las excepciones que aplican al rol elegido.
        permisosExtra: f.extra.filter((p) => !delRol.has(p)),
        permisosDenegados: f.denegados.filter((p) => delRol.has(p)),
        ...(f.password ? { password: f.password } : {}),
        ...(esNuevo ? {} : { activo: f.activo }),
      };
      await api(esNuevo ? '/usuarios' : `/usuarios/${(editando as Usuario).id}`, { metodo: esNuevo ? 'POST' : 'PATCH', cuerpo });
      await refrescar('usuarios', 'auth');
      aviso.exito(esNuevo ? 'Usuario creado' : 'Usuario actualizado');
      setEditando(null);
    } catch (err) {
      aviso.error(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  const modulos = useMemo(() => {
    const grupos = new Map<string, Catalogo['permisos']>();
    for (const p of catalogo?.permisos ?? []) grupos.set(p.modulo, [...(grupos.get(p.modulo) ?? []), p]);
    return [...grupos];
  }, [catalogo]);

  return (
    <>
      <Tarjeta className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h3 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Equipo</h3>
          <Boton tamano="sm" variante="primario" icono={<UserPlus size={15} strokeWidth={1.7} />} onClick={() => setEditando('nuevo')}>
            Nuevo usuario
          </Boton>
        </div>
        {error && !usuarios ? (
          <ErrorCarga error={error} />
        ) : !usuarios ? (
          <Cargando />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Sucursal</Th>
                <Th>Último acceso</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={cx(filaClic, !u.activo && 'opacity-50')} onClick={() => setEditando(u)}>
                  <Td>
                    <p className="font-medium">{u.nombre}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </Td>
                  <Td>
                    {u.rolNombre}
                    {u.permisosExtra.length + u.permisosDenegados.length > 0 && <span className="block text-xs text-accent-text">con permisos personalizados</span>}
                  </Td>
                  <Td className="text-muted">{u.sucursal?.nombre ?? 'Todas'}</Td>
                  <Td className="whitespace-nowrap text-muted">{u.ultimoAcceso ? fecha(u.ultimoAcceso, { hora: true }) : 'Nunca'}</Td>
                  <Td derecha>{!u.activo && <Insignia>Desactivado</Insignia>}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <Modal abierto={!!editando} onCerrar={() => setEditando(null)} titulo={esNuevo ? 'Nuevo usuario' : 'Editar usuario'} ancho="max-w-2xl">
        <form onSubmit={guardar} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre">
              <Entrada autoFocus required minLength={2} maxLength={120} value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} />
            </Campo>
            <Campo etiqueta="Correo (para iniciar sesión)">
              <Entrada type="email" required value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} />
            </Campo>
            <Campo etiqueta="Rol">
              <Selector deshabilitado={soyYo} valor={f.rol} onCambio={(rol) => setF((x) => ({ ...x, rol }))} opciones={(Object.keys(ROL) as Rol[]).map((r) => ({ valor: r, etiqueta: ROL[r] }))} />
            </Campo>
            <Campo etiqueta="Sucursal" ayuda="Con una sucursal asignada solo ve la operación de esa sucursal">
              <Selector valor={f.sucursalId} onCambio={(sucursalId) => setF((x) => ({ ...x, sucursalId }))} opciones={[{ valor: 0, etiqueta: 'Todas las sucursales' }, ...(sucursales ?? []).filter((s) => s.activa).map((s) => ({ valor: s.id, etiqueta: s.nombre }))]} />
            </Campo>
            <Campo etiqueta={esNuevo ? 'Contraseña inicial' : 'Restablecer contraseña'} opcional={!esNuevo} ayuda="Mínimo 8 caracteres" className="sm:col-span-2">
              <Entrada type="text" autoComplete="off" required={esNuevo} minLength={8} value={f.password} onChange={(e) => setF((x) => ({ ...x, password: e.target.value }))} placeholder={esNuevo ? '' : 'Dejar vacío para no cambiarla'} className="font-mono" />
            </Campo>
          </div>

          <div>
            <p className="text-[13px] font-medium">Permisos</p>
            <p className="mb-3 text-xs text-muted">Parten del rol. Marca o desmarca para hacer excepciones solo para esta persona.</p>
            <div className="grid gap-x-6 gap-y-4 rounded-2xl border border-line p-4 sm:grid-cols-2">
              {modulos.map(([modulo, permisos]) => (
                <div key={modulo}>
                  <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{MODULO[modulo] ?? modulo}</p>
                  <ul className="space-y-1">
                    {permisos.map((p) => {
                      const base = delRol.has(p.clave);
                      const activo = (base && !f.denegados.includes(p.clave)) || f.extra.includes(p.clave);
                      const excepcion = activo !== base;
                      return (
                        <li key={p.clave}>
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 text-sm hover:bg-surface-2">
                            <input type="checkbox" checked={activo} onChange={() => alternar(p.clave)} className="mt-0.5 size-4 shrink-0 accent-(--accent)" />
                            <span className={cx(!activo && 'text-muted')}>
                              {p.descripcion}
                              {excepcion && <span className={cx('ml-1.5 text-xs font-medium', activo ? 'text-ok' : 'text-bad')}>{activo ? 'concedido' : 'retirado'}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {!esNuevo && !soyYo && (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line p-4">
              <input type="checkbox" checked={f.activo} onChange={(e) => setF((x) => ({ ...x, activo: e.target.checked }))} className="size-4 accent-(--accent)" />
              <span className="text-sm">
                <span className="font-medium">Usuario activo</span>
                <span className="block text-muted">Al desactivarlo pierde el acceso de inmediato; su historial se conserva.</span>
              </span>
            </label>
          )}

          <PieModal>
            <Boton variante="fantasma" onClick={() => setEditando(null)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" cargando={enviando}>
              {esNuevo ? 'Crear usuario' : 'Guardar cambios'}
            </Boton>
          </PieModal>
        </form>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sucursales                                                         */
/* ------------------------------------------------------------------ */

function Sucursales() {
  const aviso = useAviso();
  const { data, error } = useApi<Sucursal[]>('/sucursales');
  const [editando, setEditando] = useState<Sucursal | 'nueva' | null>(null);
  const [f, setF] = useState({ nombre: '', direccion: '', activa: true });
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (editando) setF(editando === 'nueva' ? { nombre: '', direccion: '', activa: true } : { nombre: editando.nombre, direccion: editando.direccion ?? '', activa: editando.activa });
  }, [editando]);

  return (
    <>
      <Tarjeta className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h3 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Sucursales y puntos de venta</h3>
          <Boton tamano="sm" variante="primario" icono={<Plus size={15} strokeWidth={1.8} />} onClick={() => setEditando('nueva')}>
            Nueva sucursal
          </Boton>
        </div>
        {error && !data ? (
          <ErrorCarga error={error} />
        ) : !data ? (
          <Cargando filas={3} />
        ) : data.length === 0 ? (
          <Vacio icono={<Building2 size={24} strokeWidth={1.5} />} titulo="Sin sucursales" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {data.map((s) => (
              <li key={s.id} className={cx('flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2/60', !s.activa && 'opacity-50')} onClick={() => setEditando(s)}>
                <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-muted">
                  <Building2 size={18} strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.nombre}</span>
                  <span className="block truncate text-xs text-muted">{s.direccion || 'Sin dirección'}</span>
                </span>
                {!s.activa && <Insignia>Inactiva</Insignia>}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Modal abierto={!!editando} onCerrar={() => setEditando(null)} titulo={editando === 'nueva' ? 'Nueva sucursal' : 'Editar sucursal'} ancho="max-w-md">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setEnviando(true);
            try {
              const nueva = editando === 'nueva';
              await api(nueva ? '/sucursales' : `/sucursales/${(editando as Sucursal).id}`, { metodo: nueva ? 'POST' : 'PATCH', cuerpo: { nombre: f.nombre, direccion: f.direccion || undefined, ...(nueva ? {} : { activa: f.activa }) } });
              await refrescar('sucursales');
              aviso.exito('Sucursal guardada');
              setEditando(null);
            } catch (err) {
              aviso.error(mensajeDe(err));
            } finally {
              setEnviando(false);
            }
          }}
        >
          <Campo etiqueta="Nombre">
            <Entrada autoFocus required minLength={2} maxLength={120} value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} />
          </Campo>
          <Campo etiqueta="Dirección" opcional>
            <Entrada maxLength={240} value={f.direccion} onChange={(e) => setF((x) => ({ ...x, direccion: e.target.value }))} />
          </Campo>
          {editando !== 'nueva' && (
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={f.activa} onChange={(e) => setF((x) => ({ ...x, activa: e.target.checked }))} className="size-4 accent-(--accent)" />
              Sucursal activa
            </label>
          )}
          <PieModal>
            <Boton variante="fantasma" onClick={() => setEditando(null)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" cargando={enviando}>
              Guardar
            </Boton>
          </PieModal>
        </form>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Matriz de permisos por rol                                         */
/* ------------------------------------------------------------------ */

function Permisos() {
  const { data, error } = useApi<Catalogo>('/usuarios/permisos');
  if (error && !data) return <ErrorCarga error={error} />;
  if (!data) return <Cargando />;
  let moduloPrevio = '';
  return (
    <Tarjeta className="overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <h3 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Qué puede hacer cada rol</h3>
        <p className="mt-1 text-sm text-muted">Es la base de cada puesto. Las excepciones por persona se configuran en su usuario.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr>
              <Th>Permiso</Th>
              {data.roles.map((r) => (
                <Th key={r.rol} className="text-center whitespace-normal">
                  <span className="mx-auto block w-20 leading-tight">{r.nombre}</span>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.permisos.map((p) => {
              const cabecera = p.modulo !== moduloPrevio;
              moduloPrevio = p.modulo;
              return [
                cabecera && (
                  <tr key={`m-${p.modulo}`}>
                    <td colSpan={data.roles.length + 1} className="bg-surface-2/60 px-5 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                      {MODULO[p.modulo] ?? p.modulo}
                    </td>
                  </tr>
                ),
                <tr key={p.clave}>
                  <Td>{p.descripcion}</Td>
                  {data.roles.map((r) => (
                    <Td key={r.rol} className="text-center">
                      {r.permisos.includes(p.clave) ? <Check size={16} strokeWidth={2} className="mx-auto text-ok" /> : <Minus size={14} strokeWidth={1.5} className="mx-auto text-line-strong" />}
                    </Td>
                  ))}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------ */
/*  Bitácora                                                           */
/* ------------------------------------------------------------------ */

const ENTIDADES = [
  { valor: '', etiqueta: 'Todo' },
  { valor: 'pedido', etiqueta: 'Pedidos y pagos' },
  { valor: 'pollitanda', etiqueta: 'Pollitandas' },
  { valor: 'lote', etiqueta: 'Inventario' },
  { valor: 'cliente', etiqueta: 'Clientes' },
  { valor: 'producto', etiqueta: 'Productos' },
  { valor: 'usuario', etiqueta: 'Usuarios y accesos' },
];

function Bitacora() {
  const [entidad, setEntidad] = useState('');
  const [pagina, setPagina] = useState(1);
  const { data, error } = useApi<Pagina<Registro>>(`/bitacora?pagina=${pagina}${entidad ? `&entidad=${entidad}` : ''}`);
  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h3 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Bitácora de cambios</h3>
          <p className="mt-1 text-sm text-muted">Quién hizo qué y cuándo. No se puede editar ni borrar.</p>
        </div>
        <Selector
          className="w-52"
          valor={entidad}
          onCambio={(e) => {
            setEntidad(e);
            setPagina(1);
          }}
          opciones={ENTIDADES}
        />
      </div>
      {error && !data ? (
        <ErrorCarga error={error} />
      ) : !data ? (
        <Cargando />
      ) : data.datos.length === 0 ? (
        <Vacio titulo="Sin registros" />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Usuario</Th>
                <Th>Acción</Th>
                <Th>Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {data.datos.map((b) => (
                <tr key={b.id}>
                  <Td className="whitespace-nowrap text-muted">{fecha(b.createdAt, { hora: true })}</Td>
                  <Td className="whitespace-nowrap font-medium">{b.usuarioNombre}</Td>
                  <Td>
                    <span className="folio text-muted">{b.accion.replace(/_/g, ' ')}</span>
                  </Td>
                  <Td className="text-ink/85">{b.resumen ?? `${b.entidad} ${b.entidadId ?? ''}`}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambio={setPagina} />
        </>
      )}
    </Tarjeta>
  );
}
