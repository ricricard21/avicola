import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Sesion } from '../common/seguridad';
import { BitacoraService, FolioService } from '../common/servicios';
import { exigir, fechaLarga, hoy, pesos, r2 } from '../common/util';
import { Cliente, Inscripcion, Pedido, Pollitanda, Producto } from '../db/entities';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PagosService } from '../pagos/pagos.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { InscribirDto, PollitandaDto } from './pollitandas.dto';

export type EstadoExpediente = 'APARTADO' | 'EN_PAGOS' | 'LIQUIDADO' | 'ENTREGADO' | 'CANCELADO';

/**
 * El estado del expediente no se guarda: se deduce del pedido ligado,
 * así nunca puede contradecir a los pagos ni a la entrega.
 */
export function estadoExpediente(pedido: Pick<Pedido, 'estado' | 'total' | 'pagado'>): EstadoExpediente {
  if (pedido.estado === 'CANCELADO') return 'CANCELADO';
  if (pedido.estado === 'ENTREGADO') return 'ENTREGADO';
  if (pedido.pagado <= 0) return 'APARTADO';
  return pedido.pagado >= pedido.total ? 'LIQUIDADO' : 'EN_PAGOS';
}

@Injectable()
export class PollitandasService {
  constructor(
    private readonly ds: DataSource,
    private readonly folios: FolioService,
    private readonly bitacora: BitacoraService,
    private readonly pedidos: PedidosService,
    private readonly pagos: PagosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private get repo() {
    return this.ds.getRepository(Pollitanda);
  }

  /* ============================ Programas ============================ */

  async listar(sesion: Sesion) {
    const programas = await this.repo.find({
      where: sesion.sucursalId ? { sucursalId: sesion.sucursalId } : {},
      relations: { producto: true, sucursal: true },
      order: { fechaEntrega: 'DESC', id: 'DESC' },
    });
    const filas: Record<string, string>[] = await this.ds.query(
      `SELECT i."pollitandaId",
              COUNT(*)                         AS participantes,
              COALESCE(SUM(i.paquetes), 0)     AS paquetes,
              COALESCE(SUM(i."cantidadPollitos"), 0) AS pollitos,
              COALESCE(SUM(p.total), 0)        AS vendido,
              COALESCE(SUM(p.pagado), 0)       AS cobrado,
              COUNT(*) FILTER (WHERE p.pagado = 0 AND p.estado <> 'ENTREGADO') AS "sinAnticipo"
         FROM inscripciones i JOIN pedidos p ON p.id = i."pedidoId"
        WHERE p.estado <> 'CANCELADO'
        GROUP BY i."pollitandaId"`,
    );
    const stats = new Map(filas.map((f) => [Number(f.pollitandaId), f]));
    return programas.map((t) => {
      const s = stats.get(t.id);
      const paquetes = Number(s?.paquetes ?? 0);
      const vendido = r2(Number(s?.vendido ?? 0));
      const cobrado = r2(Number(s?.cobrado ?? 0));
      return {
        ...this.presentar(t),
        participantes: Number(s?.participantes ?? 0),
        paquetesVendidos: paquetes,
        cupoDisponible: Math.max(0, t.cupoPaquetes - paquetes),
        pollitos: Number(s?.pollitos ?? 0),
        vendido,
        cobrado,
        porCobrar: r2(vendido - cobrado),
        sinAnticipo: Number(s?.sinAnticipo ?? 0),
      };
    });
  }

  /** Programa con todos sus expedientes */
  async detalle(sesion: Sesion, id: number) {
    const t = await this.repo.findOne({ where: { id }, relations: { producto: true, sucursal: true } });
    if (!t || (sesion.sucursalId && t.sucursalId !== sesion.sucursalId)) throw new NotFoundException('Pollitanda no encontrada');
    const inscripciones = await this.ds.getRepository(Inscripcion).find({
      where: { pollitandaId: id },
      relations: { cliente: true, pedido: { items: true } },
      order: { id: 'ASC' },
    });
    const expedientes = inscripciones.map((i) => this.presentarExpediente(i));
    const vigentes = expedientes.filter((e) => e.estado !== 'CANCELADO');
    const paquetes = vigentes.reduce((s, e) => s + e.paquetes, 0);
    const vendido = r2(vigentes.reduce((s, e) => s + e.total, 0));
    const cobrado = r2(vigentes.reduce((s, e) => s + e.pagado, 0));
    return {
      ...this.presentar(t),
      participantes: vigentes.length,
      paquetesVendidos: paquetes,
      cupoDisponible: Math.max(0, t.cupoPaquetes - paquetes),
      pollitos: vigentes.reduce((s, e) => s + e.cantidadPollitos, 0),
      pollitosPorSurtir: r2(vigentes.reduce((s, e) => s + e.pollitosPorSurtir, 0)),
      vendido,
      cobrado,
      porCobrar: r2(vendido - cobrado),
      expedientes,
    };
  }

  async crear(sesion: Sesion, dto: PollitandaDto) {
    const sucursalId = await this.pedidos.resolverSucursal(sesion, dto.sucursalId);
    await this.validar(dto);
    const t = await this.repo.save(
      this.repo.create({
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() || null,
        productoId: dto.productoId,
        sucursalId,
        pollitosPorPaquete: dto.pollitosPorPaquete,
        precioPaquete: r2(dto.precioPaquete),
        anticipoMinimo: r2(dto.anticipoMinimo ?? 0),
        cupoPaquetes: dto.cupoPaquetes,
        fechaCierre: dto.fechaCierre || null,
        fechaEntrega: dto.fechaEntrega,
        preventa: dto.preventa ?? true,
      }),
    );
    await this.bitacora.registrar(sesion, 'CREAR', 'pollitanda', t.id, `Nueva Pollitanda "${t.nombre}"`);
    return this.detalle(sesion, t.id);
  }

  async editar(sesion: Sesion, id: number, dto: PollitandaDto) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Pollitanda no encontrada');
    await this.validar(dto);
    const inscritos = await this.ds.getRepository(Inscripcion).count({ where: { pollitandaId: id } });
    if (inscritos > 0) {
      // Con participantes inscritos no se cambian las condiciones que ya se les vendieron.
      exigir(
        dto.productoId === t.productoId && dto.pollitosPorPaquete === t.pollitosPorPaquete && r2(dto.precioPaquete) === t.precioPaquete,
        'Esta Pollitanda ya tiene participantes: no se puede cambiar el producto, el tamaño ni el precio del paquete',
      );
    }
    await this.repo.update(id, {
      nombre: dto.nombre.trim(),
      descripcion: dto.descripcion?.trim() || null,
      productoId: dto.productoId,
      pollitosPorPaquete: dto.pollitosPorPaquete,
      precioPaquete: r2(dto.precioPaquete),
      anticipoMinimo: r2(dto.anticipoMinimo ?? 0),
      cupoPaquetes: dto.cupoPaquetes,
      fechaCierre: dto.fechaCierre || null,
      fechaEntrega: dto.fechaEntrega,
      preventa: dto.preventa ?? t.preventa,
      ...(dto.estado ? { estado: dto.estado } : {}),
    });
    // Si cambia la fecha de entrega se actualiza en los pedidos que siguen abiertos.
    if (dto.fechaEntrega !== t.fechaEntrega) {
      await this.ds.query(
        `UPDATE pedidos SET "fechaEntrega" = $1
          WHERE estado IN ('RECIBIDO','PREPARADO','INCIDENCIA')
            AND id IN (SELECT "pedidoId" FROM inscripciones WHERE "pollitandaId" = $2)`,
        [dto.fechaEntrega, id],
      );
    }
    await this.bitacora.registrar(sesion, 'EDITAR', 'pollitanda', id, `Cambios en "${dto.nombre}"`);
    return this.detalle(sesion, id);
  }

  /* ============================ Expedientes ============================ */

  /**
   * Inscribe a un participante. En una sola operación:
   * genera el pedido PSA, aparta los pollitos, registra el anticipo y deja listo el mensaje de confirmación.
   */
  async inscribir(sesion: Sesion, pollitandaId: number, dto: InscribirDto) {
    const inscripcionId = await this.ds.transaction(async (em) => {
      // Se bloquea el programa para que el cupo no se sobrevenda con inscripciones simultáneas.
      const t = await em.getRepository(Pollitanda).createQueryBuilder('t').setLock('pessimistic_write').where('t.id = :id', { id: pollitandaId }).getOne();
      if (!t || (sesion.sucursalId && t.sucursalId !== sesion.sucursalId)) throw new NotFoundException('Pollitanda no encontrada');
      exigir(t.estado === 'ABIERTA', 'Esta Pollitanda ya no acepta inscripciones');
      exigir(!t.fechaCierre || t.fechaCierre >= hoy(), `Las inscripciones cerraron el ${t.fechaCierre ? fechaLarga(t.fechaCierre) : ''}`);

      const [{ vendidos }]: { vendidos: string }[] = await em.query(
        `SELECT COALESCE(SUM(i.paquetes), 0) AS vendidos
           FROM inscripciones i JOIN pedidos p ON p.id = i."pedidoId"
          WHERE i."pollitandaId" = $1 AND p.estado <> 'CANCELADO'`,
        [t.id],
      );
      const cupo = t.cupoPaquetes - Number(vendidos);
      if (dto.paquetes > cupo) throw new ConflictException(cupo > 0 ? `Solo quedan ${cupo} paquetes disponibles en esta Pollitanda` : 'Esta Pollitanda ya está llena');

      const producto = await em.getRepository(Producto).findOne({ where: { id: t.productoId } });
      const cantidadPollitos = dto.paquetes * t.pollitosPorPaquete;
      const total = r2(dto.paquetes * t.precioPaquete);
      const anticipo = r2(dto.anticipo?.monto ?? 0);
      const minimo = r2(t.anticipoMinimo * dto.paquetes);
      exigir(anticipo === 0 || anticipo >= minimo, `El anticipo mínimo es de ${pesos(minimo)} (${pesos(t.anticipoMinimo)} por paquete)`);

      const pedido = await this.pedidos.crearEn(em, sesion, {
        clienteId: dto.clienteId,
        sucursalId: t.sucursalId,
        renglones: [
          {
            productoId: t.productoId,
            descripcion: `${producto!.nombre} · Pollitanda ${t.nombre} (${dto.paquetes} paq. de ${t.pollitosPorPaquete})`,
            cantidad: cantidadPollitos,
            precioUnitario: r2(t.precioPaquete / t.pollitosPorPaquete),
            importe: total,
          },
        ],
        descuento: 0,
        fechaEntrega: t.fechaEntrega,
        fechaVencimiento: t.fechaEntrega,
        notas: dto.notas?.trim() || null,
        confirmar: true,
        permitirFaltante: t.preventa,
        omitirAviso: true,
      });

      const repo = em.getRepository(Inscripcion);
      const inscripcion = await repo.save(
        repo.create({
          folio: await this.folios.siguiente(em, 'PT'),
          pollitandaId: t.id,
          clienteId: dto.clienteId,
          paquetes: dto.paquetes,
          cantidadPollitos,
          pedidoId: pedido.id,
          notas: dto.notas?.trim() || null,
        }),
      );

      const cliente = await em.getRepository(Cliente).findOne({ where: { id: dto.clienteId } });
      await this.notificaciones.crear(
        'pollitanda_inscripcion',
        cliente!,
        { programa: t.nombre, pollitos: cantidadPollitos, total: pesos(total), fechaEntrega: fechaLarga(t.fechaEntrega), folio: inscripcion.folio },
        inscripcion.folio,
        em,
      );
      if (anticipo > 0) {
        await this.pagos.registrarEn(em, sesion, {
          pedidoId: pedido.id,
          monto: anticipo,
          metodo: dto.anticipo!.metodo,
          referencia: dto.anticipo!.referencia,
          notas: `Anticipo Pollitanda ${t.nombre}`,
        });
      }
      await this.bitacora.registrar(
        sesion,
        'INSCRIBIR',
        'pollitanda',
        t.id,
        `${inscripcion.folio}: ${cliente!.nombre}, ${dto.paquetes} paq. (${cantidadPollitos} pollitos) · pedido ${pedido.folio}`,
        undefined,
        em,
      );
      return inscripcion.id;
    });
    return this.expediente(sesion, inscripcionId);
  }

  /** Expediente individual: participante, paquete, pagos, saldo, entrega y estado */
  async expediente(sesion: Sesion, id: number) {
    const i = await this.ds.getRepository(Inscripcion).findOne({
      where: { id },
      relations: { cliente: true, pollitanda: { producto: true }, pedido: { items: true, pagos: true } },
      order: { pedido: { pagos: { id: 'ASC' } } },
    });
    if (!i || (sesion.sucursalId && i.pollitanda.sucursalId !== sesion.sucursalId)) throw new NotFoundException('Expediente no encontrado');
    return {
      ...this.presentarExpediente(i),
      notas: i.notas,
      createdAt: i.createdAt,
      pollitanda: {
        id: i.pollitanda.id,
        nombre: i.pollitanda.nombre,
        pollitosPorPaquete: i.pollitanda.pollitosPorPaquete,
        precioPaquete: i.pollitanda.precioPaquete,
        anticipoMinimo: i.pollitanda.anticipoMinimo,
        producto: i.pollitanda.producto.nombre,
      },
      pagos: i.pedido.pagos.map((g) => ({ id: g.id, folio: g.folio, monto: g.monto, metodo: g.metodo, referencia: g.referencia, fecha: g.fecha, cancelado: g.cancelado })),
    };
  }

  /** Da de baja a un participante: cancela su pedido y libera sus pollitos y su lugar */
  async cancelarInscripcion(sesion: Sesion, id: number, motivo: string) {
    const i = await this.ds.getRepository(Inscripcion).findOne({ where: { id }, relations: { pollitanda: true } });
    if (!i) throw new NotFoundException('Expediente no encontrado');
    await this.ds.transaction(async (em) => {
      await this.pedidos.cancelarEn(em, sesion, i.pedidoId, motivo);
      await this.bitacora.registrar(sesion, 'BAJA', 'pollitanda', i.pollitandaId, `${i.folio} dado de baja: ${motivo}`, undefined, em);
    });
    return this.expediente(sesion, id);
  }

  /* ============================ Internos ============================ */

  private async validar(dto: PollitandaDto) {
    const producto = await this.ds.getRepository(Producto).findOne({ where: { id: dto.productoId } });
    exigir(producto && producto.activo, 'El producto seleccionado no existe');
    exigir(!dto.fechaCierre || dto.fechaCierre <= dto.fechaEntrega, 'El cierre de inscripciones debe ser antes de la entrega');
    exigir((dto.anticipoMinimo ?? 0) <= dto.precioPaquete, 'El anticipo mínimo no puede ser mayor al precio del paquete');
  }

  private presentar(t: Pollitanda) {
    return {
      id: t.id,
      nombre: t.nombre,
      descripcion: t.descripcion,
      productoId: t.productoId,
      producto: t.producto ? { id: t.producto.id, nombre: t.producto.nombre, unidad: t.producto.unidad } : undefined,
      sucursal: t.sucursal ? { id: t.sucursal.id, nombre: t.sucursal.nombre } : undefined,
      pollitosPorPaquete: t.pollitosPorPaquete,
      precioPaquete: t.precioPaquete,
      anticipoMinimo: t.anticipoMinimo,
      cupoPaquetes: t.cupoPaquetes,
      fechaCierre: t.fechaCierre,
      fechaEntrega: t.fechaEntrega,
      preventa: t.preventa,
      estado: t.estado,
    };
  }

  private presentarExpediente(i: Inscripcion) {
    const p = i.pedido;
    const reservado = (p.items ?? []).reduce((s, it) => s + it.cantidadReservada, 0);
    const abierto = !['CANCELADO', 'ENTREGADO'].includes(p.estado);
    return {
      id: i.id,
      folio: i.folio,
      cliente: { id: i.cliente.id, nombre: i.cliente.nombre, telefono: i.cliente.whatsapp || i.cliente.telefono },
      paquetes: i.paquetes,
      cantidadPollitos: i.cantidadPollitos,
      pollitosPorSurtir: abierto ? r2(i.cantidadPollitos - reservado) : 0,
      total: p.total,
      pagado: p.pagado,
      saldo: p.estado === 'CANCELADO' ? 0 : r2(p.total - p.pagado),
      fechaEntrega: p.fechaEntrega,
      estado: estadoExpediente(p),
      pedido: { id: p.id, folio: p.folio, estado: p.estado },
    };
  }
}
