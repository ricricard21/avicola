/**
 * "Base de datos" de la demostración: un objeto en memoria que se guarda en el
 * almacenamiento del navegador. Tiene las mismas tablas que la base PostgreSQL de la API.
 */

export type Rol = 'DIRECTOR' | 'ADMIN' | 'VENTAS' | 'INVENTARIO' | 'COBRANZA' | 'LOGISTICA' | 'GRANJA';
export type EstadoPedido = 'COTIZACION' | 'RECIBIDO' | 'PREPARADO' | 'EN_RUTA' | 'ENTREGADO' | 'INCIDENCIA' | 'CANCELADO';
export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEPOSITO' | 'TARJETA';

export interface Sucursal { id: number; nombre: string; direccion: string | null; activa: boolean; createdAt: string }
export interface Usuario {
  id: number; nombre: string; email: string; clave: string; rol: Rol; sucursalId: number | null;
  permisosExtra: string[]; permisosDenegados: string[]; activo: boolean; ultimoAcceso: string | null; createdAt: string;
}
export interface Registro { id: number; usuarioId: number | null; usuarioNombre: string; accion: string; entidad: string; entidadId: string | null; resumen: string | null; createdAt: string }
export interface Cliente {
  id: number; tipo: 'PROSPECTO' | 'CLIENTE' | 'DISTRIBUIDOR'; nombre: string; telefono: string | null; whatsapp: string | null; email: string | null;
  direccion: string | null; municipio: string | null; rfc: string | null; etapa: string | null; origen: string | null; notas: string | null;
  vendedorId: number | null; activo: boolean; createdAt: string;
}
export interface Seguimiento { id: number; clienteId: number; usuarioId: number | null; tipo: string; nota: string; proximaAccion: string | null; completado: boolean; createdAt: string }
export interface Producto { id: number; sku: string; nombre: string; categoria: string; unidad: string; precio: number; stockMinimo: number; diasAlerta: number; activo: boolean; createdAt: string }
export interface Lote {
  id: number; codigo: string; productoId: number; sucursalId: number; ubicacion: string | null; cantidadFisica: number; cantidadReservada: number;
  costoUnitario: number; fechaIngreso: string; fechaLimiteVenta: string | null; notas: string | null; createdAt: string;
}
export interface Movimiento {
  id: number; loteId: number; productoId: number; tipo: string; cantidad: number; saldoFisico: number; saldoReservado: number;
  referencia: string | null; motivo: string | null; usuarioNombre: string | null; createdAt: string;
}
export interface Pedido {
  id: number; folio: string; folioCotizacion: string | null; estado: EstadoPedido; estadoPrevio: EstadoPedido | null; clienteId: number; vendedorId: number | null;
  sucursalId: number; fechaEntrega: string | null; fechaVencimiento: string | null; subtotal: number; descuento: number; total: number; pagado: number;
  notas: string | null; incidencia: string | null; recibidoPor: string | null; motivoCancelacion: string | null;
  confirmadoAt: string | null; entregadoAt: string | null; canceladoAt: string | null; createdAt: string;
}
export interface Item { id: number; pedidoId: number; productoId: number; descripcion: string; cantidad: number; precioUnitario: number; importe: number; cantidadReservada: number }
export interface Reserva { id: number; pedidoItemId: number; loteId: number; cantidad: number; surtida: boolean }
export interface Pago {
  id: number; folio: string; clienteId: number; pedidoId: number; monto: number; metodo: MetodoPago; referencia: string | null; fecha: string;
  notas: string | null; usuarioNombre: string | null; cancelado: boolean; motivoCancelacion: string | null; createdAt: string;
}
export interface Pollitanda {
  id: number; nombre: string; descripcion: string | null; productoId: number; sucursalId: number; pollitosPorPaquete: number; precioPaquete: number;
  anticipoMinimo: number; cupoPaquetes: number; fechaCierre: string | null; fechaEntrega: string; preventa: boolean; estado: 'ABIERTA' | 'CERRADA' | 'ENTREGADA' | 'CANCELADA'; createdAt: string;
}
export interface Inscripcion { id: number; folio: string; pollitandaId: number; clienteId: number; paquetes: number; cantidadPollitos: number; pedidoId: number; notas: string | null; createdAt: string }
export interface Notificacion {
  id: number; clienteId: number | null; destinatario: string | null; plantilla: string; mensaje: string; estado: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA' | 'DESCARTADA';
  referencia: string | null; error: string | null; enviadaAt: string | null; createdAt: string;
}

export interface BD {
  version: number;
  ids: Record<string, number>;
  folios: Record<string, number>;
  sucursales: Sucursal[];
  usuarios: Usuario[];
  bitacora: Registro[];
  clientes: Cliente[];
  seguimientos: Seguimiento[];
  productos: Producto[];
  lotes: Lote[];
  movimientos: Movimiento[];
  pedidos: Pedido[];
  items: Item[];
  reservas: Reserva[];
  pagos: Pago[];
  pollitandas: Pollitanda[];
  inscripciones: Inscripcion[];
  notificaciones: Notificacion[];
}

const CLAVE = 'asa.demo.v1';
const VERSION = 1;

export function vacia(): BD {
  return {
    version: VERSION, ids: {}, folios: {},
    sucursales: [], usuarios: [], bitacora: [], clientes: [], seguimientos: [], productos: [], lotes: [], movimientos: [],
    pedidos: [], items: [], reservas: [], pagos: [], pollitandas: [], inscripciones: [], notificaciones: [],
  };
}

const almacen: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof localStorage !== 'undefined'
    ? localStorage
    : (() => {
        const m = new Map<string, string>(); // en pruebas (Node) no hay navegador
        return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
      })();

let actual: BD | null = null;
let sembrador: (bd: BD) => void = () => {};

/** Registra la función que llena la base con los datos de ejemplo */
export function alSembrar(f: (bd: BD) => void) {
  sembrador = f;
}

export function bd(): BD {
  if (actual) return actual;
  try {
    const guardada = JSON.parse(almacen.getItem(CLAVE) ?? 'null') as BD | null;
    if (guardada?.version === VERSION) return (actual = guardada);
  } catch {
    /* datos dañados: se vuelve a sembrar */
  }
  actual = vacia();
  sembrador(actual);
  guardar();
  return actual;
}

export function guardar() {
  try {
    if (actual) almacen.setItem(CLAVE, JSON.stringify(actual));
  } catch {
    /* almacenamiento lleno o bloqueado: la demo sigue funcionando en memoria */
  }
}

/** Copia del estado, para deshacer una operación que falla a la mitad (equivale a una transacción) */
export const instantanea = () => JSON.stringify(bd());
export const restaurar = (copia: string) => void (actual = JSON.parse(copia));

export function reiniciar() {
  almacen.removeItem(CLAVE);
  actual = null;
}

export function nuevoId(tabla: string): number {
  const b = bd();
  return (b.ids[tabla] = (b.ids[tabla] ?? 0) + 1);
}
