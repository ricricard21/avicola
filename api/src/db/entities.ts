import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Rol, ROLES } from '../common/permisos';

/* ------------------------------------------------------------------ */
/*  Tipos de catálogo (se guardan como texto para migraciones simples)  */
/* ------------------------------------------------------------------ */

export { ROLES };
export type { Rol };

export const TIPOS_CLIENTE = ['PROSPECTO', 'CLIENTE', 'DISTRIBUIDOR'] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];

export const ETAPAS_PROSPECTO = ['NUEVO', 'CONTACTADO', 'COTIZADO', 'GANADO', 'PERDIDO'] as const;
export type EtapaProspecto = (typeof ETAPAS_PROSPECTO)[number];

export const TIPOS_SEGUIMIENTO = ['LLAMADA', 'WHATSAPP', 'VISITA', 'NOTA'] as const;
export type TipoSeguimiento = (typeof TIPOS_SEGUIMIENTO)[number];

export const CATEGORIAS = ['HUEVO', 'POLLITO', 'AVE', 'ALIMENTO', 'EMPAQUE', 'INSUMO'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const TIPOS_MOVIMIENTO = ['ENTRADA', 'SALIDA', 'AJUSTE', 'RESERVA', 'LIBERACION'] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const ESTADOS_PEDIDO = [
  'COTIZACION',
  'RECIBIDO',
  'PREPARADO',
  'EN_RUTA',
  'ENTREGADO',
  'INCIDENCIA',
  'CANCELADO',
] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'TARJETA'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ESTADOS_POLLITANDA = ['ABIERTA', 'CERRADA', 'ENTREGADA', 'CANCELADA'] as const;
export type EstadoPollitanda = (typeof ESTADOS_POLLITANDA)[number];

export const ESTADOS_NOTIFICACION = ['PENDIENTE', 'ENVIADA', 'FALLIDA', 'DESCARTADA'] as const;
export type EstadoNotificacion = (typeof ESTADOS_NOTIFICACION)[number];

/** numeric(12,2) de PostgreSQL <-> number de JS */
const numero = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v === null || v === undefined ? (v as null | undefined) : Number(v)),
};
const dinero = { type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numero } as const;
const cantidad = { type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numero } as const;

/* ------------------------------------------------------------------ */
/*  Organización y seguridad                                           */
/* ------------------------------------------------------------------ */

@Entity('sucursales')
export class Sucursal {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 120 }) nombre: string;
  @Column({ type: 'varchar', length: 240, nullable: true }) direccion: string | null;
  @Column({ default: true }) activa: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 120 }) nombre: string;
  @Index({ unique: true })
  @Column({ length: 160 })
  email: string;
  @Column({ length: 100, select: false }) passwordHash: string;
  @Column({ type: 'varchar', length: 20 }) rol: Rol;
  /** null = puede operar en todas las sucursales */
  @Column({ type: 'int', nullable: true }) sucursalId: number | null;
  @ManyToOne(() => Sucursal, { nullable: true })
  @JoinColumn({ name: 'sucursalId' })
  sucursal: Relation<Sucursal> | null;
  /** Permisos concedidos además de los de su rol */
  @Column({ type: 'text', array: true, default: () => "'{}'" }) permisosExtra: string[];
  /** Permisos retirados aunque su rol los incluya */
  @Column({ type: 'text', array: true, default: () => "'{}'" }) permisosDenegados: string[];
  @Column({ default: true }) activo: boolean;
  @Column({ type: 'timestamptz', nullable: true }) ultimoAcceso: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('bitacora')
@Index(['entidad', 'entidadId'])
export class Bitacora {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int', nullable: true }) usuarioId: number | null;
  @Column({ length: 120 }) usuarioNombre: string;
  @Column({ length: 60 }) accion: string;
  @Column({ length: 40 }) entidad: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) entidadId: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) resumen: string | null;
  @Column({ type: 'jsonb', nullable: true }) detalle: Record<string, unknown> | null;
  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('folios')
export class Folio {
  @PrimaryColumn({ length: 10 }) serie: string;
  @Column({ type: 'int', default: 0 }) ultimo: number;
}

/* ------------------------------------------------------------------ */
/*  CRM                                                                */
/* ------------------------------------------------------------------ */

@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 20, default: 'PROSPECTO' }) tipo: TipoCliente;
  @Index()
  @Column({ length: 160 })
  nombre: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) telefono: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) whatsapp: string | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) email: string | null;
  @Column({ type: 'varchar', length: 240, nullable: true }) direccion: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) municipio: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) rfc: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) etapa: EtapaProspecto | null;
  @Column({ type: 'varchar', length: 60, nullable: true }) origen: string | null;
  @Column({ type: 'text', nullable: true }) notas: string | null;
  @Column({ type: 'int', nullable: true }) vendedorId: number | null;
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'vendedorId' })
  vendedor: Relation<Usuario> | null;
  @Column({ default: true }) activo: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('seguimientos')
export class Seguimiento {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' })
  clienteId: number;
  @ManyToOne(() => Cliente, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clienteId' })
  cliente: Relation<Cliente>;
  @Column({ type: 'int', nullable: true }) usuarioId: number | null;
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuarioId' })
  usuario: Relation<Usuario> | null;
  @Column({ type: 'varchar', length: 20, default: 'NOTA' }) tipo: TipoSeguimiento;
  @Column({ type: 'text' }) nota: string;
  /** Fecha comprometida para el siguiente contacto */
  @Column({ type: 'date', nullable: true }) proximaAccion: string | null;
  @Column({ default: false }) completado: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Catálogo e inventario                                              */
/* ------------------------------------------------------------------ */

@Entity('productos')
export class Producto {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true })
  @Column({ length: 30 })
  sku: string;
  @Column({ length: 160 }) nombre: string;
  @Column({ type: 'varchar', length: 20 }) categoria: Categoria;
  @Column({ length: 30, default: 'pieza' }) unidad: string;
  @Column(dinero) precio: number;
  @Column(cantidad) stockMinimo: number;
  /** Días antes de la fecha límite de venta en que se avisa */
  @Column({ type: 'int', default: 3 }) diasAlerta: number;
  @Column({ default: true }) activo: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('lotes')
export class Lote {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true })
  @Column({ length: 30 })
  codigo: string;
  @Index()
  @Column({ type: 'int' })
  productoId: number;
  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoId' })
  producto: Relation<Producto>;
  @Column({ type: 'int' }) sucursalId: number;
  @ManyToOne(() => Sucursal)
  @JoinColumn({ name: 'sucursalId' })
  sucursal: Relation<Sucursal>;
  @Column({ type: 'varchar', length: 80, nullable: true }) ubicacion: string | null;
  /** Lo que hay físicamente en almacén */
  @Column(cantidad) cantidadFisica: number;
  /** Lo que ya está comprometido en pedidos confirmados */
  @Column(cantidad) cantidadReservada: number;
  @Column(dinero) costoUnitario: number;
  @Column({ type: 'date' }) fechaIngreso: string;
  @Column({ type: 'date', nullable: true }) fechaLimiteVenta: string | null;
  @Column({ type: 'varchar', length: 240, nullable: true }) notas: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('movimientos')
export class Movimiento {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' })
  loteId: number;
  @ManyToOne(() => Lote)
  @JoinColumn({ name: 'loteId' })
  lote: Relation<Lote>;
  @Index()
  @Column({ type: 'int' })
  productoId: number;
  @Column({ type: 'varchar', length: 20 }) tipo: TipoMovimiento;
  /** Con signo: positivo suma, negativo resta */
  @Column(cantidad) cantidad: number;
  @Column(cantidad) saldoFisico: number;
  @Column(cantidad) saldoReservado: number;
  @Column({ type: 'varchar', length: 40, nullable: true }) referencia: string | null;
  @Column({ type: 'varchar', length: 240, nullable: true }) motivo: string | null;
  @Column({ type: 'int', nullable: true }) usuarioId: number | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) usuarioNombre: string | null;
  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Ventas y cobranza                                                  */
/* ------------------------------------------------------------------ */

@Entity('pedidos')
export class Pedido {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true })
  @Column({ length: 20 })
  folio: string;
  /** Folio que tuvo mientras fue cotización */
  @Column({ type: 'varchar', length: 20, nullable: true }) folioCotizacion: string | null;
  @Index()
  @Column({ type: 'varchar', length: 20 })
  estado: EstadoPedido;
  /** Estado al que regresa cuando se resuelve una incidencia */
  @Column({ type: 'varchar', length: 20, nullable: true }) estadoPrevio: EstadoPedido | null;
  @Index()
  @Column({ type: 'int' })
  clienteId: number;
  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'clienteId' })
  cliente: Relation<Cliente>;
  @Column({ type: 'int', nullable: true }) vendedorId: number | null;
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'vendedorId' })
  vendedor: Relation<Usuario> | null;
  @Column({ type: 'int' }) sucursalId: number;
  @ManyToOne(() => Sucursal)
  @JoinColumn({ name: 'sucursalId' })
  sucursal: Relation<Sucursal>;
  @Column({ type: 'date', nullable: true }) fechaEntrega: string | null;
  @Column({ type: 'date', nullable: true }) fechaVencimiento: string | null;
  @Column(dinero) subtotal: number;
  @Column(dinero) descuento: number;
  @Column(dinero) total: number;
  @Column(dinero) pagado: number;
  @Column({ type: 'text', nullable: true }) notas: string | null;
  @Column({ type: 'text', nullable: true }) incidencia: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) recibidoPor: string | null;
  @Column({ type: 'varchar', length: 240, nullable: true }) motivoCancelacion: string | null;
  @Column({ type: 'timestamptz', nullable: true }) confirmadoAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) entregadoAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) canceladoAt: Date | null;
  @OneToMany(() => PedidoItem, (i) => i.pedido, { cascade: ['insert'] })
  items: Relation<PedidoItem>[];
  @OneToMany(() => Pago, (p) => p.pedido)
  pagos: Relation<Pago>[];
  @OneToOne(() => Inscripcion, (i) => i.pedido)
  inscripcion: Relation<Inscripcion> | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('pedido_items')
export class PedidoItem {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' })
  pedidoId: number;
  @ManyToOne(() => Pedido, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedidoId' })
  pedido: Relation<Pedido>;
  @Column({ type: 'int' }) productoId: number;
  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoId' })
  producto: Relation<Producto>;
  @Column({ length: 200 }) descripcion: string;
  @Column(cantidad) cantidad: number;
  @Column(dinero) precioUnitario: number;
  @Column(dinero) importe: number;
  /** Cuánto de este renglón ya tiene inventario apartado */
  @Column(cantidad) cantidadReservada: number;
  @OneToMany(() => Reserva, (r) => r.item)
  reservas: Relation<Reserva>[];
}

@Entity('reservas')
export class Reserva {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' })
  pedidoItemId: number;
  @ManyToOne(() => PedidoItem, (i) => i.reservas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedidoItemId' })
  item: Relation<PedidoItem>;
  @Index()
  @Column({ type: 'int' })
  loteId: number;
  @ManyToOne(() => Lote)
  @JoinColumn({ name: 'loteId' })
  lote: Relation<Lote>;
  @Column(cantidad) cantidad: number;
  /** true cuando la mercancía ya salió del almacén */
  @Column({ default: false }) surtida: boolean;
}

@Entity('pagos')
export class Pago {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true })
  @Column({ length: 20 })
  folio: string;
  @Index()
  @Column({ type: 'int' })
  clienteId: number;
  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'clienteId' })
  cliente: Relation<Cliente>;
  @Index()
  @Column({ type: 'int' })
  pedidoId: number;
  @ManyToOne(() => Pedido, (p) => p.pagos)
  @JoinColumn({ name: 'pedidoId' })
  pedido: Relation<Pedido>;
  @Column(dinero) monto: number;
  @Column({ type: 'varchar', length: 20 }) metodo: MetodoPago;
  @Column({ type: 'varchar', length: 80, nullable: true }) referencia: string | null;
  @Index()
  @Column({ type: 'timestamptz' })
  fecha: Date;
  @Column({ type: 'varchar', length: 240, nullable: true }) notas: string | null;
  @Column({ type: 'int', nullable: true }) usuarioId: number | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) usuarioNombre: string | null;
  @Column({ default: false }) cancelado: boolean;
  @Column({ type: 'varchar', length: 240, nullable: true }) motivoCancelacion: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Pollitandas                                                        */
/* ------------------------------------------------------------------ */

@Entity('pollitandas')
export class Pollitanda {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 120 }) nombre: string;
  @Column({ type: 'text', nullable: true }) descripcion: string | null;
  @Column({ type: 'int' }) productoId: number;
  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoId' })
  producto: Relation<Producto>;
  @Column({ type: 'int' }) sucursalId: number;
  @ManyToOne(() => Sucursal)
  @JoinColumn({ name: 'sucursalId' })
  sucursal: Relation<Sucursal>;
  @Column({ type: 'int' }) pollitosPorPaquete: number;
  @Column(dinero) precioPaquete: number;
  @Column(dinero) anticipoMinimo: number;
  @Column({ type: 'int' }) cupoPaquetes: number;
  @Column({ type: 'date', nullable: true }) fechaCierre: string | null;
  @Column({ type: 'date' }) fechaEntrega: string;
  /** true = se puede vender aunque los pollitos aún no estén en inventario */
  @Column({ default: false }) preventa: boolean;
  @Column({ type: 'varchar', length: 20, default: 'ABIERTA' }) estado: EstadoPollitanda;
  @OneToMany(() => Inscripcion, (i) => i.pollitanda)
  inscripciones: Relation<Inscripcion>[];
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

/** Expediente de un participante dentro de una Pollitanda */
@Entity('inscripciones')
export class Inscripcion {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true })
  @Column({ length: 20 })
  folio: string;
  @Index()
  @Column({ type: 'int' })
  pollitandaId: number;
  @ManyToOne(() => Pollitanda, (p) => p.inscripciones)
  @JoinColumn({ name: 'pollitandaId' })
  pollitanda: Relation<Pollitanda>;
  @Index()
  @Column({ type: 'int' })
  clienteId: number;
  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'clienteId' })
  cliente: Relation<Cliente>;
  @Column({ type: 'int' }) paquetes: number;
  @Column({ type: 'int' }) cantidadPollitos: number;
  /** El pedido concentra importe, pagos, saldo, reserva de inventario y entrega */
  @Index({ unique: true })
  @Column({ type: 'int' })
  pedidoId: number;
  @OneToOne(() => Pedido, (p) => p.inscripcion)
  @JoinColumn({ name: 'pedidoId' })
  pedido: Relation<Pedido>;
  @Column({ type: 'text', nullable: true }) notas: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Notificaciones (WhatsApp)                                          */
/* ------------------------------------------------------------------ */

@Entity('notificaciones')
@Index(['plantilla', 'referencia'])
export class Notificacion {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 20, default: 'WHATSAPP' }) canal: string;
  @Column({ type: 'int', nullable: true }) clienteId: number | null;
  @ManyToOne(() => Cliente, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clienteId' })
  cliente: Relation<Cliente> | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) destinatario: string | null;
  @Column({ length: 40 }) plantilla: string;
  @Column({ type: 'text' }) mensaje: string;
  @Index()
  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: EstadoNotificacion;
  @Column({ type: 'varchar', length: 40, nullable: true }) referencia: string | null;
  @Column({ type: 'varchar', length: 240, nullable: true }) error: string | null;
  @Column({ type: 'timestamptz', nullable: true }) enviadaAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

export const ENTIDADES = [
  Sucursal,
  Usuario,
  Bitacora,
  Folio,
  Cliente,
  Seguimiento,
  Producto,
  Lote,
  Movimiento,
  Pedido,
  PedidoItem,
  Reserva,
  Pago,
  Pollitanda,
  Inscripcion,
  Notificacion,
];
