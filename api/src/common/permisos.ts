/** Puestos del sistema. Este archivo no depende de nada más: lo usan la API y la demostración. */
export const ROLES = ['DIRECTOR', 'ADMIN', 'VENTAS', 'INVENTARIO', 'COBRANZA', 'LOGISTICA', 'GRANJA'] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Catálogo de permisos del sistema. Cada permiso es "módulo.acción".
 * El rol define la base; por empleado se pueden conceder o retirar permisos
 * puntuales (Usuario.permisosExtra / Usuario.permisosDenegados).
 */
export const PERMISOS = {
  'clientes.ver': 'Consultar clientes y prospectos',
  'clientes.editar': 'Registrar y editar clientes, y dar seguimiento',
  'ventas.ver': 'Consultar cotizaciones y pedidos',
  'ventas.crear': 'Crear cotizaciones y pedidos',
  'ventas.estado': 'Preparar, enviar y entregar pedidos',
  'ventas.cancelar': 'Cancelar pedidos',
  'ventas.descuento': 'Aplicar descuentos',
  'pollitandas.ver': 'Consultar Pollitandas y expedientes',
  'pollitandas.inscribir': 'Inscribir participantes',
  'pollitandas.admin': 'Crear y administrar programas',
  'productos.ver': 'Consultar el catálogo',
  'productos.editar': 'Editar productos y precios',
  'inventario.ver': 'Consultar existencias y movimientos',
  'inventario.entrada': 'Registrar entradas de lotes',
  'inventario.ajustar': 'Ajustar existencias (mermas, conteos)',
  'cobranza.ver': 'Consultar pagos y saldos',
  'cobranza.registrar': 'Registrar pagos',
  'cobranza.cancelar': 'Cancelar pagos',
  'mensajes.ver': 'Consultar la bandeja de WhatsApp',
  'mensajes.enviar': 'Enviar y gestionar mensajes',
  'reportes.ver': 'Consultar reportes de ventas',
  'reportes.finanzas': 'Ver indicadores financieros',
  'config.usuarios': 'Administrar usuarios y permisos',
  'config.catalogos': 'Administrar sucursales y catálogos',
  'config.bitacora': 'Consultar la bitácora de cambios',
} as const;

export type Permiso = keyof typeof PERMISOS;
export const TODOS_LOS_PERMISOS = Object.keys(PERMISOS) as Permiso[];

export const PERMISOS_POR_ROL: Record<Rol, Permiso[]> = {
  DIRECTOR: TODOS_LOS_PERMISOS,
  ADMIN: TODOS_LOS_PERMISOS,
  VENTAS: [
    'clientes.ver',
    'clientes.editar',
    'ventas.ver',
    'ventas.crear',
    'pollitandas.ver',
    'pollitandas.inscribir',
    'productos.ver',
    'inventario.ver',
    'cobranza.ver',
    'cobranza.registrar',
    'mensajes.ver',
    'mensajes.enviar',
  ],
  INVENTARIO: [
    'productos.ver',
    'productos.editar',
    'inventario.ver',
    'inventario.entrada',
    'inventario.ajustar',
    'ventas.ver',
    'ventas.estado',
  ],
  COBRANZA: [
    'clientes.ver',
    'ventas.ver',
    'pollitandas.ver',
    'cobranza.ver',
    'cobranza.registrar',
    'cobranza.cancelar',
    'mensajes.ver',
    'mensajes.enviar',
    'reportes.ver',
  ],
  LOGISTICA: ['clientes.ver', 'ventas.ver', 'ventas.estado', 'inventario.ver', 'mensajes.ver'],
  GRANJA: ['productos.ver', 'inventario.ver', 'inventario.entrada'],
};

export const NOMBRES_ROL: Record<Rol, string> = {
  DIRECTOR: 'Director general',
  ADMIN: 'Administrador',
  VENTAS: 'Ventas',
  INVENTARIO: 'Almacén e inventario',
  COBRANZA: 'Cobranza',
  LOGISTICA: 'Logística',
  GRANJA: 'Encargado de granja',
};

export function permisosEfectivos(rol: Rol, extra: string[] = [], denegados: string[] = []): Permiso[] {
  const base = new Set<string>(PERMISOS_POR_ROL[rol] ?? []);
  for (const p of extra) if (p in PERMISOS) base.add(p);
  for (const p of denegados) base.delete(p);
  return [...base] as Permiso[];
}
