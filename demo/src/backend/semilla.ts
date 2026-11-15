/**
 * Datos de ejemplo de la demostración. Se generan con las mismas operaciones del sistema,
 * así inventario, apartados, pagos y saldos quedan cuadrados. Todo es ficticio.
 */
import { permisosEfectivos } from '../../../api/src/common/permisos';
import { BD, MetodoPago, Rol } from './bd';
import { hoy, motor, Sesion, sumarDias } from './servidor';

export const CLAVE_DEMO = 'Avicola2026';
export const USUARIOS_DEMO: { rol: string; nombre: string; email: string; clave: string; tipo: Rol; soloMatriz?: boolean }[] = [
  { rol: 'Director general', nombre: 'Dirección General', email: 'direccion@avicolasanangel.com', clave: CLAVE_DEMO, tipo: 'DIRECTOR' },
  { rol: 'Ventas', nombre: 'Mariana López', email: 'ventas@avicolasanangel.com', clave: CLAVE_DEMO, tipo: 'VENTAS' },
  { rol: 'Almacén', nombre: 'Luis Hernández', email: 'almacen@avicolasanangel.com', clave: CLAVE_DEMO, tipo: 'INVENTARIO' },
  { rol: 'Cobranza', nombre: 'Patricia Gómez', email: 'cobranza@avicolasanangel.com', clave: CLAVE_DEMO, tipo: 'COBRANZA' },
  { rol: 'Logística', nombre: 'Raúl Mendoza', email: 'logistica@avicolasanangel.com', clave: CLAVE_DEMO, tipo: 'LOGISTICA' },
  { rol: 'Granja', nombre: 'José Ortiz', email: 'granja@avicolasanangel.com', clave: CLAVE_DEMO, tipo: 'GRANJA', soloMatriz: true },
];

const haceDias = (dias: number, minutos = 0) => new Date(Date.now() - dias * 86_400_000 - minutos * 60_000).toISOString();

export function sembrar(bd: BD) {
  const dia = hoy();
  const creado = new Date().toISOString();

  /* Sucursales y usuarios */
  bd.sucursales.push(
    { id: 1, nombre: 'Granja San Ángel (matriz)', direccion: 'Instalaciones de la granja', activa: true, createdAt: creado },
    { id: 2, nombre: 'Punto de venta Centro', direccion: 'Local de venta al público', activa: true, createdAt: creado },
  );
  bd.ids.sucursales = 2;
  USUARIOS_DEMO.forEach((u, i) =>
    bd.usuarios.push({ id: i + 1, nombre: u.nombre, email: u.email, clave: u.clave, rol: u.tipo, sucursalId: u.soloMatriz ? 1 : null, permisosExtra: [], permisosDenegados: [], activo: true, ultimoAcceso: null, createdAt: creado }),
  );
  bd.ids.usuarios = USUARIOS_DEMO.length;
  const sesion = (rol: Rol): Sesion => {
    const u = bd.usuarios.find((x) => x.rol === rol)!;
    return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sucursalId: u.sucursalId, permisos: permisosEfectivos(u.rol) };
  };
  const director = sesion('DIRECTOR');
  const ventas = { ...sesion('VENTAS'), permisos: director.permisos }; // la demo registra las ventas a nombre de la vendedora
  const almacen = sesion('INVENTARIO');
  const cobranza = sesion('COBRANZA');
  const logistica = sesion('LOGISTICA');

  /* Catálogo: clave, nombre, categoría, unidad, precio, mínimo, días de aviso */
  const catalogo: [string, string, string, string, number, number, number][] = [
    ['HUE-BCO-360', 'Huevo blanco · caja 360 pzas', 'HUEVO', 'caja', 780, 20, 4],
    ['HUE-ROJ-360', 'Huevo rojo · caja 360 pzas', 'HUEVO', 'caja', 840, 10, 4],
    ['HUE-BCO-030', 'Huevo blanco · cartera 30 pzas', 'HUEVO', 'cartera', 72, 60, 4],
    ['POL-ENG-01', 'Pollito de engorda (1 día)', 'POLLITO', 'pollito', 17.5, 200, 2],
    ['POL-PON-01', 'Pollita ponedora (1 día)', 'POLLITO', 'pollita', 32, 100, 2],
    ['AVE-POS-18', 'Gallina de postura (18 semanas)', 'AVE', 'ave', 185, 30, 7],
    ['ALI-INI-40', 'Alimento iniciador · bulto 40 kg', 'ALIMENTO', 'bulto', 520, 15, 15],
    ['ALI-POS-40', 'Alimento postura · bulto 40 kg', 'ALIMENTO', 'bulto', 468, 20, 15],
    ['EMP-CON-100', 'Cono de cartón 30 pzas · paca 100', 'EMPAQUE', 'paca', 145, 10, 0],
    ['EMP-CAJ-360', 'Caja de cartón para 360 pzas', 'EMPAQUE', 'pieza', 18, 100, 0],
    ['INS-VIT-100', 'Vitaminas + electrolitos · sobre 100 g', 'INSUMO', 'sobre', 65, 20, 30],
  ];
  const P: Record<string, number> = {};
  for (const [sku, nombre, categoria, unidad, precio, stockMinimo, diasAlerta] of catalogo) {
    P[sku] = motor.productos.guardar(director, null, { sku, nombre, categoria, unidad, precio, stockMinimo, diasAlerta }).id;
  }

  /* Lotes: clave, cantidad, costo, ubicación, ingreso (días atrás), vigencia (días desde hoy) */
  const lotes: [string, number, number, string, number, number | null][] = [
    ['HUE-BCO-360', 90, 610, 'Cámara 1', 12, 9], ['HUE-BCO-360', 60, 615, 'Cámara 1', 3, 18], ['HUE-ROJ-360', 34, 660, 'Cámara 2', 6, 15],
    ['HUE-BCO-030', 140, 55, 'Anaquel A', 9, 2], ['HUE-BCO-030', 200, 56, 'Anaquel A', 2, 19], ['POL-ENG-01', 500, 11, 'Nacedora 2', 1, null],
    ['AVE-POS-18', 58, 140, 'Galpón 3', 20, null], ['ALI-INI-40', 14, 430, 'Bodega', 15, 75], ['ALI-POS-40', 46, 390, 'Bodega', 15, 75],
    ['EMP-CON-100', 28, 110, 'Bodega', 30, null], ['EMP-CAJ-360', 420, 12, 'Bodega', 30, null], ['INS-VIT-100', 55, 41, 'Farmacia', 25, 240],
  ];
  for (const [sku, cantidad, costoUnitario, ubicacion, atras, vigencia] of lotes) {
    const { lote } = motor.inventario.entrada(almacen, { productoId: P[sku], sucursalId: 1, cantidad, costoUnitario, ubicacion, fechaIngreso: sumarDias(dia, -atras), fechaLimiteVenta: vigencia === null ? undefined : sumarDias(dia, vigencia) });
    bd.movimientos.filter((m) => m.loteId === lote.id).forEach((m) => (m.createdAt = haceDias(atras)));
    lote.createdAt = haceDias(atras);
  }

  /* Clientes (teléfonos ficticios) */
  const cartera: [string, 'PROSPECTO' | 'CLIENTE' | 'DISTRIBUIDOR', string, string][] = [
    ['Abarrotes La Esperanza', 'DISTRIBUIDOR', '5550100101', 'Mercado municipal, local 14'], ['Tortillería y Pollería El Gallo', 'DISTRIBUIDOR', '5550100102', 'Av. Reforma 210'],
    ['Restaurante Doña Lupita', 'CLIENTE', '5550100103', 'Calle 5 de Mayo 48'], ['María Fernanda Ruiz', 'CLIENTE', '5550100104', 'Col. San Rafael'],
    ['Juan Carlos Pérez', 'CLIENTE', '5550100105', 'Rancho El Mirador'], ['Rosa Elena Martínez', 'CLIENTE', '5550100106', 'Col. Las Flores'],
    ['Granja Familiar Los Tres Hermanos', 'CLIENTE', '5550100107', 'Camino a San Lorenzo km 3'], ['Miguel Ángel Torres', 'CLIENTE', '5550100108', 'Col. Aviación'],
    ['Panadería San José', 'PROSPECTO', '5550100109', 'Calle Hidalgo 77'], ['Minisúper El Ahorro', 'PROSPECTO', '5550100110', 'Blvd. Principal 1500'],
    ['Guadalupe Sánchez', 'PROSPECTO', '5550100111', 'Col. El Carmen'], ['Comedor Industrial Santa Fe', 'PROSPECTO', '5550100112', 'Parque industrial, nave 8'],
  ];
  const C: Record<string, number> = {};
  for (const [nombre, tipo, telefono, direccion] of cartera) {
    C[nombre] = motor.clientes.crear(ventas, { nombre, tipo, telefono, whatsapp: telefono, direccion, origen: tipo === 'PROSPECTO' ? 'Recomendación' : 'Mostrador' }).id;
  }

  /* Pedidos: cliente, renglones, días atrás, hasta qué estado llegó y qué se cobró */
  type Estado = 'COTIZACION' | 'RECIBIDO' | 'PREPARADO' | 'EN_RUTA' | 'ENTREGADO' | 'INCIDENCIA';
  interface Demo { cliente: string; items: [string, number][]; atras: number; hasta: Estado; entrega?: number; vence?: number; pago?: [number, MetodoPago] | 'total'; nota?: string }
  const demo: Demo[] = [
    { cliente: 'Abarrotes La Esperanza', items: [['HUE-BCO-360', 10]], atras: 13, hasta: 'ENTREGADO', entrega: -12, pago: 'total' },
    { cliente: 'Restaurante Doña Lupita', items: [['HUE-ROJ-360', 3], ['HUE-BCO-030', 10]], atras: 12, hasta: 'ENTREGADO', entrega: -11, pago: 'total' },
    { cliente: 'Tortillería y Pollería El Gallo', items: [['HUE-BCO-360', 8], ['EMP-CON-100', 2]], atras: 10, hasta: 'ENTREGADO', entrega: -9, vence: -4, pago: [3000, 'TRANSFERENCIA'] },
    { cliente: 'Juan Carlos Pérez', items: [['ALI-POS-40', 6], ['INS-VIT-100', 4]], atras: 9, hasta: 'ENTREGADO', entrega: -9, pago: 'total' },
    { cliente: 'Abarrotes La Esperanza', items: [['HUE-BCO-360', 12], ['HUE-BCO-030', 30]], atras: 7, hasta: 'ENTREGADO', entrega: -6, pago: 'total' },
    { cliente: 'María Fernanda Ruiz', items: [['AVE-POS-18', 4]], atras: 6, hasta: 'ENTREGADO', entrega: -6, pago: 'total' },
    { cliente: 'Granja Familiar Los Tres Hermanos', items: [['ALI-INI-40', 3], ['ALI-POS-40', 5]], atras: 5, hasta: 'ENTREGADO', entrega: -4, vence: -1, pago: [2000, 'EFECTIVO'] },
    { cliente: 'Restaurante Doña Lupita', items: [['HUE-ROJ-360', 4]], atras: 4, hasta: 'ENTREGADO', entrega: -3, pago: 'total' },
    { cliente: 'Tortillería y Pollería El Gallo', items: [['HUE-BCO-360', 10]], atras: 3, hasta: 'ENTREGADO', entrega: -2, vence: 5 },
    { cliente: 'Miguel Ángel Torres', items: [['HUE-BCO-030', 12], ['INS-VIT-100', 2]], atras: 2, hasta: 'ENTREGADO', entrega: -2, pago: 'total' },
    { cliente: 'Abarrotes La Esperanza', items: [['HUE-BCO-360', 15]], atras: 1, hasta: 'EN_RUTA', entrega: 0, vence: 7 },
    { cliente: 'Rosa Elena Martínez', items: [['ALI-POS-40', 8]], atras: 1, hasta: 'PREPARADO', entrega: 1, pago: [1500, 'EFECTIVO'] },
    { cliente: 'Juan Carlos Pérez', items: [['AVE-POS-18', 6]], atras: 0, hasta: 'RECIBIDO', entrega: 3 },
    { cliente: 'Restaurante Doña Lupita', items: [['HUE-BCO-360', 2], ['HUE-ROJ-360', 2]], atras: 2, hasta: 'INCIDENCIA', entrega: -1, nota: 'El negocio estaba cerrado al llegar. Reprogramar entrega con el cliente.' },
    { cliente: 'Minisúper El Ahorro', items: [['HUE-BCO-360', 30], ['HUE-BCO-030', 50]], atras: 5, hasta: 'COTIZACION' },
    { cliente: 'Comedor Industrial Santa Fe', items: [['HUE-BCO-360', 20]], atras: 0, hasta: 'COTIZACION' },
  ];
  const inscritos: { cliente: string; paquetes: number; anticipo?: [number, MetodoPago]; atras: number }[] = [
    { cliente: 'María Fernanda Ruiz', paquetes: 1, anticipo: [350, 'EFECTIVO'], atras: 6 }, { cliente: 'Juan Carlos Pérez', paquetes: 3, anticipo: [300, 'TRANSFERENCIA'], atras: 5 },
    { cliente: 'Rosa Elena Martínez', paquetes: 1, atras: 4 }, { cliente: 'Granja Familiar Los Tres Hermanos', paquetes: 5, anticipo: [1000, 'TRANSFERENCIA'], atras: 3 },
    { cliente: 'Miguel Ángel Torres', paquetes: 2, anticipo: [200, 'EFECTIVO'], atras: 1 },
  ];
  const inscritosPonedoras: typeof inscritos = [
    { cliente: 'Granja Familiar Los Tres Hermanos', paquetes: 2, anticipo: [640, 'TRANSFERENCIA'], atras: 2 }, { cliente: 'Guadalupe Sánchez', paquetes: 1, atras: 0 },
  ];

  // El siguiente pedido que se capture será el PSA-000125, como en el documento de alcance.
  bd.folios.PSA = 124 - demo.filter((d) => d.hasta !== 'COTIZACION').length - inscritos.length - inscritosPonedoras.length;

  /** Mueve en el tiempo todo lo que generó un pedido, para que la demo tenga historia */
  const antedatar = (pedidoId: number, atras: number, extra: { entrega?: number; vence?: number; entregado?: boolean } = {}) => {
    const p = bd.pedidos.find((x) => x.id === pedidoId)!;
    const cuando = haceDias(atras, (pedidoId * 37) % 300);
    p.createdAt = cuando;
    if (p.confirmadoAt) p.confirmadoAt = cuando;
    if ('entrega' in extra) {
      p.fechaEntrega = extra.entrega === undefined ? null : sumarDias(dia, extra.entrega);
      p.fechaVencimiento = extra.vence !== undefined ? sumarDias(dia, extra.vence) : p.fechaEntrega;
      if (extra.entregado && p.fechaEntrega) p.entregadoAt = `${p.fechaEntrega}T17:30:00.000Z`;
    }
    const recibos = bd.pagos.filter((g) => g.pedidoId === pedidoId);
    recibos.forEach((g) => (g.fecha = g.createdAt = new Date(new Date(cuando).getTime() + 20 * 60_000).toISOString()));
    const folios = [p.folio, ...recibos.map((g) => g.folio), ...bd.inscripciones.filter((i) => i.pedidoId === pedidoId).map((i) => i.folio)];
    bd.movimientos.filter((m) => m.referencia === p.folio).forEach((m) => (m.createdAt = cuando));
    bd.notificaciones.filter((n) => n.referencia && folios.includes(n.referencia)).forEach((n) => (n.createdAt = cuando));
    bd.bitacora.filter((b) => b.entidad === 'pedido' && b.entidadId === String(pedidoId)).forEach((b) => (b.createdAt = cuando));
  };

  for (const d of demo) {
    const p = motor.pedidos.crear(ventas, { clienteId: C[d.cliente], sucursalId: 1, items: d.items.map(([sku, cantidad]) => ({ productoId: P[sku], cantidad })), confirmar: d.hasta !== 'COTIZACION' });
    if (d.pago) motor.pagos.registrar(cobranza, { pedidoId: p.id, monto: d.pago === 'total' ? p.total : d.pago[0], metodo: d.pago === 'total' ? 'EFECTIVO' : d.pago[1] });
    const ruta: Estado[] = ['PREPARADO', 'EN_RUTA', 'ENTREGADO'];
    const meta = d.hasta === 'INCIDENCIA' ? 'EN_RUTA' : d.hasta;
    for (const paso of ruta.slice(0, ruta.indexOf(meta) + 1)) motor.pedidos.estado(logistica, p.id, { estado: paso, recibidoPor: paso === 'ENTREGADO' ? d.cliente : null });
    if (d.hasta === 'INCIDENCIA') motor.pedidos.estado(logistica, p.id, { estado: 'INCIDENCIA', nota: d.nota });
    antedatar(p.id, d.atras, { entrega: d.entrega, vence: d.vence, entregado: d.hasta === 'ENTREGADO' });
  }

  /* Pollitandas */
  const engorda = motor.pollitandas.crear(director, {
    nombre: 'Pollitanda de Engorda', descripcion: 'Paquete de 20 pollitos de engorda de 1 día. Se aparta con anticipo y se liquida antes de la entrega.',
    productoId: P['POL-ENG-01'], sucursalId: 1, pollitosPorPaquete: 20, precioPaquete: 350, anticipoMinimo: 100, cupoPaquetes: 25, fechaCierre: sumarDias(dia, 10), fechaEntrega: sumarDias(dia, 16), preventa: false,
  });
  const ponedoras = motor.pollitandas.crear(director, {
    nombre: 'Pollitanda Ponedoras', descripcion: 'Paquete de 10 pollitas ponedoras. Venta anticipada: las pollitas se apartan cuando nace el lote.',
    productoId: P['POL-PON-01'], sucursalId: 1, pollitosPorPaquete: 10, precioPaquete: 320, anticipoMinimo: 100, cupoPaquetes: 30, fechaCierre: sumarDias(dia, 20), fechaEntrega: sumarDias(dia, 35), preventa: true,
  });
  for (const [programa, lista] of [[engorda, inscritos], [ponedoras, inscritosPonedoras]] as const) {
    for (const i of lista) {
      const e = motor.pollitandas.inscribir(ventas, programa.id, { clienteId: C[i.cliente], paquetes: i.paquetes, anticipo: i.anticipo ? { monto: i.anticipo[0], metodo: i.anticipo[1] } : undefined });
      antedatar(e.pedido.id, i.atras);
      bd.inscripciones.find((x) => x.id === e.id)!.createdAt = bd.pedidos.find((p) => p.id === e.pedido.id)!.createdAt;
    }
  }

  /* Seguimiento comercial */
  motor.clientes.seguimiento(ventas, C['Minisúper El Ahorro'], { tipo: 'LLAMADA', nota: 'Pidió cotización para surtir sus 2 sucursales. Compara precio con su proveedor actual.', proximaAccion: sumarDias(dia, -1) });
  motor.clientes.seguimiento(ventas, C['Panadería San José'], { tipo: 'VISITA', nota: 'Consume ~8 cajas por semana. Quiere probar una caja antes de decidir.', proximaAccion: dia });
  motor.clientes.seguimiento(ventas, C['Comedor Industrial Santa Fe'], { tipo: 'WHATSAPP', nota: 'Se envió cotización. Decide el jefe de compras el viernes.', proximaAccion: sumarDias(dia, 2) });
  motor.clientes.seguimiento(ventas, C['Guadalupe Sánchez'], { tipo: 'NOTA', nota: 'Interesada en ponedoras para traspatio; se inscribió a la Pollitanda.' });

  // Los mensajes antiguos se dan por enviados; quedan pendientes los de los últimos 2 días.
  for (const n of bd.notificaciones) {
    if (Date.now() - new Date(n.createdAt).getTime() > 2 * 86_400_000) Object.assign(n, { estado: 'ENVIADA', enviadaAt: n.createdAt });
  }
  motor.notificaciones.recordatorios();
  bd.bitacora = bd.bitacora.filter((b) => b.accion !== 'INICIO_SESION').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
