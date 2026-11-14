import type { Tono } from '@/components/ui';
import type { Categoria, EstadoExpediente, EstadoPedido, MetodoPago, Rol, TipoCliente } from './tipos';

export const ESTADO_PEDIDO: Record<EstadoPedido, { nombre: string; tono: Tono }> = {
  COTIZACION: { nombre: 'Cotización', tono: 'neutro' },
  RECIBIDO: { nombre: 'Recibido', tono: 'azul' },
  PREPARADO: { nombre: 'Preparado', tono: 'ambar' },
  EN_RUTA: { nombre: 'En ruta', tono: 'ambar' },
  ENTREGADO: { nombre: 'Entregado', tono: 'verde' },
  INCIDENCIA: { nombre: 'Con incidencia', tono: 'rojo' },
  CANCELADO: { nombre: 'Cancelado', tono: 'neutro' },
};

/** Texto del botón que lleva el pedido a cada estado */
export const ACCION_ESTADO: Partial<Record<EstadoPedido, string>> = {
  RECIBIDO: 'Regresar a recibido',
  PREPARADO: 'Marcar preparado',
  EN_RUTA: 'Enviar a ruta',
  ENTREGADO: 'Registrar entrega',
};

export const ESTADO_EXPEDIENTE: Record<EstadoExpediente, { nombre: string; tono: Tono }> = {
  APARTADO: { nombre: 'Apartado sin anticipo', tono: 'rojo' },
  EN_PAGOS: { nombre: 'En pagos', tono: 'ambar' },
  LIQUIDADO: { nombre: 'Liquidado', tono: 'verde' },
  ENTREGADO: { nombre: 'Entregado', tono: 'azul' },
  CANCELADO: { nombre: 'Baja', tono: 'neutro' },
};

export const TIPO_CLIENTE: Record<TipoCliente, { nombre: string; tono: Tono }> = {
  PROSPECTO: { nombre: 'Prospecto', tono: 'ambar' },
  CLIENTE: { nombre: 'Cliente', tono: 'verde' },
  DISTRIBUIDOR: { nombre: 'Distribuidor', tono: 'azul' },
};

export const ETAPAS: Record<string, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'Contactado',
  COTIZADO: 'Cotizado',
  GANADO: 'Ganado',
  PERDIDO: 'Perdido',
};

export const METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  DEPOSITO: 'Depósito',
  TARJETA: 'Tarjeta',
};

export const CATEGORIA: Record<Categoria, string> = {
  HUEVO: 'Huevo',
  POLLITO: 'Pollitos',
  AVE: 'Aves',
  ALIMENTO: 'Alimento',
  EMPAQUE: 'Empaque',
  INSUMO: 'Insumos',
};

export const ROL: Record<Rol, string> = {
  DIRECTOR: 'Director general',
  ADMIN: 'Administrador',
  VENTAS: 'Ventas',
  INVENTARIO: 'Almacén e inventario',
  COBRANZA: 'Cobranza',
  LOGISTICA: 'Logística',
  GRANJA: 'Encargado de granja',
};

export const MOVIMIENTO: Record<string, { nombre: string; tono: Tono }> = {
  ENTRADA: { nombre: 'Entrada', tono: 'verde' },
  SALIDA: { nombre: 'Salida', tono: 'azul' },
  AJUSTE: { nombre: 'Ajuste', tono: 'rojo' },
  RESERVA: { nombre: 'Apartado', tono: 'ambar' },
  LIBERACION: { nombre: 'Liberación', tono: 'neutro' },
};

export const PLANTILLA: Record<string, string> = {
  pedido_confirmado: 'Pedido confirmado',
  pollitanda_inscripcion: 'Inscripción a Pollitanda',
  pago_recibido: 'Pago recibido',
  pedido_preparado: 'Pedido preparado',
  pedido_en_ruta: 'Pedido en ruta',
  pedido_entregado: 'Pedido entregado',
  recordatorio_cotizacion: 'Recordatorio de cotización',
  recordatorio_saldo: 'Recordatorio de saldo',
  recordatorio_anticipo: 'Recordatorio de anticipo',
  recordatorio_entrega: 'Aviso de entrega próxima',
  manual: 'Mensaje manual',
};

export const SEGUIMIENTO: Record<string, string> = { LLAMADA: 'Llamada', WHATSAPP: 'WhatsApp', VISITA: 'Visita', NOTA: 'Nota' };

export const MODULO: Record<string, string> = {
  clientes: 'Clientes',
  ventas: 'Ventas',
  pollitandas: 'Pollitandas',
  productos: 'Productos',
  inventario: 'Inventario',
  cobranza: 'Cobranza',
  mensajes: 'Mensajes',
  reportes: 'Reportes',
  config: 'Configuración',
};
