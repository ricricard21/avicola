/**
 * Motor de la demostración: las mismas reglas de negocio de la API (carpeta /api),
 * ejecutadas en el navegador sobre la base en memoria. Responde las mismas rutas
 * con las mismas formas de datos, así el panel no distingue entre uno y otro.
 */
import { NOMBRES_ROL, PERMISOS, PERMISOS_POR_ROL, permisosEfectivos } from '../../../api/src/common/permisos';
import {
  bd, Cliente, EstadoPedido, Inscripcion, Item, Lote, MetodoPago, Notificacion, nuevoId, Pedido, Pollitanda, Producto, Rol, Usuario,
} from './bd';

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

const ZONA = 'America/Mexico_City';
const EMPRESA = 'Avícola San Ángel';

export class ErrorHttp extends Error {
  constructor(readonly estado: number, mensaje: string, readonly codigo?: string) {
    super(mensaje);
  }
}

export interface Sesion { id: number; nombre: string; email: string; rol: Rol; sucursalId: number | null; permisos: string[] }
type Autor = Pick<Sesion, 'id' | 'nombre'> | null;
type Q = Record<string, string | undefined>;

export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const ahora = () => new Date().toISOString();
export const fechaLocal = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
export const hoy = () => fechaLocal(new Date());
export function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);
const primerDia = (f: string) => `${f.slice(0, 7)}-01`;
const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const fechaLarga = (f: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${f}T12:00:00Z`));
const horasDesde = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
const tiene = (s: Sesion, p: string) => s.permisos.includes(p);
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function exigir(condicion: unknown, mensaje: string, estado = 400): asserts condicion {
  if (!condicion) throw new ErrorHttp(estado, mensaje);
}
function buscar<T extends { id: number }>(tabla: T[], id: number, que: string): T {
  const fila = tabla.find((f) => f.id === Number(id));
  if (!fila) throw new ErrorHttp(404, `${que} no encontrado`);
  return fila;
}
function paginar<T>(filas: T[], pagina?: string, porPagina: number | string = 50) {
  const p = Math.max(1, Number(pagina) || 1);
  const pp = Math.min(200, Math.max(1, Number(porPagina) || 50));
  return { datos: filas.slice((p - 1) * pp, p * pp), total: filas.length, pagina: p, porPagina: pp };
}
const abierto = (p: Pedido) => ['RECIBIDO', 'PREPARADO', 'EN_RUTA', 'INCIDENCIA'].includes(p.estado);
const vigente = (p: Pedido) => p.estado !== 'COTIZACION' && p.estado !== 'CANCELADO';

function folio(serie: string): string {
  const b = bd();
  b.folios[serie] = (b.folios[serie] ?? 0) + 1;
  return `${serie}-${String(b.folios[serie]).padStart(6, '0')}`;
}

function bitacora(autor: Autor, accion: string, entidad: string, entidadId: number | null, resumen?: string) {
  bd().bitacora.push({
    id: nuevoId('bitacora'), usuarioId: autor?.id ?? null, usuarioNombre: autor?.nombre ?? 'Sistema', accion, entidad,
    entidadId: entidadId === null ? null : String(entidadId), resumen: resumen?.slice(0, 300) ?? null, createdAt: ahora(),
  });
}

/* ------------------------------------------------------------------ */
/*  Acceso, usuarios y sucursales                                      */
/* ------------------------------------------------------------------ */

export function sesionDe(u: Usuario): Sesion {
  return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sucursalId: u.sucursalId, permisos: permisosEfectivos(u.rol, u.permisosExtra, u.permisosDenegados) };
}

function presentarUsuario(u: Usuario) {
  const s = bd().sucursales.find((x) => x.id === u.sucursalId);
  return {
    id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, rolNombre: NOMBRES_ROL[u.rol], sucursalId: u.sucursalId,
    sucursal: s ? { id: s.id, nombre: s.nombre } : null, permisosExtra: u.permisosExtra, permisosDenegados: u.permisosDenegados,
    permisos: permisosEfectivos(u.rol, u.permisosExtra, u.permisosDenegados), activo: u.activo, ultimoAcceso: u.ultimoAcceso, createdAt: u.createdAt,
  };
}
const limpiarPermisos = (lista?: string[]) => [...new Set((lista ?? []).filter((p) => p in PERMISOS))];

const acceso = {
  login(c: { email?: string; password?: string }) {
    const u = bd().usuarios.find((x) => x.email === String(c.email ?? '').trim().toLowerCase());
    if (!u || !u.activo || u.clave !== c.password) throw new ErrorHttp(401, 'Correo o contraseña incorrectos');
    u.ultimoAcceso = ahora();
    bitacora(u, 'INICIO_SESION', 'usuario', u.id);
    return { token: `demo.${u.id}`, usuario: presentarUsuario(u) };
  },
  yo: (s: Sesion) => presentarUsuario(buscar(bd().usuarios, s.id, 'Usuario')),
  password(s: Sesion, c: { actual?: string; nueva?: string }) {
    const u = buscar(bd().usuarios, s.id, 'Usuario');
    exigir(u.clave === c.actual, 'La contraseña actual no es correcta');
    exigir((c.nueva ?? '').length >= 8, 'La contraseña nueva debe tener al menos 8 caracteres');
    u.clave = c.nueva!;
    bitacora(s, 'CAMBIO_PASSWORD', 'usuario', u.id);
    return { ok: true };
  },
  usuarios: () => [...bd().usuarios].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es')).map(presentarUsuario),
  catalogo: () => ({
    permisos: Object.entries(PERMISOS).map(([clave, descripcion]) => ({ clave, descripcion, modulo: clave.split('.')[0] })),
    roles: (Object.keys(PERMISOS_POR_ROL) as Rol[]).map((rol) => ({ rol, nombre: NOMBRES_ROL[rol], permisos: PERMISOS_POR_ROL[rol] })),
  }),
  crearUsuario(s: Sesion, c: Partial<Usuario> & { password?: string }) {
    const email = String(c.email ?? '').trim().toLowerCase();
    exigir((c.nombre ?? '').trim().length >= 2 && /.+@.+\..+/.test(email), 'Escribe el nombre y un correo válido');
    exigir((c.password ?? '').length >= 8, 'La contraseña debe tener al menos 8 caracteres');
    if (bd().usuarios.some((u) => u.email === email)) throw new ErrorHttp(409, 'Ya existe un usuario con ese correo');
    const u: Usuario = {
      id: nuevoId('usuarios'), nombre: c.nombre!.trim(), email, clave: c.password!, rol: c.rol ?? 'VENTAS', sucursalId: c.sucursalId ?? null,
      permisosExtra: limpiarPermisos(c.permisosExtra), permisosDenegados: limpiarPermisos(c.permisosDenegados), activo: true, ultimoAcceso: null, createdAt: ahora(),
    };
    bd().usuarios.push(u);
    bitacora(s, 'CREAR', 'usuario', u.id, `Alta de ${u.nombre} (${NOMBRES_ROL[u.rol]})`);
    return presentarUsuario(u);
  },
  editarUsuario(s: Sesion, id: number, c: Partial<Usuario> & { password?: string }) {
    const u = buscar(bd().usuarios, id, 'Usuario');
    if (id === s.id && (c.activo === false || (c.rol && c.rol !== u.rol))) throw new ErrorHttp(400, 'No puedes cambiar tu propio rol ni desactivarte');
    if (c.email !== undefined) {
      const email = c.email.trim().toLowerCase();
      if (bd().usuarios.some((x) => x.email === email && x.id !== id)) throw new ErrorHttp(409, 'Ya existe un usuario con ese correo');
      u.email = email;
    }
    if (c.nombre !== undefined) u.nombre = c.nombre.trim();
    if (c.password) {
      exigir(c.password.length >= 8, 'La contraseña debe tener al menos 8 caracteres');
      u.clave = c.password;
    }
    if (c.rol !== undefined) u.rol = c.rol;
    if (c.sucursalId !== undefined) u.sucursalId = c.sucursalId || null;
    if (c.permisosExtra !== undefined) u.permisosExtra = limpiarPermisos(c.permisosExtra);
    if (c.permisosDenegados !== undefined) u.permisosDenegados = limpiarPermisos(c.permisosDenegados);
    if (c.activo !== undefined) u.activo = c.activo;
    bitacora(s, 'EDITAR', 'usuario', id, `Cambios en ${u.nombre}`);
    return presentarUsuario(u);
  },
  sucursales: () => [...bd().sucursales].sort((a, b) => Number(b.activa) - Number(a.activa) || a.id - b.id),
  crearSucursal(s: Sesion, c: { nombre?: string; direccion?: string }) {
    exigir((c.nombre ?? '').trim().length >= 2, 'Escribe el nombre de la sucursal');
    const suc = { id: nuevoId('sucursales'), nombre: c.nombre!.trim(), direccion: texto(c.direccion), activa: true, createdAt: ahora() };
    bd().sucursales.push(suc);
    bitacora(s, 'CREAR', 'sucursal', suc.id, `Alta de sucursal ${suc.nombre}`);
    return suc;
  },
  editarSucursal(s: Sesion, id: number, c: { nombre?: string; direccion?: string; activa?: boolean }) {
    const suc = buscar(bd().sucursales, id, 'Sucursal');
    exigir((c.nombre ?? '').trim().length >= 2, 'Escribe el nombre de la sucursal');
    Object.assign(suc, { nombre: c.nombre!.trim(), direccion: texto(c.direccion), ...(c.activa !== undefined ? { activa: c.activa } : {}) });
    bitacora(s, 'EDITAR', 'sucursal', id, `Cambios en sucursal ${suc.nombre}`);
    return suc;
  },
  bitacora: (q: Q) => paginar([...bd().bitacora].reverse().filter((b) => !q.entidad || b.entidad === q.entidad), q.pagina, 60),
};

function sucursalPara(s: Sesion, solicitada?: number): number {
  if (s.sucursalId) return s.sucursalId;
  const activas = bd().sucursales.filter((x) => x.activa);
  if (solicitada) {
    exigir(activas.some((x) => x.id === Number(solicitada)), 'La sucursal no existe');
    return Number(solicitada);
  }
  exigir(activas[0], 'Registra una sucursal en Configuración antes de vender');
  return activas[0].id;
}

/* ------------------------------------------------------------------ */
/*  Notificaciones (WhatsApp)                                          */
/* ------------------------------------------------------------------ */

type Vars = Record<string, string | number | null | undefined>;
const PLANTILLAS: Record<string, (v: Vars) => string> = {
  pedido_confirmado: (v) => `Hola ${v.nombre}, confirmamos tu pedido ${v.folio} en ${EMPRESA} por ${v.total}.${v.fechaEntrega ? ` Entrega programada: ${v.fechaEntrega}.` : ''} ¡Gracias por tu compra!`,
  pollitanda_inscripcion: (v) => `Hola ${v.nombre}, quedó registrada tu participación en la Pollitanda "${v.programa}": ${v.pollitos} aves por ${v.total}. Entrega: ${v.fechaEntrega}. Tu folio es ${v.folio}.`,
  pago_recibido: (v) => `Hola ${v.nombre}, recibimos tu pago de ${v.monto} (recibo ${v.recibo}) del pedido ${v.folio}. ${Number(v.saldoNum) > 0 ? `Saldo pendiente: ${v.saldo}.` : 'Tu pedido quedó liquidado.'} Gracias. — ${EMPRESA}`,
  pedido_preparado: (v) => `Hola ${v.nombre}, tu pedido ${v.folio} ya está preparado. — ${EMPRESA}`,
  pedido_en_ruta: (v) => `Hola ${v.nombre}, tu pedido ${v.folio} va en camino. — ${EMPRESA}`,
  pedido_entregado: (v) => `Hola ${v.nombre}, entregamos tu pedido ${v.folio}.${Number(v.saldoNum) > 0 ? ` Saldo pendiente: ${v.saldo}.` : ''} ¡Gracias por tu preferencia! — ${EMPRESA}`,
  recordatorio_cotizacion: (v) => `Hola ${v.nombre}, te compartimos de nuevo tu cotización ${v.folio} por ${v.total}. ¿Te apoyamos para confirmar tu pedido? — ${EMPRESA}`,
  recordatorio_saldo: (v) => `Hola ${v.nombre}, te recordamos que el pedido ${v.folio} tiene un saldo pendiente de ${v.saldo}${v.vencimiento ? ` con vencimiento el ${v.vencimiento}` : ''}. — ${EMPRESA}`,
  recordatorio_anticipo: (v) => `Hola ${v.nombre}, tu lugar en la Pollitanda "${v.programa}" (${v.folio}) está apartado. Para asegurarlo falta tu anticipo de ${v.anticipo}. — ${EMPRESA}`,
  recordatorio_entrega: (v) => `Hola ${v.nombre}, la entrega de tu pedido ${v.folio} está programada para el ${v.fechaEntrega}.${Number(v.saldoNum) > 0 ? ` Saldo por liquidar: ${v.saldo}.` : ''} — ${EMPRESA}`,
  manual: (v) => String(v.mensaje),
};

function notificar(plantilla: string, cliente: Cliente, vars: Vars, referencia: string | null): Notificacion | null {
  const destinatario = (cliente.whatsapp || cliente.telefono || '').replace(/\D/g, '');
  if (destinatario.length < 10) return null;
  const n: Notificacion = {
    id: nuevoId('notificaciones'), clienteId: cliente.id, destinatario, plantilla, mensaje: PLANTILLAS[plantilla]({ ...vars, nombre: cliente.nombre }),
    estado: 'PENDIENTE', referencia, error: null, enviadaAt: null, createdAt: ahora(),
  };
  bd().notificaciones.push(n);
  return n;
}

const notificaciones = {
  listar(q: Q) {
    const b = bd();
    const filas = [...b.notificaciones].reverse().filter((n) => (!q.estado || n.estado === q.estado) && (!q.clienteId || n.clienteId === Number(q.clienteId)));
    const conteo: Record<string, number> = {};
    for (const n of b.notificaciones) conteo[n.estado] = (conteo[n.estado] ?? 0) + 1;
    const pagina = paginar(filas, q.pagina, 60);
    return {
      ...pagina,
      datos: pagina.datos.map((n) => {
        const c = b.clientes.find((x) => x.id === n.clienteId);
        return { ...n, cliente: c ? { id: c.id, nombre: c.nombre } : null };
      }),
      conteo,
      envioAutomatico: false,
    };
  },
  marcar(s: Sesion, id: number, estado: Notificacion['estado']) {
    const n = buscar(bd().notificaciones, id, 'Mensaje');
    exigir(['ENVIADA', 'DESCARTADA', 'PENDIENTE'].includes(estado), 'Estado no válido');
    n.estado = estado;
    n.enviadaAt = estado === 'ENVIADA' ? ahora() : null;
    bitacora(s, `MENSAJE_${estado}`, 'notificacion', id, n.mensaje.slice(0, 120));
    return n;
  },
  manual(s: Sesion, c: { clienteId?: number; mensaje?: string }) {
    const cliente = buscar(bd().clientes, Number(c.clienteId), 'Cliente');
    exigir((c.mensaje ?? '').trim().length >= 3, 'Escribe el mensaje');
    const n = notificar('manual', cliente, { mensaje: c.mensaje!.trim() }, null);
    exigir(n, 'El cliente no tiene un teléfono válido registrado');
    bitacora(s, 'MENSAJE_MANUAL', 'notificacion', n.id, `Mensaje para ${cliente.nombre}`);
    return n;
  },
  /** Revisa la operación y deja listos los recordatorios del día, sin repetirlos en menos de 3 días */
  recordatorios() {
    const b = bd();
    const dia = hoy();
    const generados = { cotizaciones: 0, saldos: 0, anticipos: 0, entregas: 0 };
    const reciente = (plantilla: string, ref: string, dias: number) => b.notificaciones.some((n) => n.plantilla === plantilla && n.referencia === ref && horasDesde(n.createdAt) < dias * 24);
    const cliente = (p: Pedido) => b.clientes.find((c) => c.id === p.clienteId)!;

    for (const p of b.pedidos) {
      const saldo = r2(p.total - p.pagado);
      const horas = horasDesde(p.createdAt);
      if (p.estado === 'COTIZACION' && horas > 72 && horas < 720 && !reciente('recordatorio_cotizacion', p.folio, 3)) {
        if (notificar('recordatorio_cotizacion', cliente(p), { folio: p.folio, total: pesos(p.total) }, p.folio)) generados.cotizaciones++;
      }
      if (vigente(p) && saldo > 0 && p.fechaVencimiento && p.fechaVencimiento < dia && !reciente('recordatorio_saldo', p.folio, 3)) {
        if (notificar('recordatorio_saldo', cliente(p), { folio: p.folio, saldo: pesos(saldo), vencimiento: fechaLarga(p.fechaVencimiento) }, p.folio)) generados.saldos++;
      }
      const insc = b.inscripciones.find((i) => i.pedidoId === p.id);
      if (insc && abierto(p) && p.pagado === 0 && horas > 48 && !reciente('recordatorio_anticipo', p.folio, 3)) {
        const t = b.pollitandas.find((x) => x.id === insc.pollitandaId)!;
        const anticipo = t.anticipoMinimo > 0 ? r2(t.anticipoMinimo * insc.paquetes) : p.total;
        if (notificar('recordatorio_anticipo', cliente(p), { folio: insc.folio, programa: t.nombre, anticipo: pesos(anticipo) }, p.folio)) generados.anticipos++;
      }
      if (['RECIBIDO', 'PREPARADO'].includes(p.estado) && p.fechaEntrega && p.fechaEntrega >= dia && p.fechaEntrega <= sumarDias(dia, 3) && !reciente('recordatorio_entrega', p.folio, 3650)) {
        if (notificar('recordatorio_entrega', cliente(p), { folio: p.folio, fechaEntrega: fechaLarga(p.fechaEntrega), saldo: pesos(saldo), saldoNum: saldo }, p.folio)) generados.entregas++;
      }
    }
    return generados;
  },
};

/* ------------------------------------------------------------------ */
/*  Clientes y seguimiento                                             */
/* ------------------------------------------------------------------ */

function limpiarCliente(c: Partial<Cliente>) {
  return {
    nombre: String(c.nombre ?? '').trim(), telefono: texto(c.telefono), whatsapp: texto(c.whatsapp), email: texto(c.email)?.toLowerCase() ?? null,
    direccion: texto(c.direccion), municipio: texto(c.municipio), rfc: texto(c.rfc)?.toUpperCase() ?? null, origen: texto(c.origen), notas: texto(c.notas),
  };
}
function validarDuplicado(c: Partial<Cliente>, idActual?: number) {
  const digitos = [c.telefono, c.whatsapp].map((v) => (v ?? '').replace(/\D/g, '')).filter((v) => v.length >= 10);
  const otro = bd().clientes.find((x) => x.id !== idActual && [x.telefono, x.whatsapp].some((t) => digitos.includes((t ?? '').replace(/\D/g, ''))));
  if (otro) throw new ErrorHttp(409, `Ya existe un cliente con ese teléfono: ${otro.nombre}`);
}
const ref = (u?: { id: number; nombre: string } | null) => (u ? { id: u.id, nombre: u.nombre } : null);

const clientes = {
  listar(q: Q) {
    const b = bd();
    const t = q.q?.trim().toLowerCase();
    const filas = b.clientes
      .filter((c) => c.activo && (!q.tipo || c.tipo === q.tipo) && (!q.etapa || c.etapa === q.etapa))
      .filter((c) => !t || [c.nombre, c.telefono, c.whatsapp, c.municipio].some((v) => (v ?? '').toLowerCase().includes(t)))
      .map((c) => {
        const suyos = b.pedidos.filter((p) => p.clienteId === c.id && vigente(p));
        return {
          ...c, vendedor: ref(b.usuarios.find((u) => u.id === c.vendedorId)),
          saldo: r2(suyos.reduce((s, p) => s + (p.total - p.pagado), 0)), comprado: r2(suyos.reduce((s, p) => s + p.total, 0)),
        };
      })
      .filter((c) => q.conSaldo !== '1' || c.saldo > 0)
      .sort((a, c) => a.nombre.localeCompare(c.nombre, 'es'));
    return paginar(filas, q.pagina, q.porPagina);
  },
  detalle(id: number) {
    const b = bd();
    const c = buscar(b.clientes, id, 'Cliente');
    const suyos = b.pedidos.filter((p) => p.clienteId === id).reverse();
    const vigentes = suyos.filter(vigente);
    return {
      ...c,
      vendedor: ref(b.usuarios.find((u) => u.id === c.vendedorId)),
      resumen: {
        comprado: r2(vigentes.reduce((s, p) => s + p.total, 0)), pagado: r2(vigentes.reduce((s, p) => s + p.pagado, 0)),
        saldo: r2(vigentes.reduce((s, p) => s + (p.total - p.pagado), 0)), pedidos: vigentes.length, ultimaCompra: vigentes[0]?.confirmadoAt ?? null,
      },
      pedidos: suyos.map((p) => ({ id: p.id, folio: p.folio, estado: p.estado, total: p.total, pagado: p.pagado, saldo: r2(p.total - p.pagado), fechaEntrega: p.fechaEntrega, createdAt: p.createdAt })),
      pagos: b.pagos.filter((g) => g.clienteId === id).sort((x, y) => y.fecha.localeCompare(x.fecha)).map((g) => {
        const p = b.pedidos.find((x) => x.id === g.pedidoId)!;
        return { id: g.id, folio: g.folio, monto: g.monto, metodo: g.metodo, fecha: g.fecha, cancelado: g.cancelado, pedido: { id: p.id, folio: p.folio } };
      }),
      seguimientos: b.seguimientos.filter((s) => s.clienteId === id).reverse().map((s) => ({ ...s, usuario: ref(b.usuarios.find((u) => u.id === s.usuarioId)) })),
      pollitandas: b.inscripciones.filter((i) => i.clienteId === id).reverse().map((i) => {
        const p = b.pedidos.find((x) => x.id === i.pedidoId)!;
        return {
          id: i.id, folio: i.folio, programa: b.pollitandas.find((t) => t.id === i.pollitandaId)!.nombre, pollitandaId: i.pollitandaId, paquetes: i.paquetes,
          cantidadPollitos: i.cantidadPollitos, total: p.total, pagado: p.pagado, saldo: r2(p.total - p.pagado), fechaEntrega: p.fechaEntrega, estadoPedido: p.estado, pedidoId: p.id,
        };
      }),
    };
  },
  crear(s: Sesion, c: Partial<Cliente>) {
    exigir(String(c.nombre ?? '').trim().length >= 2, 'Escribe el nombre del cliente');
    validarDuplicado(c);
    const tipo = c.tipo ?? 'PROSPECTO';
    const nuevo: Cliente = { id: nuevoId('clientes'), ...limpiarCliente(c), tipo, etapa: tipo === 'PROSPECTO' ? (c.etapa ?? 'NUEVO') : null, vendedorId: c.vendedorId ?? s.id, activo: true, createdAt: ahora() };
    bd().clientes.push(nuevo);
    bitacora(s, 'CREAR', 'cliente', nuevo.id, `Alta de ${nuevo.nombre} (${nuevo.tipo})`);
    return nuevo;
  },
  editar(s: Sesion, id: number, c: Partial<Cliente>) {
    const actual = buscar(bd().clientes, id, 'Cliente');
    exigir(String(c.nombre ?? '').trim().length >= 2, 'Escribe el nombre del cliente');
    validarDuplicado(c, id);
    const tipo = c.tipo ?? actual.tipo;
    Object.assign(actual, limpiarCliente(c), { tipo, etapa: tipo === 'PROSPECTO' ? (c.etapa ?? actual.etapa ?? 'NUEVO') : null });
    bitacora(s, 'EDITAR', 'cliente', id, `Cambios en ${actual.nombre}`);
    return actual;
  },
  seguimiento(s: Sesion, clienteId: number, c: { tipo?: string; nota?: string; proximaAccion?: string | null }) {
    const cliente = buscar(bd().clientes, clienteId, 'Cliente');
    exigir((c.nota ?? '').trim().length >= 2, 'Escribe una nota');
    const seg = { id: nuevoId('seguimientos'), clienteId, usuarioId: s.id, tipo: c.tipo ?? 'NOTA', nota: c.nota!.trim(), proximaAccion: c.proximaAccion || null, completado: false, createdAt: ahora() };
    bd().seguimientos.push(seg);
    if (cliente.tipo === 'PROSPECTO' && cliente.etapa === 'NUEVO' && seg.tipo !== 'NOTA') cliente.etapa = 'CONTACTADO';
    return seg;
  },
  completar(id: number, completado: boolean) {
    const seg = buscar(bd().seguimientos, id, 'Seguimiento');
    seg.completado = !!completado;
    return seg;
  },
  pendientes(s: Sesion) {
    const b = bd();
    const soloMios = !tiene(s, 'reportes.finanzas');
    return b.seguimientos
      .filter((x) => !x.completado && x.proximaAccion && x.proximaAccion <= hoy() && (!soloMios || x.usuarioId === s.id))
      .sort((x, y) => x.proximaAccion!.localeCompare(y.proximaAccion!))
      .slice(0, 50)
      .map((x) => {
        const c = b.clientes.find((k) => k.id === x.clienteId)!;
        return { id: x.id, tipo: x.tipo, nota: x.nota, proximaAccion: x.proximaAccion, cliente: { id: c.id, nombre: c.nombre, telefono: c.whatsapp || c.telefono } };
      });
  },
};

/* ------------------------------------------------------------------ */
/*  Productos e inventario                                             */
/* ------------------------------------------------------------------ */

const productos = {
  listar: (q: Q) => bd().productos.filter((p) => q.todos === '1' || p.activo).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre, 'es')),
  guardar(s: Sesion, id: number | null, c: Partial<Producto>) {
    const b = bd();
    const sku = String(c.sku ?? '').trim().toUpperCase();
    exigir(sku.length >= 2 && String(c.nombre ?? '').trim().length >= 2, 'Escribe la clave y el nombre del producto');
    exigir(Number(c.precio) >= 0, 'El precio no es válido');
    if (b.productos.some((p) => p.sku === sku && p.id !== id)) throw new ErrorHttp(409, `Ya existe un producto con la clave ${sku}`);
    const datos = { sku, nombre: c.nombre!.trim(), categoria: c.categoria ?? 'HUEVO', unidad: String(c.unidad ?? 'pieza').trim(), precio: r2(Number(c.precio)), stockMinimo: r2(Number(c.stockMinimo) || 0), diasAlerta: Number(c.diasAlerta ?? 3) };
    if (id === null) {
      const p = { id: nuevoId('productos'), ...datos, activo: true, createdAt: ahora() };
      b.productos.push(p);
      bitacora(s, 'CREAR', 'producto', p.id, `Alta de ${p.nombre}`);
      return p;
    }
    const p = buscar(b.productos, id, 'Producto');
    const cambio = p.precio !== datos.precio ? ` · precio ${p.precio} → ${datos.precio}` : '';
    Object.assign(p, datos, c.activo !== undefined ? { activo: c.activo } : {});
    bitacora(s, 'EDITAR', 'producto', id, `Cambios en ${p.nombre}${cambio}`);
    return p;
  },
};

function mover(lote: Lote, tipo: string, cantidad: number, autor: Autor, referencia: string | null, motivo: string | null) {
  bd().movimientos.push({
    id: nuevoId('movimientos'), loteId: lote.id, productoId: lote.productoId, tipo, cantidad: r2(cantidad), saldoFisico: lote.cantidadFisica,
    saldoReservado: lote.cantidadReservada, referencia, motivo: motivo?.slice(0, 240) ?? null, usuarioNombre: autor?.nombre ?? 'Sistema', createdAt: ahora(),
  });
}

const inventario = {
  existencias(s: Sesion, q: Q = {}) {
    const b = bd();
    const sucursalId = s.sucursalId ?? (q.sucursalId ? Number(q.sucursalId) : null);
    const dia = hoy();
    const t = q.q?.trim().toLowerCase();
    return productos
      .listar({})
      .filter((p) => (!q.categoria || p.categoria === q.categoria) && (!t || p.nombre.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t)))
      .map((p) => {
        const lotes = b.lotes.filter((l) => l.productoId === p.id && (!sucursalId || l.sucursalId === sucursalId));
        const conExistencia = lotes.filter((l) => l.cantidadFisica > 0);
        const caducidad = conExistencia.map((l) => l.fechaLimiteVenta).filter(Boolean).sort()[0] ?? null;
        const disponible = r2(lotes.filter((l) => !l.fechaLimiteVenta || l.fechaLimiteVenta >= dia).reduce((x, l) => x + l.cantidadFisica - l.cantidadReservada, 0));
        // Vendido en preventa que aún no tiene inventario apartado
        const porSurtir = r2(
          b.items.filter((i) => i.productoId === p.id && i.cantidad > i.cantidadReservada).reduce((x, i) => {
            const pe = b.pedidos.find((k) => k.id === i.pedidoId)!;
            return abierto(pe) && (!sucursalId || pe.sucursalId === sucursalId) ? x + (i.cantidad - i.cantidadReservada) : x;
          }, 0),
        );
        return {
          id: p.id, sku: p.sku, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, precio: p.precio, stockMinimo: p.stockMinimo,
          fisica: r2(lotes.reduce((x, l) => x + l.cantidadFisica, 0)), reservada: r2(lotes.reduce((x, l) => x + l.cantidadReservada, 0)), disponible,
          valor: r2(lotes.reduce((x, l) => x + l.cantidadFisica * l.costoUnitario, 0)), lotes: conExistencia.length, proximaCaducidad: caducidad, porSurtir,
          bajoMinimo: p.stockMinimo > 0 && disponible <= p.stockMinimo, porCaducar: !!caducidad && caducidad <= sumarDias(dia, p.diasAlerta),
        };
      });
  },
  lotes(s: Sesion, q: Q) {
    const b = bd();
    const dia = hoy();
    return b.lotes
      .filter((l) => (!q.productoId || l.productoId === Number(q.productoId)) && (!s.sucursalId || l.sucursalId === s.sucursalId) && (q.todos === '1' || l.cantidadFisica > 0))
      .sort(ordenLotes)
      .map((l) => {
        const p = b.productos.find((x) => x.id === l.productoId)!;
        const suc = b.sucursales.find((x) => x.id === l.sucursalId)!;
        return {
          ...l, disponible: r2(l.cantidadFisica - l.cantidadReservada), caducado: !!l.fechaLimiteVenta && l.fechaLimiteVenta < dia,
          producto: { id: p.id, nombre: p.nombre, sku: p.sku, unidad: p.unidad, diasAlerta: p.diasAlerta }, sucursal: { id: suc.id, nombre: suc.nombre },
        };
      });
  },
  movimientos(s: Sesion, q: Q) {
    const b = bd();
    const filas = [...b.movimientos].reverse().filter((m) => {
      const l = b.lotes.find((x) => x.id === m.loteId)!;
      return (!q.productoId || m.productoId === Number(q.productoId)) && (!q.loteId || m.loteId === Number(q.loteId)) && (!q.tipo || m.tipo === q.tipo) && (!s.sucursalId || l.sucursalId === s.sucursalId);
    });
    const pagina = paginar(filas, q.pagina, 60);
    return {
      ...pagina,
      datos: pagina.datos.map((m) => {
        const l = b.lotes.find((x) => x.id === m.loteId)!;
        const p = b.productos.find((x) => x.id === m.productoId)!;
        return { ...m, lote: { id: l.id, codigo: l.codigo }, producto: { id: p.id, nombre: p.nombre, unidad: p.unidad } };
      }),
    };
  },
  /** Entrada de mercancía: crea un lote y surte las ventas en preventa que esperaban */
  entrada(s: Sesion, c: { productoId?: number; sucursalId?: number; cantidad?: number; costoUnitario?: number; codigo?: string; ubicacion?: string; fechaIngreso?: string; fechaLimiteVenta?: string; notas?: string }) {
    const b = bd();
    const sucursalId = s.sucursalId ?? Number(c.sucursalId);
    exigir(sucursalId && b.sucursales.some((x) => x.id === sucursalId), 'Indica la sucursal que recibe la mercancía');
    const producto = buscar(b.productos, Number(c.productoId), 'Producto');
    exigir(Number(c.cantidad) > 0, 'La cantidad debe ser mayor a cero');
    const fechaIngreso = c.fechaIngreso ?? hoy();
    exigir(!c.fechaLimiteVenta || c.fechaLimiteVenta >= fechaIngreso, 'La fecha límite de venta no puede ser anterior al ingreso');
    const lote: Lote = {
      id: nuevoId('lotes'), codigo: texto(c.codigo) ?? folio('LOT'), productoId: producto.id, sucursalId, ubicacion: texto(c.ubicacion), cantidadFisica: r2(Number(c.cantidad)),
      cantidadReservada: 0, costoUnitario: r2(Number(c.costoUnitario) || 0), fechaIngreso, fechaLimiteVenta: c.fechaLimiteVenta || null, notas: texto(c.notas), createdAt: ahora(),
    };
    b.lotes.push(lote);
    mover(lote, 'ENTRADA', lote.cantidadFisica, s, lote.codigo, c.notas ?? 'Entrada de lote');
    const pedidosSurtidos = surtirPreventas(producto.id, sucursalId, s);
    bitacora(s, 'ENTRADA', 'lote', lote.id, `${lote.codigo}: +${lote.cantidadFisica} ${producto.unidad} de ${producto.nombre}`);
    return { lote, pedidosSurtidos };
  },
  /** Ajuste por conteo físico, merma o mortalidad: se captura la cantidad real contada */
  ajuste(s: Sesion, loteId: number, c: { cantidadFisica?: number; motivo?: string }) {
    const lote = buscar(bd().lotes, loteId, 'Lote');
    exigir(!s.sucursalId || lote.sucursalId === s.sucursalId, 'Lote no encontrado', 404);
    exigir((c.motivo ?? '').trim().length >= 3, 'Explica el motivo del ajuste');
    const nueva = r2(Number(c.cantidadFisica));
    exigir(nueva >= 0, 'La cantidad no es válida');
    if (nueva < lote.cantidadReservada) throw new ErrorHttp(409, `Este lote tiene ${lote.cantidadReservada} unidades apartadas en pedidos. Libera o reasigna esas reservas antes de bajar la existencia.`);
    const delta = r2(nueva - lote.cantidadFisica);
    exigir(delta !== 0, 'La cantidad capturada es igual a la existencia actual');
    lote.cantidadFisica = nueva;
    mover(lote, 'AJUSTE', delta, s, lote.codigo, c.motivo!.trim());
    const pedidosSurtidos = delta > 0 ? surtirPreventas(lote.productoId, lote.sucursalId, s) : [];
    bitacora(s, 'AJUSTE', 'lote', lote.id, `${lote.codigo}: ${delta > 0 ? '+' : ''}${delta} (${c.motivo})`);
    return { lote, pedidosSurtidos };
  },
};

/** Primero el lote que vence antes; los que no vencen, al final */
function ordenLotes(a: Lote, b: Lote) {
  return (a.fechaLimiteVenta ?? '9999').localeCompare(b.fechaLimiteVenta ?? '9999') || a.fechaIngreso.localeCompare(b.fechaIngreso) || a.id - b.id;
}

/**
 * Aparta inventario para un renglón. Toma primero los lotes que vencen antes y descarta
 * los que ya no estarán vigentes el día de la entrega. Devuelve lo que NO pudo apartarse.
 */
function reservarItem(item: Item, pedido: Pick<Pedido, 'sucursalId' | 'folio' | 'fechaEntrega'>, autor: Autor): number {
  const b = bd();
  let restante = r2(item.cantidad - item.cantidadReservada);
  if (restante <= 0) return 0;
  const dia = hoy();
  const vigenteAl = pedido.fechaEntrega && pedido.fechaEntrega > dia ? pedido.fechaEntrega : dia;
  const lotes = b.lotes
    .filter((l) => l.productoId === item.productoId && l.sucursalId === pedido.sucursalId && l.cantidadFisica > l.cantidadReservada && (!l.fechaLimiteVenta || l.fechaLimiteVenta >= vigenteAl))
    .sort(ordenLotes);
  for (const lote of lotes) {
    if (restante <= 0) break;
    const toma = Math.min(r2(lote.cantidadFisica - lote.cantidadReservada), restante);
    lote.cantidadReservada = r2(lote.cantidadReservada + toma);
    const previa = b.reservas.find((r) => r.pedidoItemId === item.id && r.loteId === lote.id && !r.surtida);
    if (previa) previa.cantidad = r2(previa.cantidad + toma);
    else b.reservas.push({ id: nuevoId('reservas'), pedidoItemId: item.id, loteId: lote.id, cantidad: toma, surtida: false });
    mover(lote, 'RESERVA', toma, autor, pedido.folio, 'Apartado para pedido');
    restante = r2(restante - toma);
  }
  item.cantidadReservada = r2(item.cantidad - restante);
  return restante;
}

function liberarItem(item: Item, folioPedido: string, autor: Autor) {
  const b = bd();
  for (const r of b.reservas.filter((x) => x.pedidoItemId === item.id && !x.surtida)) {
    const lote = b.lotes.find((l) => l.id === r.loteId)!;
    lote.cantidadReservada = r2(Math.max(0, lote.cantidadReservada - r.cantidad));
    mover(lote, 'LIBERACION', -r.cantidad, autor, folioPedido, 'Reserva liberada');
  }
  b.reservas = b.reservas.filter((x) => x.pedidoItemId !== item.id || x.surtida);
  item.cantidadReservada = 0;
}

function surtirItem(item: Item, folioPedido: string, autor: Autor) {
  const b = bd();
  for (const r of b.reservas.filter((x) => x.pedidoItemId === item.id && !x.surtida)) {
    const lote = b.lotes.find((l) => l.id === r.loteId)!;
    lote.cantidadFisica = r2(lote.cantidadFisica - r.cantidad);
    lote.cantidadReservada = r2(Math.max(0, lote.cantidadReservada - r.cantidad));
    if (lote.cantidadFisica < 0) throw new ErrorHttp(409, `El lote ${lote.codigo} no tiene existencia suficiente para surtir ${folioPedido}`);
    mover(lote, 'SALIDA', -r.cantidad, autor, folioPedido, 'Entrega de pedido');
    r.surtida = true;
  }
}

/** Al entrar mercancía se aparta para los pedidos en preventa, del más antiguo al más reciente */
function surtirPreventas(productoId: number, sucursalId: number, autor: Autor): string[] {
  const b = bd();
  const folios: string[] = [];
  const pendientes = b.items
    .filter((i) => i.productoId === productoId && i.cantidad > i.cantidadReservada)
    .map((i) => ({ item: i, pedido: b.pedidos.find((p) => p.id === i.pedidoId)! }))
    .filter((x) => x.pedido.sucursalId === sucursalId && abierto(x.pedido))
    .sort((x, y) => (x.pedido.confirmadoAt ?? '').localeCompare(y.pedido.confirmadoAt ?? '') || x.item.id - y.item.id);
  for (const { item, pedido } of pendientes) {
    const antes = item.cantidadReservada;
    reservarItem(item, pedido, autor);
    if (item.cantidadReservada > antes) folios.push(pedido.folio);
  }
  return [...new Set(folios)];
}

/* ------------------------------------------------------------------ */
/*  Pedidos                                                            */
/* ------------------------------------------------------------------ */

const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  COTIZACION: [], RECIBIDO: ['PREPARADO', 'ENTREGADO', 'INCIDENCIA'], PREPARADO: ['EN_RUTA', 'ENTREGADO', 'RECIBIDO', 'INCIDENCIA'],
  EN_RUTA: ['ENTREGADO', 'PREPARADO', 'INCIDENCIA'], INCIDENCIA: ['RECIBIDO', 'PREPARADO', 'EN_RUTA'], ENTREGADO: [], CANCELADO: [],
};
const NOMBRE_ESTADO: Record<EstadoPedido, string> = { COTIZACION: 'en cotización', RECIBIDO: 'recibido', PREPARADO: 'preparado', EN_RUTA: 'en ruta', ENTREGADO: 'entregado', INCIDENCIA: 'con incidencia', CANCELADO: 'cancelado' };

interface Renglon { productoId: number; descripcion: string; cantidad: number; precioUnitario: number; importe: number }
interface NuevoPedido {
  clienteId: number; sucursalId: number; renglones: Renglon[]; descuento: number; fechaEntrega: string | null; fechaVencimiento: string | null;
  notas: string | null; confirmar: boolean; permitirFaltante: boolean; omitirAviso?: boolean;
}

function pedidoDe(s: Sesion, id: number): Pedido {
  const p = bd().pedidos.find((x) => x.id === Number(id));
  if (!p || (s.sucursalId && p.sucursalId !== s.sucursalId)) throw new ErrorHttp(404, 'Pedido no encontrado');
  return p;
}

function resumir(p: Pedido) {
  const b = bd();
  const insc = b.inscripciones.find((i) => i.pedidoId === p.id);
  return {
    id: p.id, folio: p.folio, folioCotizacion: p.folioCotizacion, estado: p.estado, total: p.total, pagado: p.pagado, saldo: vigente(p) ? r2(p.total - p.pagado) : 0,
    fechaEntrega: p.fechaEntrega, fechaVencimiento: p.fechaVencimiento, createdAt: p.createdAt, cliente: ref(b.clientes.find((c) => c.id === p.clienteId)),
    vendedor: ref(b.usuarios.find((u) => u.id === p.vendedorId)), pollitanda: insc ? { inscripcionId: insc.id, folio: insc.folio, pollitandaId: insc.pollitandaId } : null,
  };
}

function calcularRenglones(s: Sesion, items: { productoId: number; cantidad: number; precioUnitario?: number }[]): Renglon[] {
  exigir(Array.isArray(items) && items.length > 0, 'Agrega al menos un producto');
  return items.map((it) => {
    const producto = bd().productos.find((p) => p.id === Number(it.productoId));
    if (!producto || !producto.activo) throw new ErrorHttp(404, 'Uno de los productos ya no está disponible en el catálogo');
    exigir(Number(it.cantidad) > 0, 'La cantidad debe ser mayor a cero');
    const precio = r2(it.precioUnitario ?? producto.precio);
    if (precio < producto.precio && !tiene(s, 'ventas.descuento')) throw new ErrorHttp(403, `No tienes permiso para vender ${producto.nombre} por debajo del precio de lista (${pesos(producto.precio)})`);
    return { productoId: producto.id, descripcion: producto.nombre, cantidad: r2(it.cantidad), precioUnitario: precio, importe: r2(it.cantidad * precio) };
  });
}

function crearPedido(s: Sesion, datos: NuevoPedido): Pedido {
  const b = bd();
  const cliente = b.clientes.find((c) => c.id === Number(datos.clienteId));
  if (!cliente || !cliente.activo) throw new ErrorHttp(404, 'Cliente no encontrado');
  const subtotal = r2(datos.renglones.reduce((x, r) => x + r.importe, 0));
  exigir(datos.descuento <= subtotal, 'El descuento no puede ser mayor al subtotal');
  exigir(!datos.fechaEntrega || !datos.confirmar || datos.fechaEntrega >= hoy(), 'La fecha de entrega no puede ser anterior a hoy');
  const pedido: Pedido = {
    id: nuevoId('pedidos'), folio: folio(datos.confirmar ? 'PSA' : 'COT'), folioCotizacion: null, estado: 'COTIZACION', estadoPrevio: null, clienteId: cliente.id, vendedorId: s.id,
    sucursalId: datos.sucursalId, fechaEntrega: datos.fechaEntrega, fechaVencimiento: datos.fechaVencimiento, subtotal, descuento: datos.descuento, total: r2(subtotal - datos.descuento),
    pagado: 0, notas: datos.notas, incidencia: null, recibidoPor: null, motivoCancelacion: null, confirmadoAt: null, entregadoAt: null, canceladoAt: null, createdAt: ahora(),
  };
  b.pedidos.push(pedido);
  for (const r of datos.renglones) b.items.push({ id: nuevoId('items'), pedidoId: pedido.id, ...r, cantidadReservada: 0 });
  if (cliente.tipo === 'PROSPECTO' && (cliente.etapa === 'NUEVO' || cliente.etapa === 'CONTACTADO')) cliente.etapa = 'COTIZADO';
  if (datos.confirmar) return confirmarPedido(s, pedido, datos.permitirFaltante, { directo: true, omitirAviso: datos.omitirAviso });
  bitacora(s, 'COTIZAR', 'pedido', pedido.id, `${pedido.folio} para ${cliente.nombre} por ${pesos(pedido.total)}`);
  return pedido;
}

/** Convierte la cotización en pedido en firme: asigna folio PSA y aparta inventario */
function confirmarPedido(s: Sesion, pedido: Pedido, permitirFaltante: boolean, op: { directo?: boolean; omitirAviso?: boolean } = {}): Pedido {
  const b = bd();
  exigir(pedido.estado === 'COTIZACION', 'Este pedido ya estaba confirmado');
  const nuevoFolio = op.directo ? pedido.folio : folio('PSA');
  const faltantes: string[] = [];
  for (const item of b.items.filter((i) => i.pedidoId === pedido.id)) {
    if (reservarItem(item, { sucursalId: pedido.sucursalId, folio: nuevoFolio, fechaEntrega: pedido.fechaEntrega }, s) > 0) {
      faltantes.push(`${item.descripcion}: se piden ${item.cantidad} y solo hay ${item.cantidadReservada} disponibles`);
    }
  }
  if (faltantes.length && !permitirFaltante) throw new ErrorHttp(409, `Inventario insuficiente. ${faltantes.join('. ')}.`, 'SIN_EXISTENCIA');
  if (!op.directo) pedido.folioCotizacion = pedido.folio;
  Object.assign(pedido, { folio: nuevoFolio, estado: 'RECIBIDO', confirmadoAt: ahora(), fechaVencimiento: pedido.fechaVencimiento ?? pedido.fechaEntrega ?? hoy() });
  const cliente = b.clientes.find((c) => c.id === pedido.clienteId)!;
  if (cliente.tipo === 'PROSPECTO') Object.assign(cliente, { tipo: 'CLIENTE', etapa: null });
  bitacora(s, 'CONFIRMAR', 'pedido', pedido.id, `${nuevoFolio} para ${cliente.nombre} por ${pesos(pedido.total)}${faltantes.length ? ' (con preventa)' : ''}`);
  if (!op.omitirAviso) notificar('pedido_confirmado', cliente, { folio: nuevoFolio, total: pesos(pedido.total), fechaEntrega: pedido.fechaEntrega ? fechaLarga(pedido.fechaEntrega) : null }, nuevoFolio);
  return pedido;
}

function cancelarPedido(s: Sesion, pedido: Pedido, motivo: string) {
  const b = bd();
  exigir((motivo ?? '').trim().length >= 5, 'Explica el motivo de la cancelación');
  exigir(pedido.estado !== 'CANCELADO', 'El pedido ya estaba cancelado');
  exigir(pedido.estado !== 'ENTREGADO', 'Un pedido entregado no se puede cancelar');
  if (pedido.estado !== 'COTIZACION' && !tiene(s, 'ventas.cancelar')) throw new ErrorHttp(403, 'No tienes permiso para cancelar pedidos confirmados');
  if (pedido.pagado > 0) throw new ErrorHttp(409, `Este pedido tiene ${pesos(pedido.pagado)} en pagos. Cancela primero los pagos en Cobranza para dejar constancia de la devolución.`);
  const items = b.items.filter((i) => i.pedidoId === pedido.id);
  for (const item of items) liberarItem(item, pedido.folio, s);
  Object.assign(pedido, { estado: 'CANCELADO', canceladoAt: ahora(), motivoCancelacion: motivo.trim(), estadoPrevio: null });
  bitacora(s, 'CANCELAR', 'pedido', pedido.id, `${pedido.folio}: ${motivo}`);
  for (const item of items) surtirPreventas(item.productoId, pedido.sucursalId, s); // lo liberado puede servir a otro pedido
}

const pedidos = {
  listar(s: Sesion, q: Q) {
    const b = bd();
    const t = q.q?.trim().toLowerCase();
    const grupos: Record<string, EstadoPedido[]> = { cotizaciones: ['COTIZACION'], activos: ['RECIBIDO', 'PREPARADO', 'EN_RUTA', 'INCIDENCIA'], cerrados: ['ENTREGADO', 'CANCELADO'] };
    const propios = b.pedidos.filter((p) => !s.sucursalId || p.sucursalId === s.sucursalId);
    const filas = [...propios].reverse().filter((p) => {
      const cliente = b.clientes.find((c) => c.id === p.clienteId)!;
      return (
        (!q.estado || p.estado === q.estado) && (!q.grupo || !grupos[q.grupo] || grupos[q.grupo].includes(p.estado)) && (!q.clienteId || p.clienteId === Number(q.clienteId)) &&
        (!t || [p.folio, p.folioCotizacion, cliente.nombre].some((v) => (v ?? '').toLowerCase().includes(t)))
      );
    });
    const conteo: Record<string, number> = {};
    for (const p of propios) conteo[p.estado] = (conteo[p.estado] ?? 0) + 1;
    const pagina = paginar(filas, q.pagina, q.porPagina);
    return { ...pagina, datos: pagina.datos.map(resumir), conteo };
  },
  detalle(s: Sesion, id: number) {
    const b = bd();
    const p = pedidoDe(s, id);
    const c = b.clientes.find((x) => x.id === p.clienteId)!;
    const suc = b.sucursales.find((x) => x.id === p.sucursalId)!;
    return {
      ...resumir(p), subtotal: p.subtotal, descuento: p.descuento, notas: p.notas, incidencia: p.estado === 'INCIDENCIA' ? p.incidencia : null, estadoPrevio: p.estadoPrevio,
      recibidoPor: p.recibidoPor, motivoCancelacion: p.motivoCancelacion, confirmadoAt: p.confirmadoAt, entregadoAt: p.entregadoAt, canceladoAt: p.canceladoAt,
      sucursal: { id: suc.id, nombre: suc.nombre },
      cliente: { id: c.id, nombre: c.nombre, tipo: c.tipo, telefono: c.whatsapp || c.telefono, direccion: c.direccion, municipio: c.municipio },
      items: b.items.filter((i) => i.pedidoId === p.id).map((i) => ({
        id: i.id, productoId: i.productoId, descripcion: i.descripcion, unidad: b.productos.find((x) => x.id === i.productoId)!.unidad, cantidad: i.cantidad,
        precioUnitario: i.precioUnitario, importe: i.importe, cantidadReservada: i.cantidadReservada, faltante: abierto(p) ? r2(i.cantidad - i.cantidadReservada) : 0,
        lotes: b.reservas.filter((r) => r.pedidoItemId === i.id).map((r) => {
          const l = b.lotes.find((x) => x.id === r.loteId)!;
          return { codigo: l.codigo, cantidad: r.cantidad, surtida: r.surtida, ubicacion: l.ubicacion };
        }),
      })),
      pagos: b.pagos.filter((g) => g.pedidoId === p.id).map((g) => ({ id: g.id, folio: g.folio, monto: g.monto, metodo: g.metodo, referencia: g.referencia, fecha: g.fecha, cancelado: g.cancelado, motivoCancelacion: g.motivoCancelacion, usuarioNombre: g.usuarioNombre })),
      siguientes: p.estado === 'INCIDENCIA' ? [p.estadoPrevio ?? 'RECIBIDO'] : TRANSICIONES[p.estado],
    };
  },
  crear(s: Sesion, c: { clienteId: number; items: { productoId: number; cantidad: number; precioUnitario?: number }[]; descuento?: number; fechaEntrega?: string | null; fechaVencimiento?: string | null; notas?: string | null; sucursalId?: number; confirmar?: boolean; permitirFaltante?: boolean }) {
    const descuento = r2(c.descuento ?? 0);
    if (descuento > 0 && !tiene(s, 'ventas.descuento')) throw new ErrorHttp(403, 'No tienes permiso para aplicar descuentos');
    const p = crearPedido(s, {
      clienteId: c.clienteId, sucursalId: sucursalPara(s, c.sucursalId), renglones: calcularRenglones(s, c.items), descuento, fechaEntrega: c.fechaEntrega || null,
      fechaVencimiento: c.fechaVencimiento || null, notas: texto(c.notas), confirmar: !!c.confirmar, permitirFaltante: !!c.permitirFaltante,
    });
    return pedidos.detalle(s, p.id);
  },
  confirmar(s: Sesion, id: number, c: { permitirFaltante?: boolean }) {
    confirmarPedido(s, pedidoDe(s, id), !!c?.permitirFaltante);
    return pedidos.detalle(s, id);
  },
  reservar(s: Sesion, id: number) {
    const p = pedidoDe(s, id);
    exigir(['RECIBIDO', 'PREPARADO', 'INCIDENCIA'].includes(p.estado), 'El pedido no admite reservas en su estado actual');
    for (const item of bd().items.filter((i) => i.pedidoId === p.id)) reservarItem(item, p, s);
    return pedidos.detalle(s, id);
  },
  estado(s: Sesion, id: number, c: { estado: EstadoPedido; nota?: string | null; recibidoPor?: string | null }) {
    const b = bd();
    const p = pedidoDe(s, id);
    const destino = c.estado;
    const permitidos = p.estado === 'INCIDENCIA' ? [p.estadoPrevio ?? 'RECIBIDO', ...TRANSICIONES.INCIDENCIA] : TRANSICIONES[p.estado];
    exigir(permitidos.includes(destino), `Un pedido ${NOMBRE_ESTADO[p.estado]} no puede pasar a ${NOMBRE_ESTADO[destino] ?? destino}`);
    const items = b.items.filter((i) => i.pedidoId === p.id);
    const anterior = p.estado;
    if (destino === 'INCIDENCIA') {
      exigir(texto(c.nota), 'Describe la incidencia');
      p.incidencia = c.nota!.trim();
      p.estadoPrevio = p.estado;
    } else if (p.estado === 'INCIDENCIA') p.estadoPrevio = null;

    if (['PREPARADO', 'EN_RUTA', 'ENTREGADO'].includes(destino)) {
      const sinSurtir = items.filter((i) => i.cantidadReservada < i.cantidad);
      if (sinSurtir.length) throw new ErrorHttp(409, `Aún no hay inventario para surtir: ${sinSurtir.map((i) => `${i.descripcion} (faltan ${r2(i.cantidad - i.cantidadReservada)})`).join(', ')}. Registra la entrada del lote e inténtalo de nuevo.`);
    }
    if (destino === 'ENTREGADO') {
      for (const item of items) surtirItem(item, p.folio, s);
      p.entregadoAt = ahora();
      p.recibidoPor = texto(c.recibidoPor);
      if (texto(c.nota)) p.notas = [p.notas, `Entrega: ${c.nota!.trim()}`].filter(Boolean).join('\n');
    }
    p.estado = destino;
    bitacora(s, `ESTADO_${destino}`, 'pedido', p.id, `${p.folio}: ${NOMBRE_ESTADO[anterior]} → ${NOMBRE_ESTADO[destino]}`);
    const plantilla = ({ PREPARADO: 'pedido_preparado', EN_RUTA: 'pedido_en_ruta', ENTREGADO: 'pedido_entregado' } as Record<string, string>)[destino];
    if (plantilla && anterior !== 'INCIDENCIA') {
      const saldo = r2(p.total - p.pagado);
      notificar(plantilla, b.clientes.find((x) => x.id === p.clienteId)!, { folio: p.folio, saldo: pesos(saldo), saldoNum: saldo }, p.folio);
    }
    return pedidos.detalle(s, id);
  },
  cancelar(s: Sesion, id: number, c: { motivo: string }) {
    cancelarPedido(s, pedidoDe(s, id), c.motivo);
    return pedidos.detalle(s, id);
  },
};

/* ------------------------------------------------------------------ */
/*  Pagos y cobranza                                                   */
/* ------------------------------------------------------------------ */

function registrarPago(s: Sesion, c: { pedidoId: number; monto: number; metodo: MetodoPago; referencia?: string; notas?: string }) {
  const b = bd();
  const pedido = pedidoDe(s, c.pedidoId);
  exigir(pedido.estado !== 'COTIZACION', 'Confirma la cotización antes de registrar pagos');
  exigir(pedido.estado !== 'CANCELADO', 'El pedido está cancelado');
  const monto = r2(Number(c.monto));
  exigir(monto > 0, 'El monto debe ser mayor a cero');
  const saldo = r2(pedido.total - pedido.pagado);
  if (monto > saldo) throw new ErrorHttp(409, `El pago (${pesos(monto)}) es mayor al saldo pendiente (${pesos(saldo)})`);
  const pago = {
    id: nuevoId('pagos'), folio: folio('REC'), clienteId: pedido.clienteId, pedidoId: pedido.id, monto, metodo: c.metodo ?? 'EFECTIVO', referencia: texto(c.referencia), fecha: ahora(),
    notas: texto(c.notas), usuarioNombre: s.nombre, cancelado: false, motivoCancelacion: null, createdAt: ahora(),
  };
  b.pagos.push(pago);
  pedido.pagado = r2(pedido.pagado + monto);
  const nuevoSaldo = r2(pedido.total - pedido.pagado);
  bitacora(s, 'PAGO', 'pedido', pedido.id, `${pago.folio}: ${pesos(monto)} a ${pedido.folio} · saldo ${pesos(nuevoSaldo)}`);
  notificar('pago_recibido', b.clientes.find((x) => x.id === pedido.clienteId)!, { monto: pesos(monto), recibo: pago.folio, folio: pedido.folio, saldo: pesos(nuevoSaldo), saldoNum: nuevoSaldo }, pago.folio);
  return { ...pago, saldoPedido: nuevoSaldo };
}

const pagos = {
  registrar: registrarPago,
  cancelar(s: Sesion, id: number, c: { motivo: string }) {
    const b = bd();
    const pago = buscar(b.pagos, id, 'Pago');
    exigir((c.motivo ?? '').trim().length >= 5, 'Explica el motivo de la cancelación');
    exigir(!pago.cancelado, 'Este pago ya estaba cancelado');
    const pedido = b.pedidos.find((p) => p.id === pago.pedidoId)!;
    Object.assign(pago, { cancelado: true, motivoCancelacion: c.motivo.trim() });
    pedido.pagado = r2(Math.max(0, pedido.pagado - pago.monto));
    bitacora(s, 'CANCELAR_PAGO', 'pedido', pedido.id, `${pago.folio} (${pesos(pago.monto)}): ${c.motivo}`);
    return { ok: true };
  },
  listar(s: Sesion, q: Q) {
    const b = bd();
    const filas = [...b.pagos]
      .sort((x, y) => y.fecha.localeCompare(x.fecha) || y.id - x.id)
      .filter((g) => {
        const p = b.pedidos.find((x) => x.id === g.pedidoId)!;
        const dia = fechaLocal(g.fecha);
        return (!q.desde || dia >= q.desde) && (!q.hasta || dia <= q.hasta) && (!q.metodo || g.metodo === q.metodo) && (!q.clienteId || g.clienteId === Number(q.clienteId)) &&
          (!q.pedidoId || g.pedidoId === Number(q.pedidoId)) && (!s.sucursalId || p.sucursalId === s.sucursalId);
      });
    const pagina = paginar(filas, q.pagina, 60);
    return {
      ...pagina,
      datos: pagina.datos.map((g) => {
        const p = b.pedidos.find((x) => x.id === g.pedidoId)!;
        return { ...g, cliente: ref(b.clientes.find((c) => c.id === g.clienteId)), pedido: { id: p.id, folio: p.folio } };
      }),
    };
  },
  recibo(id: number) {
    const b = bd();
    const pago = buscar(b.pagos, id, 'Pago');
    const pedido = b.pedidos.find((p) => p.id === pago.pedidoId)!;
    const cliente = b.clientes.find((c) => c.id === pago.clienteId)!;
    const insc = b.inscripciones.find((i) => i.pedidoId === pedido.id);
    const acumulado = r2(b.pagos.filter((g) => g.pedidoId === pedido.id && !g.cancelado && g.id <= pago.id).reduce((x, g) => x + g.monto, 0));
    return {
      id: pago.id, folio: pago.folio, fecha: pago.fecha, monto: pago.monto, metodo: pago.metodo, referencia: pago.referencia, notas: pago.notas, cancelado: pago.cancelado,
      motivoCancelacion: pago.motivoCancelacion, recibio: pago.usuarioNombre,
      cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.whatsapp || cliente.telefono, direccion: cliente.direccion },
      pedido: { id: pedido.id, folio: pedido.folio, total: pedido.total, sucursal: b.sucursales.find((x) => x.id === pedido.sucursalId)!.nombre },
      pollitanda: insc ? { folio: insc.folio, programa: b.pollitandas.find((t) => t.id === insc.pollitandaId)!.nombre } : null,
      acumulado, saldoDespues: r2(pedido.total - acumulado),
    };
  },
  porCobrar(s: Sesion, q: Q = {}) {
    const b = bd();
    const dia = hoy();
    const t = q.q?.trim().toLowerCase();
    const cuentas = b.pedidos
      .filter((p) => vigente(p) && p.total > p.pagado && (!s.sucursalId || p.sucursalId === s.sucursalId))
      .map((p) => ({ p, c: b.clientes.find((x) => x.id === p.clienteId)! }))
      .filter(({ p, c }) => !t || c.nombre.toLowerCase().includes(t) || p.folio.toLowerCase().includes(t))
      .sort((x, y) => (x.p.fechaVencimiento ?? '9999').localeCompare(y.p.fechaVencimiento ?? '9999') || x.p.id - y.p.id)
      .map(({ p, c }) => ({
        id: p.id, folio: p.folio, estado: p.estado, esPollitanda: b.inscripciones.some((i) => i.pedidoId === p.id),
        cliente: { id: c.id, nombre: c.nombre, telefono: c.whatsapp || c.telefono }, total: p.total, pagado: p.pagado, saldo: r2(p.total - p.pagado),
        fechaEntrega: p.fechaEntrega, fechaVencimiento: p.fechaVencimiento, diasVencido: p.fechaVencimiento ? Math.max(0, diasEntre(p.fechaVencimiento, dia)) : 0,
      }));
    const suma = (f: (d: number) => boolean) => r2(cuentas.filter((c) => f(c.diasVencido)).reduce((x, c) => x + c.saldo, 0));
    return {
      cuentas, antiguedad: { alCorriente: suma((d) => d === 0), de1a7: suma((d) => d >= 1 && d <= 7), de8a30: suma((d) => d >= 8 && d <= 30), masDe30: suma((d) => d > 30) },
      total: r2(cuentas.reduce((x, c) => x + c.saldo, 0)), vencido: suma((d) => d > 0),
    };
  },
  resumen(s: Sesion) {
    const b = bd();
    const dia = hoy();
    const delMes = b.pagos.filter((g) => !g.cancelado && fechaLocal(g.fecha) >= primerDia(dia) && (!s.sucursalId || b.pedidos.find((p) => p.id === g.pedidoId)!.sucursalId === s.sucursalId));
    const porMetodo = new Map<string, { monto: number; pagos: number }>();
    for (const g of delMes) {
      const m = porMetodo.get(g.metodo) ?? { monto: 0, pagos: 0 };
      porMetodo.set(g.metodo, { monto: m.monto + g.monto, pagos: m.pagos + 1 });
    }
    return {
      cobradoHoy: r2(delMes.filter((g) => fechaLocal(g.fecha) === dia).reduce((x, g) => x + g.monto, 0)), cobradoMes: r2(delMes.reduce((x, g) => x + g.monto, 0)), pagosMes: delMes.length,
      porMetodo: [...porMetodo].map(([metodo, v]) => ({ metodo, monto: r2(v.monto), pagos: v.pagos })).sort((x, y) => y.monto - x.monto), fecha: dia,
    };
  },
};

/* ------------------------------------------------------------------ */
/*  Pollitandas                                                        */
/* ------------------------------------------------------------------ */

/** El estado del expediente se deduce del pedido: nunca contradice a los pagos ni a la entrega */
function estadoExpediente(p: Pedido) {
  if (p.estado === 'CANCELADO') return 'CANCELADO';
  if (p.estado === 'ENTREGADO') return 'ENTREGADO';
  if (p.pagado <= 0) return 'APARTADO';
  return p.pagado >= p.total ? 'LIQUIDADO' : 'EN_PAGOS';
}

function presentarPollitanda(t: Pollitanda) {
  const b = bd();
  const p = b.productos.find((x) => x.id === t.productoId)!;
  const suc = b.sucursales.find((x) => x.id === t.sucursalId)!;
  return { ...t, producto: { id: p.id, nombre: p.nombre, unidad: p.unidad }, sucursal: { id: suc.id, nombre: suc.nombre } };
}

function presentarExpediente(i: Inscripcion) {
  const b = bd();
  const p = b.pedidos.find((x) => x.id === i.pedidoId)!;
  const c = b.clientes.find((x) => x.id === i.clienteId)!;
  const reservado = b.items.filter((it) => it.pedidoId === p.id).reduce((x, it) => x + it.cantidadReservada, 0);
  return {
    id: i.id, folio: i.folio, cliente: { id: c.id, nombre: c.nombre, telefono: c.whatsapp || c.telefono }, paquetes: i.paquetes, cantidadPollitos: i.cantidadPollitos,
    pollitosPorSurtir: abierto(p) ? r2(i.cantidadPollitos - reservado) : 0, total: p.total, pagado: p.pagado, saldo: p.estado === 'CANCELADO' ? 0 : r2(p.total - p.pagado),
    fechaEntrega: p.fechaEntrega, estado: estadoExpediente(p), pedido: { id: p.id, folio: p.folio, estado: p.estado },
  };
}

function validarPollitanda(c: Partial<Pollitanda>) {
  const producto = bd().productos.find((p) => p.id === Number(c.productoId));
  exigir(producto?.activo, 'El producto seleccionado no existe');
  exigir(String(c.nombre ?? '').trim().length >= 3, 'Escribe el nombre del programa');
  exigir(Number(c.pollitosPorPaquete) >= 1 && Number(c.precioPaquete) > 0 && Number(c.cupoPaquetes) >= 1, 'Revisa el tamaño, el precio y el cupo del paquete');
  exigir(c.fechaEntrega, 'Indica la fecha de entrega');
  exigir(!c.fechaCierre || c.fechaCierre <= c.fechaEntrega, 'El cierre de inscripciones debe ser antes de la entrega');
  exigir((Number(c.anticipoMinimo) || 0) <= Number(c.precioPaquete), 'El anticipo mínimo no puede ser mayor al precio del paquete');
}

function estadisticas(t: Pollitanda) {
  const expedientes = bd().inscripciones.filter((i) => i.pollitandaId === t.id).map(presentarExpediente);
  const vigentes = expedientes.filter((e) => e.estado !== 'CANCELADO');
  const paquetes = vigentes.reduce((x, e) => x + e.paquetes, 0);
  const vendido = r2(vigentes.reduce((x, e) => x + e.total, 0));
  const cobrado = r2(vigentes.reduce((x, e) => x + e.pagado, 0));
  return {
    expedientes, participantes: vigentes.length, paquetesVendidos: paquetes, cupoDisponible: Math.max(0, t.cupoPaquetes - paquetes),
    pollitos: vigentes.reduce((x, e) => x + e.cantidadPollitos, 0), pollitosPorSurtir: r2(vigentes.reduce((x, e) => x + e.pollitosPorSurtir, 0)), vendido, cobrado,
    porCobrar: r2(vendido - cobrado), sinAnticipo: vigentes.filter((e) => e.estado === 'APARTADO').length,
  };
}

const pollitandas = {
  listar(s: Sesion) {
    return bd().pollitandas
      .filter((t) => !s.sucursalId || t.sucursalId === s.sucursalId)
      .sort((a, b) => b.fechaEntrega.localeCompare(a.fechaEntrega) || b.id - a.id)
      .map((t) => {
        const { expedientes: _omitidos, ...stats } = estadisticas(t);
        return { ...presentarPollitanda(t), ...stats };
      });
  },
  detalle(s: Sesion, id: number) {
    const t = buscar(bd().pollitandas, id, 'Pollitanda');
    exigir(!s.sucursalId || t.sucursalId === s.sucursalId, 'Pollitanda no encontrada', 404);
    return { ...presentarPollitanda(t), ...estadisticas(t) };
  },
  crear(s: Sesion, c: Partial<Pollitanda>) {
    validarPollitanda(c);
    const t: Pollitanda = {
      id: nuevoId('pollitandas'), nombre: c.nombre!.trim(), descripcion: texto(c.descripcion), productoId: Number(c.productoId), sucursalId: sucursalPara(s, c.sucursalId),
      pollitosPorPaquete: Number(c.pollitosPorPaquete), precioPaquete: r2(Number(c.precioPaquete)), anticipoMinimo: r2(Number(c.anticipoMinimo) || 0), cupoPaquetes: Number(c.cupoPaquetes),
      fechaCierre: c.fechaCierre || null, fechaEntrega: c.fechaEntrega!, preventa: c.preventa ?? true, estado: 'ABIERTA', createdAt: ahora(),
    };
    bd().pollitandas.push(t);
    bitacora(s, 'CREAR', 'pollitanda', t.id, `Nueva Pollitanda "${t.nombre}"`);
    return pollitandas.detalle(s, t.id);
  },
  editar(s: Sesion, id: number, c: Partial<Pollitanda>) {
    const b = bd();
    const t = buscar(b.pollitandas, id, 'Pollitanda');
    validarPollitanda(c);
    const inscritos = b.inscripciones.filter((i) => i.pollitandaId === id);
    if (inscritos.length) {
      exigir(Number(c.productoId) === t.productoId && Number(c.pollitosPorPaquete) === t.pollitosPorPaquete && r2(Number(c.precioPaquete)) === t.precioPaquete,
        'Esta Pollitanda ya tiene participantes: no se puede cambiar el producto, el tamaño ni el precio del paquete');
    }
    if (c.fechaEntrega !== t.fechaEntrega) {
      for (const i of inscritos) {
        const p = b.pedidos.find((x) => x.id === i.pedidoId)!;
        if (['RECIBIDO', 'PREPARADO', 'INCIDENCIA'].includes(p.estado)) p.fechaEntrega = c.fechaEntrega!;
      }
    }
    Object.assign(t, {
      nombre: c.nombre!.trim(), descripcion: texto(c.descripcion), productoId: Number(c.productoId), pollitosPorPaquete: Number(c.pollitosPorPaquete), precioPaquete: r2(Number(c.precioPaquete)),
      anticipoMinimo: r2(Number(c.anticipoMinimo) || 0), cupoPaquetes: Number(c.cupoPaquetes), fechaCierre: c.fechaCierre || null, fechaEntrega: c.fechaEntrega, preventa: c.preventa ?? t.preventa,
      ...(c.estado ? { estado: c.estado } : {}),
    });
    bitacora(s, 'EDITAR', 'pollitanda', id, `Cambios en "${t.nombre}"`);
    return pollitandas.detalle(s, id);
  },
  /** Inscribe al participante: genera el pedido, aparta las aves y registra el anticipo en una sola operación */
  inscribir(s: Sesion, pollitandaId: number, c: { clienteId: number; paquetes: number; anticipo?: { monto: number; metodo: MetodoPago; referencia?: string }; notas?: string | null }) {
    const b = bd();
    const t = buscar(b.pollitandas, pollitandaId, 'Pollitanda');
    exigir(!s.sucursalId || t.sucursalId === s.sucursalId, 'Pollitanda no encontrada', 404);
    exigir(t.estado === 'ABIERTA', 'Esta Pollitanda ya no acepta inscripciones');
    exigir(!t.fechaCierre || t.fechaCierre >= hoy(), `Las inscripciones cerraron el ${t.fechaCierre ? fechaLarga(t.fechaCierre) : ''}`);
    const paquetes = Number(c.paquetes);
    exigir(Number.isInteger(paquetes) && paquetes >= 1, 'Indica cuántos paquetes');
    const cupo = estadisticas(t).cupoDisponible;
    if (paquetes > cupo) throw new ErrorHttp(409, cupo > 0 ? `Solo quedan ${cupo} paquetes disponibles en esta Pollitanda` : 'Esta Pollitanda ya está llena');
    const producto = b.productos.find((p) => p.id === t.productoId)!;
    const cantidadPollitos = paquetes * t.pollitosPorPaquete;
    const total = r2(paquetes * t.precioPaquete);
    const anticipo = r2(c.anticipo?.monto ?? 0);
    const minimo = r2(t.anticipoMinimo * paquetes);
    exigir(anticipo === 0 || anticipo >= minimo, `El anticipo mínimo es de ${pesos(minimo)} (${pesos(t.anticipoMinimo)} por paquete)`);

    const pedido = crearPedido(s, {
      clienteId: c.clienteId, sucursalId: t.sucursalId,
      renglones: [{ productoId: t.productoId, descripcion: `${producto.nombre} · Pollitanda ${t.nombre} (${paquetes} paq. de ${t.pollitosPorPaquete})`, cantidad: cantidadPollitos, precioUnitario: r2(t.precioPaquete / t.pollitosPorPaquete), importe: total }],
      descuento: 0, fechaEntrega: t.fechaEntrega, fechaVencimiento: t.fechaEntrega, notas: texto(c.notas), confirmar: true, permitirFaltante: t.preventa, omitirAviso: true,
    });
    const insc: Inscripcion = { id: nuevoId('inscripciones'), folio: folio('PT'), pollitandaId: t.id, clienteId: Number(c.clienteId), paquetes, cantidadPollitos, pedidoId: pedido.id, notas: texto(c.notas), createdAt: ahora() };
    b.inscripciones.push(insc);
    const cliente = b.clientes.find((x) => x.id === insc.clienteId)!;
    notificar('pollitanda_inscripcion', cliente, { programa: t.nombre, pollitos: cantidadPollitos, total: pesos(total), fechaEntrega: fechaLarga(t.fechaEntrega), folio: insc.folio }, insc.folio);
    if (anticipo > 0) registrarPago(s, { pedidoId: pedido.id, monto: anticipo, metodo: c.anticipo!.metodo, referencia: c.anticipo!.referencia, notas: `Anticipo Pollitanda ${t.nombre}` });
    bitacora(s, 'INSCRIBIR', 'pollitanda', t.id, `${insc.folio}: ${cliente.nombre}, ${paquetes} paq. (${cantidadPollitos} aves) · pedido ${pedido.folio}`);
    return pollitandas.expediente(s, insc.id);
  },
  expediente(s: Sesion, id: number) {
    const b = bd();
    const i = buscar(b.inscripciones, id, 'Expediente');
    const t = b.pollitandas.find((x) => x.id === i.pollitandaId)!;
    exigir(!s.sucursalId || t.sucursalId === s.sucursalId, 'Expediente no encontrado', 404);
    return {
      ...presentarExpediente(i), notas: i.notas, createdAt: i.createdAt,
      pollitanda: { id: t.id, nombre: t.nombre, pollitosPorPaquete: t.pollitosPorPaquete, precioPaquete: t.precioPaquete, anticipoMinimo: t.anticipoMinimo, producto: b.productos.find((p) => p.id === t.productoId)!.nombre },
      pagos: b.pagos.filter((g) => g.pedidoId === i.pedidoId).map((g) => ({ id: g.id, folio: g.folio, monto: g.monto, metodo: g.metodo, referencia: g.referencia, fecha: g.fecha, cancelado: g.cancelado })),
    };
  },
  baja(s: Sesion, id: number, c: { motivo: string }) {
    const i = buscar(bd().inscripciones, id, 'Expediente');
    cancelarPedido(s, pedidoDe(s, i.pedidoId), c.motivo);
    bitacora(s, 'BAJA', 'pollitanda', i.pollitandaId, `${i.folio} dado de baja: ${c.motivo}`);
    return pollitandas.expediente(s, id);
  },
};

/* ------------------------------------------------------------------ */
/*  Inicio y reportes                                                  */
/* ------------------------------------------------------------------ */

function tablero(s: Sesion) {
  const b = bd();
  const dia = hoy();
  const mes = primerDia(dia);
  const mesAnterior = primerDia(sumarDias(mes, -1));
  const verDinero = tiene(s, 'reportes.finanzas') || tiene(s, 'cobranza.ver');
  const verVentas = tiene(s, 'ventas.ver');
  const propios = b.pedidos.filter((p) => !s.sucursalId || p.sucursalId === s.sucursalId);
  const firmes = propios.filter(vigente).map((p) => ({ p, dia: p.confirmadoAt ? fechaLocal(p.confirmadoAt) : '' }));
  const delMes = firmes.filter((x) => x.dia >= mes);
  const cobros = b.pagos.filter((g) => !g.cancelado && propios.some((p) => p.id === g.pedidoId)).map((g) => ({ g, dia: fechaLocal(g.fecha) }));
  const suma = <T,>(filas: T[], f: (x: T) => number) => r2(filas.reduce((x, y) => x + f(y), 0));
  const cuenta = (e: EstadoPedido) => propios.filter((p) => p.estado === e).length;

  const top = new Map<number, { cantidad: number; importe: number }>();
  for (const { p } of delMes) {
    for (const i of b.items.filter((x) => x.pedidoId === p.id)) {
      const t = top.get(i.productoId) ?? { cantidad: 0, importe: 0 };
      top.set(i.productoId, { cantidad: t.cantidad + i.cantidad, importe: t.importe + i.importe });
    }
  }

  // Alertas
  const alertas: { tipo: string; nivel: 'alta' | 'media'; titulo: string; detalle: string; enlace: string }[] = [];
  const uno = (n: number, singular: string, plural: string) => (n === 1 ? `1 ${singular}` : `${n} ${plural}`);
  if (tiene(s, 'inventario.ver')) {
    for (const e of inventario.existencias(s)) {
      const enlace = `/inventario?producto=${e.id}`;
      if (e.porSurtir > 0) alertas.push({ tipo: 'preventa', nivel: 'alta', titulo: `Por surtir: ${e.nombre}`, detalle: `${e.porSurtir} vendidos en preventa que aún no tienen lote`, enlace });
      else if (e.bajoMinimo) alertas.push({ tipo: 'inventario', nivel: e.disponible <= 0 ? 'alta' : 'media', titulo: `${e.disponible <= 0 ? 'Sin existencia' : 'Existencia baja'}: ${e.nombre}`, detalle: `Quedan ${e.disponible} disponibles · mínimo ${e.stockMinimo}`, enlace });
      if (e.porCaducar) alertas.push({ tipo: 'caducidad', nivel: e.proximaCaducidad! < dia ? 'alta' : 'media', titulo: `${e.proximaCaducidad! < dia ? 'Lote vencido' : 'Lote por vencer'}: ${e.nombre}`, detalle: `Fecha límite de venta: ${fechaLarga(e.proximaCaducidad!)}`, enlace });
    }
  }
  if (verVentas) {
    const incidencias = cuenta('INCIDENCIA');
    const cotizaciones = propios.filter((p) => p.estado === 'COTIZACION' && horasDesde(p.createdAt) > 72).length;
    const sinAnticipo = propios.filter((p) => ['RECIBIDO', 'PREPARADO'].includes(p.estado) && p.pagado === 0 && horasDesde(p.createdAt) > 48 && b.inscripciones.some((i) => i.pedidoId === p.id)).length;
    if (incidencias) alertas.push({ tipo: 'incidencia', nivel: 'alta', titulo: uno(incidencias, 'pedido con incidencia', 'pedidos con incidencia'), detalle: 'Hay que resolverla para poder entregar', enlace: '/ventas?estado=INCIDENCIA' });
    if (cotizaciones) alertas.push({ tipo: 'cotizacion', nivel: 'media', titulo: uno(cotizaciones, 'cotización sin respuesta', 'cotizaciones sin respuesta'), detalle: 'Más de 3 días sin confirmarse', enlace: '/ventas?grupo=cotizaciones' });
    if (sinAnticipo) alertas.push({ tipo: 'anticipo', nivel: 'media', titulo: uno(sinAnticipo, 'lugar de Pollitanda sin anticipo', 'lugares de Pollitanda sin anticipo'), detalle: 'Apartados hace más de 2 días', enlace: '/pollitandas' });
  }
  const vencidos = firmes.filter(({ p }) => p.total > p.pagado && p.fechaVencimiento && p.fechaVencimiento < dia);
  if (verDinero && vencidos.length) alertas.push({ tipo: 'cobranza', nivel: 'alta', titulo: uno(vencidos.length, 'cuenta vencida', 'cuentas vencidas'), detalle: `Saldo vencido: ${pesos(suma(vencidos, ({ p }) => p.total - p.pagado))}`, enlace: '/cobranza' });
  alertas.sort((x, y) => (x.nivel === y.nivel ? 0 : x.nivel === 'alta' ? -1 : 1));

  return {
    fecha: dia,
    dinero: verDinero
      ? {
          ventasMes: suma(delMes, ({ p }) => p.total), ventasMesAnterior: suma(firmes.filter((x) => x.dia >= mesAnterior && x.dia < mes), ({ p }) => p.total),
          ventasHoy: suma(firmes.filter((x) => x.dia === dia), ({ p }) => p.total), pedidosMes: delMes.length, cobradoMes: suma(cobros.filter((x) => x.dia >= mes), ({ g }) => g.monto),
          cobradoHoy: suma(cobros.filter((x) => x.dia === dia), ({ g }) => g.monto), porCobrar: suma(firmes, ({ p }) => p.total - p.pagado), vencido: suma(vencidos, ({ p }) => p.total - p.pagado),
        }
      : null,
    pedidos: verVentas ? { cotizaciones: cuenta('COTIZACION'), recibidos: cuenta('RECIBIDO'), preparados: cuenta('PREPARADO'), enRuta: cuenta('EN_RUTA'), incidencias: cuenta('INCIDENCIA') } : null,
    serie: verDinero
      ? Array.from({ length: 14 }, (_, i) => {
          const d = sumarDias(dia, i - 13);
          const suyos = firmes.filter((x) => x.dia === d);
          return { dia: d, total: suma(suyos, ({ p }) => p.total), pedidos: suyos.length };
        })
      : null,
    topProductos: verDinero
      ? [...top].sort((x, y) => y[1].importe - x[1].importe).slice(0, 5).map(([id, v]) => {
          const p = b.productos.find((x) => x.id === id)!;
          return { nombre: p.nombre, unidad: p.unidad, cantidad: r2(v.cantidad), importe: r2(v.importe) };
        })
      : null,
    entregas: verVentas
      ? propios.filter((p) => abierto(p) && p.fechaEntrega && p.fechaEntrega <= sumarDias(dia, 7)).sort((x, y) => x.fechaEntrega!.localeCompare(y.fechaEntrega!) || x.id - y.id).slice(0, 12).map((p) => ({
          id: p.id, folio: p.folio, estado: p.estado, fechaEntrega: p.fechaEntrega!, cliente: b.clientes.find((c) => c.id === p.clienteId)!.nombre, saldo: r2(p.total - p.pagado),
          esPollitanda: b.inscripciones.some((i) => i.pedidoId === p.id), atrasada: p.fechaEntrega! < dia,
        }))
      : [],
    pollitandas: tiene(s, 'pollitandas.ver')
      ? b.pollitandas.filter((t) => t.estado === 'ABIERTA' && (!s.sucursalId || t.sucursalId === s.sucursalId)).sort((x, y) => x.fechaEntrega.localeCompare(y.fechaEntrega)).slice(0, 4).map((t) => {
          const e = estadisticas(t);
          return { id: t.id, nombre: t.nombre, fechaEntrega: t.fechaEntrega, cupoPaquetes: t.cupoPaquetes, paquetes: e.paquetesVendidos, vendido: e.vendido, cobrado: e.cobrado };
        })
      : [],
    seguimientos: tiene(s, 'clientes.ver') ? clientes.pendientes(s) : [],
    alertas,
  };
}

function reporteVentas(s: Sesion, q: Q) {
  const b = bd();
  const hasta = q.hasta || hoy();
  const desde = q.desde || primerDia(hasta);
  exigir(/^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && desde <= hasta, 'Periodo no válido');
  const propios = b.pedidos.filter((p) => !s.sucursalId || p.sucursalId === s.sucursalId);
  const ventas = propios.filter((p) => vigente(p) && p.confirmadoAt).map((p) => ({ p, dia: fechaLocal(p.confirmadoAt!) })).filter((x) => x.dia >= desde && x.dia <= hasta);
  const agrupar = <K,>(clave: (x: { p: Pedido; dia: string }) => K) => {
    const m = new Map<K, { pedidos: number; total: number; saldo: number }>();
    for (const x of ventas) {
      const k = clave(x);
      const v = m.get(k) ?? { pedidos: 0, total: 0, saldo: 0 };
      m.set(k, { pedidos: v.pedidos + 1, total: v.total + x.p.total, saldo: v.saldo + (x.p.total - x.p.pagado) });
    }
    return [...m];
  };
  const porProducto = new Map<number, { cantidad: number; importe: number }>();
  for (const { p } of ventas) {
    for (const i of b.items.filter((x) => x.pedidoId === p.id)) {
      const v = porProducto.get(i.productoId) ?? { cantidad: 0, importe: 0 };
      porProducto.set(i.productoId, { cantidad: v.cantidad + i.cantidad, importe: v.importe + i.importe });
    }
  }
  const cobros = b.pagos.filter((g) => !g.cancelado && propios.some((p) => p.id === g.pedidoId) && fechaLocal(g.fecha) >= desde && fechaLocal(g.fecha) <= hasta);
  const porMetodo = new Map<string, { pagos: number; monto: number }>();
  for (const g of cobros) {
    const v = porMetodo.get(g.metodo) ?? { pagos: 0, monto: 0 };
    porMetodo.set(g.metodo, { pagos: v.pagos + 1, monto: v.monto + g.monto });
  }
  const cotizadas = propios.filter((p) => (p.folioCotizacion || p.estado === 'COTIZACION') && fechaLocal(p.createdAt) >= desde && fechaLocal(p.createdAt) <= hasta);
  const total = r2(ventas.reduce((x, { p }) => x + p.total, 0));
  const cobrado = r2(ventas.reduce((x, { p }) => x + p.pagado, 0));
  return {
    desde, hasta,
    totales: {
      pedidos: ventas.length, total, descuentos: r2(ventas.reduce((x, { p }) => x + p.descuento, 0)), cobrado, porCobrar: r2(total - cobrado), ticketPromedio: ventas.length ? r2(total / ventas.length) : 0,
      cobradoEnPeriodo: r2(cobros.reduce((x, g) => x + g.monto, 0)), cotizacionesEmitidas: cotizadas.length, cotizacionesGanadas: cotizadas.filter(vigente).length,
    },
    porDia: agrupar((x) => x.dia).sort((x, y) => x[0].localeCompare(y[0])).map(([dia, v]) => ({ dia, pedidos: v.pedidos, total: r2(v.total) })),
    porProducto: [...porProducto].sort((x, y) => y[1].importe - x[1].importe).map(([id, v]) => {
      const p = b.productos.find((x) => x.id === id)!;
      return { sku: p.sku, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, cantidad: r2(v.cantidad), importe: r2(v.importe) };
    }),
    porVendedor: agrupar((x) => x.p.vendedorId).sort((x, y) => y[1].total - x[1].total).map(([id, v]) => ({ vendedor: b.usuarios.find((u) => u.id === id)?.nombre ?? 'Sin vendedor', pedidos: v.pedidos, total: r2(v.total) })),
    porCliente: agrupar((x) => x.p.clienteId).sort((x, y) => y[1].total - x[1].total).slice(0, 20).map(([id, v]) => {
      const c = b.clientes.find((x) => x.id === id)!;
      return { id: c.id, nombre: c.nombre, tipo: c.tipo, pedidos: v.pedidos, total: r2(v.total), saldo: r2(v.saldo) };
    }),
    cobranza: [...porMetodo].sort((x, y) => y[1].monto - x[1].monto).map(([metodo, v]) => ({ metodo, pagos: v.pagos, monto: r2(v.monto) })),
  };
}

/* ------------------------------------------------------------------ */
/*  Rutas                                                              */
/* ------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Manejador = (c: { s: Sesion; id: number; q: Q; cuerpo: any }) => unknown;
const P = (...permisos: string[]) => permisos;

/** [método, ruta, permisos (basta uno; vacío = cualquier usuario), manejador] */
const RUTAS: [string, string, string[], Manejador][] = [
  ['GET', '/auth/yo', P(), ({ s }) => acceso.yo(s)],
  ['POST', '/auth/password', P(), ({ s, cuerpo }) => acceso.password(s, cuerpo)],
  ['GET', '/usuarios', P('config.usuarios'), () => acceso.usuarios()],
  ['GET', '/usuarios/permisos', P('config.usuarios'), () => acceso.catalogo()],
  ['POST', '/usuarios', P('config.usuarios'), ({ s, cuerpo }) => acceso.crearUsuario(s, cuerpo)],
  ['PATCH', '/usuarios/:id', P('config.usuarios'), ({ s, id, cuerpo }) => acceso.editarUsuario(s, id, cuerpo)],
  ['GET', '/sucursales', P(), () => acceso.sucursales()],
  ['POST', '/sucursales', P('config.catalogos'), ({ s, cuerpo }) => acceso.crearSucursal(s, cuerpo)],
  ['PATCH', '/sucursales/:id', P('config.catalogos'), ({ s, id, cuerpo }) => acceso.editarSucursal(s, id, cuerpo)],
  ['GET', '/bitacora', P('config.bitacora'), ({ q }) => acceso.bitacora(q)],

  ['GET', '/clientes', P('clientes.ver'), ({ q }) => clientes.listar(q)],
  ['GET', '/clientes/:id', P('clientes.ver'), ({ id }) => clientes.detalle(id)],
  ['POST', '/clientes', P('clientes.editar'), ({ s, cuerpo }) => clientes.crear(s, cuerpo)],
  ['PATCH', '/clientes/:id', P('clientes.editar'), ({ s, id, cuerpo }) => clientes.editar(s, id, cuerpo)],
  ['POST', '/clientes/:id/seguimientos', P('clientes.editar'), ({ s, id, cuerpo }) => clientes.seguimiento(s, id, cuerpo)],
  ['GET', '/seguimientos/pendientes', P('clientes.ver'), ({ s }) => clientes.pendientes(s)],
  ['PATCH', '/seguimientos/:id', P('clientes.editar'), ({ id, cuerpo }) => clientes.completar(id, cuerpo.completado)],

  ['GET', '/productos', P('productos.ver', 'ventas.crear', 'inventario.ver'), ({ q }) => productos.listar(q)],
  ['POST', '/productos', P('productos.editar'), ({ s, cuerpo }) => productos.guardar(s, null, cuerpo)],
  ['PATCH', '/productos/:id', P('productos.editar'), ({ s, id, cuerpo }) => productos.guardar(s, id, cuerpo)],

  ['GET', '/inventario/existencias', P('inventario.ver', 'productos.ver'), ({ s, q }) => inventario.existencias(s, q)],
  ['GET', '/inventario/lotes', P('inventario.ver'), ({ s, q }) => inventario.lotes(s, q)],
  ['GET', '/inventario/movimientos', P('inventario.ver'), ({ s, q }) => inventario.movimientos(s, q)],
  ['POST', '/inventario/lotes', P('inventario.entrada'), ({ s, cuerpo }) => inventario.entrada(s, cuerpo)],
  ['POST', '/inventario/lotes/:id/ajuste', P('inventario.ajustar'), ({ s, id, cuerpo }) => inventario.ajuste(s, id, cuerpo)],

  ['GET', '/pedidos', P('ventas.ver'), ({ s, q }) => pedidos.listar(s, q)],
  ['GET', '/pedidos/:id', P('ventas.ver', 'cobranza.ver'), ({ s, id }) => pedidos.detalle(s, id)],
  ['POST', '/pedidos', P('ventas.crear'), ({ s, cuerpo }) => pedidos.crear(s, cuerpo)],
  ['POST', '/pedidos/:id/confirmar', P('ventas.crear'), ({ s, id, cuerpo }) => pedidos.confirmar(s, id, cuerpo)],
  ['POST', '/pedidos/:id/reservar', P('ventas.crear', 'ventas.estado'), ({ s, id }) => pedidos.reservar(s, id)],
  ['POST', '/pedidos/:id/estado', P('ventas.estado'), ({ s, id, cuerpo }) => pedidos.estado(s, id, cuerpo)],
  ['POST', '/pedidos/:id/cancelar', P('ventas.cancelar', 'ventas.crear'), ({ s, id, cuerpo }) => pedidos.cancelar(s, id, cuerpo)],

  ['GET', '/pagos', P('cobranza.ver'), ({ s, q }) => pagos.listar(s, q)],
  ['GET', '/pagos/:id', P('cobranza.ver'), ({ id }) => pagos.recibo(id)],
  ['POST', '/pagos', P('cobranza.registrar'), ({ s, cuerpo }) => pagos.registrar(s, cuerpo)],
  ['POST', '/pagos/:id/cancelar', P('cobranza.cancelar'), ({ s, id, cuerpo }) => pagos.cancelar(s, id, cuerpo)],
  ['GET', '/cobranza/por-cobrar', P('cobranza.ver'), ({ s, q }) => pagos.porCobrar(s, q)],
  ['GET', '/cobranza/resumen', P('cobranza.ver'), ({ s }) => pagos.resumen(s)],

  ['GET', '/pollitandas', P('pollitandas.ver'), ({ s }) => pollitandas.listar(s)],
  ['GET', '/pollitandas/expedientes/:id', P('pollitandas.ver'), ({ s, id }) => pollitandas.expediente(s, id)],
  ['POST', '/pollitandas/expedientes/:id/baja', P('pollitandas.admin', 'ventas.cancelar'), ({ s, id, cuerpo }) => pollitandas.baja(s, id, cuerpo)],
  ['GET', '/pollitandas/:id', P('pollitandas.ver'), ({ s, id }) => pollitandas.detalle(s, id)],
  ['POST', '/pollitandas', P('pollitandas.admin'), ({ s, cuerpo }) => pollitandas.crear(s, cuerpo)],
  ['PATCH', '/pollitandas/:id', P('pollitandas.admin'), ({ s, id, cuerpo }) => pollitandas.editar(s, id, cuerpo)],
  ['POST', '/pollitandas/:id/inscripciones', P('pollitandas.inscribir'), ({ s, id, cuerpo }) => pollitandas.inscribir(s, id, cuerpo)],

  ['GET', '/notificaciones', P('mensajes.ver'), ({ q }) => notificaciones.listar(q)],
  ['POST', '/notificaciones', P('mensajes.enviar'), ({ s, cuerpo }) => notificaciones.manual(s, cuerpo)],
  ['POST', '/notificaciones/recordatorios', P('mensajes.enviar'), () => notificaciones.recordatorios()],
  ['POST', '/notificaciones/:id/estado', P('mensajes.enviar'), ({ s, id, cuerpo }) => notificaciones.marcar(s, id, cuerpo.estado)],

  ['GET', '/dashboard', P(), ({ s }) => tablero(s)],
  ['GET', '/reportes/ventas', P('reportes.ver'), ({ s, q }) => reporteVentas(s, q)],
];

const COMPILADAS = RUTAS.map(([metodo, ruta, permisos, manejador]) => ({ metodo, permisos, manejador, patron: new RegExp(`^${ruta.replace(':id', '(\\d+)')}$`) }));

/** Atiende una petición igual que lo haría la API. Lanza ErrorHttp con el mismo mensaje. */
export function atender(metodo: string, rutaCompleta: string, cuerpo: unknown, token: string | null): unknown {
  const [ruta, consulta = ''] = rutaCompleta.split('?');
  if (metodo === 'POST' && ruta === '/auth/login') return acceso.login((cuerpo ?? {}) as { email?: string; password?: string });

  const usuario = bd().usuarios.find((u) => token === `demo.${u.id}`);
  if (!token) throw new ErrorHttp(401, 'Inicia sesión para continuar');
  if (!usuario || !usuario.activo) throw new ErrorHttp(401, 'Tu usuario está desactivado');
  const s = sesionDe(usuario);

  for (const r of COMPILADAS) {
    const coincide = r.metodo === metodo && r.patron.exec(ruta);
    if (!coincide) continue;
    if (r.permisos.length && !r.permisos.some((p) => tiene(s, p))) throw new ErrorHttp(403, 'No tienes permiso para realizar esta acción');
    return r.manejador({ s, id: Number(coincide[1]), q: Object.fromEntries(new URLSearchParams(consulta)), cuerpo: cuerpo ?? {} });
  }
  throw new ErrorHttp(404, 'Ruta no encontrada');
}

/** Acceso directo a las operaciones, para sembrar los datos de ejemplo */
export const motor = { acceso, clientes, productos, inventario, pedidos, pagos, pollitandas, notificaciones };
