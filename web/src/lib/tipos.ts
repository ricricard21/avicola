/** Formas de los datos que entrega la API */

export type Rol = 'DIRECTOR' | 'ADMIN' | 'VENTAS' | 'INVENTARIO' | 'COBRANZA' | 'LOGISTICA' | 'GRANJA';
export type EstadoPedido = 'COTIZACION' | 'RECIBIDO' | 'PREPARADO' | 'EN_RUTA' | 'ENTREGADO' | 'INCIDENCIA' | 'CANCELADO';
export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEPOSITO' | 'TARJETA';
export type TipoCliente = 'PROSPECTO' | 'CLIENTE' | 'DISTRIBUIDOR';
export type Categoria = 'HUEVO' | 'POLLITO' | 'AVE' | 'ALIMENTO' | 'EMPAQUE' | 'INSUMO';
export type EstadoExpediente = 'APARTADO' | 'EN_PAGOS' | 'LIQUIDADO' | 'ENTREGADO' | 'CANCELADO';

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface Ref {
  id: number;
  nombre: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  rolNombre: string;
  sucursalId: number | null;
  sucursal: Ref | null;
  permisosExtra: string[];
  permisosDenegados: string[];
  permisos: string[];
  activo: boolean;
  ultimoAcceso: string | null;
}

export interface Sucursal {
  id: number;
  nombre: string;
  direccion: string | null;
  activa: boolean;
}

export interface Cliente {
  id: number;
  tipo: TipoCliente;
  nombre: string;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  direccion: string | null;
  municipio: string | null;
  rfc: string | null;
  etapa: string | null;
  origen: string | null;
  notas: string | null;
  vendedor: Ref | null;
  saldo?: number;
  comprado?: number;
  createdAt: string;
}

export interface Seguimiento {
  id: number;
  tipo: 'LLAMADA' | 'WHATSAPP' | 'VISITA' | 'NOTA';
  nota: string;
  proximaAccion: string | null;
  completado: boolean;
  createdAt: string;
  usuario?: Ref | null;
  cliente?: Ref & { telefono: string | null };
}

export interface PedidoResumen {
  id: number;
  folio: string;
  folioCotizacion: string | null;
  estado: EstadoPedido;
  total: number;
  pagado: number;
  saldo: number;
  fechaEntrega: string | null;
  fechaVencimiento: string | null;
  createdAt: string;
  cliente?: Ref;
  vendedor?: Ref | null;
  pollitanda?: { inscripcionId: number; folio: string; pollitandaId: number } | null;
}

export interface PagoResumen {
  id: number;
  folio: string;
  monto: number;
  metodo: MetodoPago;
  referencia?: string | null;
  fecha: string;
  cancelado: boolean;
  motivoCancelacion?: string | null;
  usuarioNombre?: string | null;
  cliente?: Ref;
  pedido?: { id: number; folio: string };
}

export interface PedidoDetalle extends PedidoResumen {
  subtotal: number;
  descuento: number;
  notas: string | null;
  incidencia: string | null;
  recibidoPor: string | null;
  motivoCancelacion: string | null;
  confirmadoAt: string | null;
  entregadoAt: string | null;
  canceladoAt: string | null;
  sucursal: Ref;
  cliente: Ref & { tipo: TipoCliente; telefono: string | null; direccion: string | null; municipio: string | null };
  items: {
    id: number;
    productoId: number;
    descripcion: string;
    unidad: string;
    cantidad: number;
    precioUnitario: number;
    importe: number;
    cantidadReservada: number;
    faltante: number;
    lotes: { codigo: string; cantidad: number; surtida: boolean; ubicacion: string | null }[];
  }[];
  pagos: PagoResumen[];
  siguientes: EstadoPedido[];
}

export interface ClienteDetalle extends Cliente {
  resumen: { comprado: number; pagado: number; saldo: number; pedidos: number; ultimaCompra: string | null };
  pedidos: PedidoResumen[];
  pagos: PagoResumen[];
  seguimientos: Seguimiento[];
  pollitandas: {
    id: number;
    folio: string;
    programa: string;
    pollitandaId: number;
    paquetes: number;
    cantidadPollitos: number;
    total: number;
    pagado: number;
    saldo: number;
    fechaEntrega: string | null;
    estadoPedido: EstadoPedido;
    pedidoId: number;
  }[];
}

export interface Producto {
  id: number;
  sku: string;
  nombre: string;
  categoria: Categoria;
  unidad: string;
  precio: number;
  stockMinimo: number;
  diasAlerta: number;
  activo: boolean;
}

export interface Existencia {
  id: number;
  sku: string;
  nombre: string;
  categoria: Categoria;
  unidad: string;
  precio: number;
  stockMinimo: number;
  fisica: number;
  reservada: number;
  disponible: number;
  valor: number;
  lotes: number;
  proximaCaducidad: string | null;
  porSurtir: number;
  bajoMinimo: boolean;
  porCaducar: boolean;
}

export interface Lote {
  id: number;
  codigo: string;
  productoId: number;
  ubicacion: string | null;
  cantidadFisica: number;
  cantidadReservada: number;
  disponible: number;
  costoUnitario: number;
  fechaIngreso: string;
  fechaLimiteVenta: string | null;
  caducado: boolean;
  notas: string | null;
  producto: { id: number; nombre: string; sku: string; unidad: string; diasAlerta: number };
  sucursal: Ref;
}

export interface Movimiento {
  id: number;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'RESERVA' | 'LIBERACION';
  cantidad: number;
  saldoFisico: number;
  saldoReservado: number;
  referencia: string | null;
  motivo: string | null;
  usuarioNombre: string | null;
  createdAt: string;
  lote: { id: number; codigo: string };
  producto: { id: number; nombre: string; unidad: string };
}

export interface Expediente {
  id: number;
  folio: string;
  cliente: Ref & { telefono: string | null };
  paquetes: number;
  cantidadPollitos: number;
  pollitosPorSurtir: number;
  total: number;
  pagado: number;
  saldo: number;
  fechaEntrega: string | null;
  estado: EstadoExpediente;
  pedido: { id: number; folio: string; estado: EstadoPedido };
}

export interface Pollitanda {
  id: number;
  nombre: string;
  descripcion: string | null;
  productoId: number;
  producto?: { id: number; nombre: string; unidad: string };
  sucursal?: Ref;
  pollitosPorPaquete: number;
  precioPaquete: number;
  anticipoMinimo: number;
  cupoPaquetes: number;
  fechaCierre: string | null;
  fechaEntrega: string;
  preventa: boolean;
  estado: 'ABIERTA' | 'CERRADA' | 'ENTREGADA' | 'CANCELADA';
  participantes: number;
  paquetesVendidos: number;
  cupoDisponible: number;
  pollitos: number;
  pollitosPorSurtir?: number;
  vendido: number;
  cobrado: number;
  porCobrar: number;
  sinAnticipo?: number;
  expedientes?: Expediente[];
}

export interface CuentaPorCobrar {
  id: number;
  folio: string;
  estado: EstadoPedido;
  esPollitanda: boolean;
  cliente: Ref & { telefono: string | null };
  total: number;
  pagado: number;
  saldo: number;
  fechaEntrega: string | null;
  fechaVencimiento: string | null;
  diasVencido: number;
}

export interface PorCobrar {
  cuentas: CuentaPorCobrar[];
  antiguedad: { alCorriente: number; de1a7: number; de8a30: number; masDe30: number };
  total: number;
  vencido: number;
}

export interface Notificacion {
  id: number;
  destinatario: string | null;
  plantilla: string;
  mensaje: string;
  estado: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA' | 'DESCARTADA';
  referencia: string | null;
  error: string | null;
  enviadaAt: string | null;
  createdAt: string;
  cliente: Ref | null;
}

export interface Alerta {
  tipo: 'inventario' | 'caducidad' | 'preventa' | 'cotizacion' | 'cobranza' | 'anticipo' | 'incidencia';
  nivel: 'alta' | 'media';
  titulo: string;
  detalle: string;
  enlace: string;
}

export interface Tablero {
  fecha: string;
  dinero: {
    ventasMes: number;
    ventasMesAnterior: number;
    ventasHoy: number;
    pedidosMes: number;
    cobradoMes: number;
    cobradoHoy: number;
    porCobrar: number;
    vencido: number;
  } | null;
  pedidos: { cotizaciones: number; recibidos: number; preparados: number; enRuta: number; incidencias: number } | null;
  serie: { dia: string; total: number; pedidos: number }[] | null;
  topProductos: { nombre: string; unidad: string; cantidad: number; importe: number }[] | null;
  entregas: { id: number; folio: string; estado: EstadoPedido; fechaEntrega: string; cliente: string; saldo: number; esPollitanda: boolean; atrasada: boolean }[];
  pollitandas: { id: number; nombre: string; fechaEntrega: string; cupoPaquetes: number; paquetes: number; vendido: number; cobrado: number }[];
  seguimientos: Seguimiento[];
  alertas: Alerta[];
}
