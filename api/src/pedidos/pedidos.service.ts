import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Sesion, tiene } from '../common/seguridad';
import { BitacoraService, FolioService } from '../common/servicios';
import { exigir, fechaLarga, hoy, paginar, pesos, r2, ZONA } from '../common/util';
import { Cliente, EstadoPedido, Pedido, PedidoItem, Producto, Sucursal } from '../db/entities';
import { InventarioService } from '../inventario/inventario.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CrearPedidoDto, EditarPedidoDto, EstadoDto, ItemDto } from './pedidos.dto';

/** Hacia qué estados puede avanzar un pedido desde cada estado */
const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  COTIZACION: [],
  RECIBIDO: ['PREPARADO', 'ENTREGADO', 'INCIDENCIA'],
  PREPARADO: ['EN_RUTA', 'ENTREGADO', 'RECIBIDO', 'INCIDENCIA'],
  EN_RUTA: ['ENTREGADO', 'PREPARADO', 'INCIDENCIA'],
  INCIDENCIA: ['RECIBIDO', 'PREPARADO', 'EN_RUTA'],
  ENTREGADO: [],
  CANCELADO: [],
};

/** Renglón ya calculado, listo para guardarse */
export interface Renglon {
  productoId: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

export interface NuevoPedido {
  clienteId: number;
  sucursalId: number;
  renglones: Renglon[];
  descuento: number;
  fechaEntrega: string | null;
  fechaVencimiento: string | null;
  notas: string | null;
  confirmar: boolean;
  permitirFaltante: boolean;
  /** Las Pollitandas envían su propio mensaje de confirmación */
  omitirAviso?: boolean;
}

@Injectable()
export class PedidosService {
  constructor(
    private readonly ds: DataSource,
    private readonly folios: FolioService,
    private readonly bitacora: BitacoraService,
    private readonly inventario: InventarioService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /* ============================ Altas ============================ */

  async crear(sesion: Sesion, dto: CrearPedidoDto) {
    const sucursalId = await this.resolverSucursal(sesion, dto.sucursalId);
    const id = await this.ds.transaction(async (em) => {
      const renglones = await this.calcularRenglones(em, sesion, dto.items);
      const descuento = r2(dto.descuento ?? 0);
      if (descuento > 0 && !tiene(sesion, 'ventas.descuento')) throw new ForbiddenException('No tienes permiso para aplicar descuentos');
      const pedido = await this.crearEn(em, sesion, {
        clienteId: dto.clienteId,
        sucursalId,
        renglones,
        descuento,
        fechaEntrega: dto.fechaEntrega || null,
        fechaVencimiento: dto.fechaVencimiento || null,
        notas: dto.notas?.trim() || null,
        confirmar: dto.confirmar,
        permitirFaltante: !!dto.permitirFaltante,
      });
      return pedido.id;
    });
    return this.detalle(sesion, id);
  }

  /** Crea el pedido dentro de una transacción abierta (lo usa también Pollitandas) */
  async crearEn(em: EntityManager, sesion: Sesion, datos: NuevoPedido): Promise<Pedido> {
    const cliente = await em.getRepository(Cliente).findOne({ where: { id: datos.clienteId } });
    if (!cliente || !cliente.activo) throw new NotFoundException('Cliente no encontrado');
    exigir(datos.renglones.length > 0, 'Agrega al menos un producto');

    const subtotal = r2(datos.renglones.reduce((s, r) => s + r.importe, 0));
    exigir(datos.descuento <= subtotal, 'El descuento no puede ser mayor al subtotal');
    exigir(!datos.fechaEntrega || !datos.confirmar || datos.fechaEntrega >= hoy(), 'La fecha de entrega no puede ser anterior a hoy');

    const repo = em.getRepository(Pedido);
    const pedido = await repo.save(
      repo.create({
        // Un pedido directo recibe su folio PSA desde el inicio; la cotización usa la serie COT.
        folio: await this.folios.siguiente(em, datos.confirmar ? 'PSA' : 'COT'),
        estado: 'COTIZACION',
        clienteId: cliente.id,
        vendedorId: sesion.id,
        sucursalId: datos.sucursalId,
        fechaEntrega: datos.fechaEntrega,
        fechaVencimiento: datos.fechaVencimiento,
        subtotal,
        descuento: datos.descuento,
        total: r2(subtotal - datos.descuento),
        pagado: 0,
        notas: datos.notas,
      }),
    );
    await em.getRepository(PedidoItem).insert(datos.renglones.map((r) => ({ ...r, pedidoId: pedido.id, cantidadReservada: 0 })));

    if (cliente.tipo === 'PROSPECTO' && (cliente.etapa === 'NUEVO' || cliente.etapa === 'CONTACTADO')) {
      await em.getRepository(Cliente).update(cliente.id, { etapa: 'COTIZADO' });
    }
    if (datos.confirmar) return this.confirmarEn(em, sesion, pedido.id, datos.permitirFaltante, { directo: true, omitirAviso: datos.omitirAviso });

    await this.bitacora.registrar(sesion, 'COTIZAR', 'pedido', pedido.id, `${pedido.folio} para ${cliente.nombre} por ${pesos(pedido.total)}`, undefined, em);
    return pedido;
  }

  /* ========================== Confirmación ========================== */

  async confirmar(sesion: Sesion, id: number, permitirFaltante = false) {
    await this.ds.transaction((em) => this.confirmarEn(em, sesion, id, permitirFaltante));
    return this.detalle(sesion, id);
  }

  /**
   * Convierte la cotización en pedido en firme: asigna folio PSA y aparta inventario.
   * Si no alcanza la existencia se rechaza, salvo que se autorice la preventa.
   */
  private async confirmarEn(
    em: EntityManager,
    sesion: Sesion,
    id: number,
    permitirFaltante: boolean,
    opciones: { directo?: boolean; omitirAviso?: boolean } = {},
  ): Promise<Pedido> {
    const pedido = await this.bloquear(em, sesion, id);
    exigir(pedido.estado === 'COTIZACION', 'Este pedido ya estaba confirmado');
    const items = await em.getRepository(PedidoItem).find({ where: { pedidoId: id }, relations: { producto: true }, order: { id: 'ASC' } });
    const folio = opciones.directo ? pedido.folio : await this.folios.siguiente(em, 'PSA');

    const faltantes: string[] = [];
    for (const item of items) {
      const faltante = await this.inventario.reservarItem(em, item, { sucursalId: pedido.sucursalId, folio, fechaEntrega: pedido.fechaEntrega }, sesion);
      if (faltante > 0) {
        faltantes.push(`${item.producto.nombre}: se piden ${item.cantidad} y solo hay ${item.cantidadReservada} disponibles`);
      }
    }
    if (faltantes.length && !permitirFaltante) {
      // La excepción revierte la transacción: no queda nada apartado.
      throw new ConflictException({ message: `Inventario insuficiente. ${faltantes.join('. ')}.`, codigo: 'SIN_EXISTENCIA', faltantes });
    }

    const dia = hoy();
    await em.getRepository(Pedido).update(id, {
      folio,
      folioCotizacion: opciones.directo ? null : pedido.folio,
      estado: 'RECIBIDO',
      confirmadoAt: new Date(),
      fechaVencimiento: pedido.fechaVencimiento ?? pedido.fechaEntrega ?? dia,
    });
    // El prospecto que compra pasa a ser cliente.
    const cliente = await em.getRepository(Cliente).findOne({ where: { id: pedido.clienteId } });
    if (cliente!.tipo === 'PROSPECTO') await em.getRepository(Cliente).update(cliente!.id, { tipo: 'CLIENTE', etapa: null });

    await this.bitacora.registrar(
      sesion,
      'CONFIRMAR',
      'pedido',
      id,
      `${folio} para ${cliente!.nombre} por ${pesos(pedido.total)}${faltantes.length ? ' (con preventa)' : ''}`,
      faltantes.length ? { faltantes } : undefined,
      em,
    );
    if (!opciones.omitirAviso) {
      await this.notificaciones.crear(
        'pedido_confirmado',
        cliente!,
        { folio, total: pesos(pedido.total), fechaEntrega: pedido.fechaEntrega ? fechaLarga(pedido.fechaEntrega) : null },
        folio,
        em,
      );
    }
    return (await em.getRepository(Pedido).findOne({ where: { id } }))!;
  }

  /** Reintenta apartar inventario para un pedido en preventa */
  async reservarPendiente(sesion: Sesion, id: number) {
    await this.ds.transaction(async (em) => {
      const pedido = await this.bloquear(em, sesion, id);
      exigir(['RECIBIDO', 'PREPARADO', 'INCIDENCIA'].includes(pedido.estado), 'El pedido no admite reservas en su estado actual');
      const items = await em.getRepository(PedidoItem).find({ where: { pedidoId: id }, order: { id: 'ASC' } });
      for (const item of items) await this.inventario.reservarItem(em, item, pedido, sesion);
    });
    return this.detalle(sesion, id);
  }

  /* ============================ Edición ============================ */

  async editar(sesion: Sesion, id: number, dto: EditarPedidoDto) {
    await this.ds.transaction(async (em) => {
      const pedido = await this.bloquear(em, sesion, id);
      exigir(!['ENTREGADO', 'CANCELADO'].includes(pedido.estado), 'Este pedido ya no se puede modificar');
      const cambios: Partial<Pedido> = {};
      if (dto.fechaEntrega !== undefined) cambios.fechaEntrega = dto.fechaEntrega || null;
      if (dto.fechaVencimiento !== undefined) cambios.fechaVencimiento = dto.fechaVencimiento || null;
      if (dto.notas !== undefined) cambios.notas = dto.notas?.trim() || null;

      if (dto.items || dto.descuento !== undefined) {
        exigir(pedido.estado === 'COTIZACION', 'Los productos y el descuento solo se pueden cambiar mientras es cotización');
        let subtotal = pedido.subtotal;
        if (dto.items) {
          const renglones = await this.calcularRenglones(em, sesion, dto.items);
          await em.getRepository(PedidoItem).delete({ pedidoId: id });
          await em.getRepository(PedidoItem).insert(renglones.map((r) => ({ ...r, pedidoId: id, cantidadReservada: 0 })));
          subtotal = r2(renglones.reduce((s, r) => s + r.importe, 0));
        }
        const descuento = r2(dto.descuento ?? pedido.descuento);
        if (descuento > pedido.descuento && !tiene(sesion, 'ventas.descuento')) throw new ForbiddenException('No tienes permiso para aplicar descuentos');
        exigir(descuento <= subtotal, 'El descuento no puede ser mayor al subtotal');
        Object.assign(cambios, { subtotal, descuento, total: r2(subtotal - descuento) });
      }
      if (Object.keys(cambios).length) await em.getRepository(Pedido).update(id, cambios);
      await this.bitacora.registrar(sesion, 'EDITAR', 'pedido', id, `Cambios en ${pedido.folio}`, { ...cambios }, em);
    });
    return this.detalle(sesion, id);
  }

  /* ====================== Preparación y entrega ====================== */

  async cambiarEstado(sesion: Sesion, id: number, dto: EstadoDto) {
    await this.ds.transaction(async (em) => {
      const pedido = await this.bloquear(em, sesion, id);
      const destino = dto.estado;
      const permitidos =
        pedido.estado === 'INCIDENCIA' ? [pedido.estadoPrevio ?? 'RECIBIDO', ...TRANSICIONES.INCIDENCIA] : TRANSICIONES[pedido.estado];
      exigir(permitidos.includes(destino), `Un pedido ${this.nombreEstado(pedido.estado)} no puede pasar a ${this.nombreEstado(destino)}`);

      const items = await em.getRepository(PedidoItem).find({ where: { pedidoId: id }, relations: { producto: true }, order: { id: 'ASC' } });
      const cambios: Partial<Pedido> = { estado: destino };

      if (destino === 'INCIDENCIA') {
        exigir(dto.nota?.trim(), 'Describe la incidencia');
        cambios.incidencia = dto.nota!.trim();
        cambios.estadoPrevio = pedido.estado;
      } else if (pedido.estado === 'INCIDENCIA') {
        cambios.estadoPrevio = null;
      }

      // Para preparar, enviar o entregar, todo el pedido debe tener inventario apartado.
      if (['PREPARADO', 'EN_RUTA', 'ENTREGADO'].includes(destino)) {
        const sinSurtir = items.filter((i) => i.cantidadReservada < i.cantidad);
        if (sinSurtir.length) {
          const detalle = sinSurtir.map((i) => `${i.producto.nombre} (faltan ${r2(i.cantidad - i.cantidadReservada)})`).join(', ');
          throw new ConflictException(`Aún no hay inventario para surtir: ${detalle}. Registra la entrada del lote e inténtalo de nuevo.`);
        }
      }

      if (destino === 'ENTREGADO') {
        for (const item of items) await this.inventario.surtirItem(em, item, pedido.folio, sesion);
        cambios.entregadoAt = new Date();
        cambios.recibidoPor = dto.recibidoPor?.trim() || null;
        if (dto.nota?.trim()) cambios.notas = [pedido.notas, `Entrega: ${dto.nota.trim()}`].filter(Boolean).join('\n');
      }

      await em.getRepository(Pedido).update(id, cambios);
      await this.bitacora.registrar(sesion, `ESTADO_${destino}`, 'pedido', id, `${pedido.folio}: ${this.nombreEstado(pedido.estado)} → ${this.nombreEstado(destino)}`, dto.nota ? { nota: dto.nota } : undefined, em);

      const plantilla = ({ PREPARADO: 'pedido_preparado', EN_RUTA: 'pedido_en_ruta', ENTREGADO: 'pedido_entregado' } as const)[destino as 'PREPARADO'];
      if (plantilla && pedido.estado !== 'INCIDENCIA') {
        const cliente = await em.getRepository(Cliente).findOne({ where: { id: pedido.clienteId } });
        const saldo = r2(pedido.total - pedido.pagado);
        await this.notificaciones.crear(plantilla, cliente!, { folio: pedido.folio, saldo: pesos(saldo), saldoNum: saldo }, pedido.folio, em);
      }
    });
    return this.detalle(sesion, id);
  }

  async cancelar(sesion: Sesion, id: number, motivo: string) {
    await this.ds.transaction((em) => this.cancelarEn(em, sesion, id, motivo));
    return this.detalle(sesion, id);
  }

  async cancelarEn(em: EntityManager, sesion: Sesion, id: number, motivo: string) {
    const pedido = await this.bloquear(em, sesion, id);
    exigir(pedido.estado !== 'CANCELADO', 'El pedido ya estaba cancelado');
    exigir(pedido.estado !== 'ENTREGADO', 'Un pedido entregado no se puede cancelar');
    // Un vendedor puede descartar sus cotizaciones; cancelar un pedido en firme requiere permiso.
    if (pedido.estado !== 'COTIZACION' && !tiene(sesion, 'ventas.cancelar')) {
      throw new ForbiddenException('No tienes permiso para cancelar pedidos confirmados');
    }
    if (pedido.pagado > 0) {
      throw new ConflictException(`Este pedido tiene ${pesos(pedido.pagado)} en pagos. Cancela primero los pagos en Cobranza para dejar constancia de la devolución.`);
    }
    const items = await em.getRepository(PedidoItem).find({ where: { pedidoId: id } });
    for (const item of items) await this.inventario.liberarItem(em, item, pedido.folio, sesion);
    await em.getRepository(Pedido).update(id, { estado: 'CANCELADO', canceladoAt: new Date(), motivoCancelacion: motivo.trim(), estadoPrevio: null });
    await this.bitacora.registrar(sesion, 'CANCELAR', 'pedido', id, `${pedido.folio}: ${motivo}`, undefined, em);
    // Lo liberado puede servir a otros pedidos que estaban en preventa.
    for (const item of items) await this.inventario.surtirPreventas(em, item.productoId, pedido.sucursalId, sesion);
  }

  /* ============================ Consultas ============================ */

  async listar(
    sesion: Sesion,
    q: { estado?: string; grupo?: string; q?: string; clienteId?: string; desde?: string; hasta?: string; pagina?: string; porPagina?: string },
  ) {
    const { pagina, porPagina, skip, take } = paginar(q.pagina, q.porPagina);
    const qb = this.ds
      .getRepository(Pedido)
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.cliente', 'c')
      .leftJoinAndSelect('p.vendedor', 'v')
      .leftJoinAndSelect('p.inscripcion', 'i')
      .orderBy('p.id', 'DESC')
      .skip(skip)
      .take(take);
    if (sesion.sucursalId) qb.andWhere('p.sucursalId = :s', { s: sesion.sucursalId });
    if (q.estado) qb.andWhere('p.estado = :estado', { estado: q.estado });
    if (q.grupo === 'cotizaciones') qb.andWhere(`p.estado = 'COTIZACION'`);
    if (q.grupo === 'activos') qb.andWhere(`p.estado IN ('RECIBIDO','PREPARADO','EN_RUTA','INCIDENCIA')`);
    if (q.grupo === 'cerrados') qb.andWhere(`p.estado IN ('ENTREGADO','CANCELADO')`);
    if (q.clienteId) qb.andWhere('p.clienteId = :c', { c: Number(q.clienteId) });
    if (q.desde) qb.andWhere(`(p.createdAt AT TIME ZONE '${ZONA}')::date >= :desde`, { desde: q.desde });
    if (q.hasta) qb.andWhere(`(p.createdAt AT TIME ZONE '${ZONA}')::date <= :hasta`, { hasta: q.hasta });
    if (q.q?.trim()) qb.andWhere('(p.folio ILIKE :t OR p.folioCotizacion ILIKE :t OR c.nombre ILIKE :t)', { t: `%${q.q.trim()}%` });

    const [filas, total] = await qb.getManyAndCount();
    const filtroSucursal = sesion.sucursalId ? `WHERE "sucursalId" = ${Number(sesion.sucursalId)}` : '';
    const conteo: { estado: string; n: string }[] = await this.ds.query(`SELECT estado, COUNT(*) AS n FROM pedidos ${filtroSucursal} GROUP BY estado`);
    return {
      datos: filas.map((p) => this.resumir(p)),
      total,
      pagina,
      porPagina,
      conteo: Object.fromEntries(conteo.map((c) => [c.estado, Number(c.n)])),
    };
  }

  async detalle(sesion: Sesion, id: number) {
    const p = await this.ds.getRepository(Pedido).findOne({
      where: { id },
      relations: {
        cliente: true,
        vendedor: true,
        sucursal: true,
        items: { producto: true, reservas: { lote: true } },
        pagos: true,
        inscripcion: { pollitanda: true },
      },
      order: { items: { id: 'ASC' }, pagos: { id: 'ASC' } },
    });
    if (!p || (sesion.sucursalId && p.sucursalId !== sesion.sucursalId)) throw new NotFoundException('Pedido no encontrado');
    const siguientes = p.estado === 'INCIDENCIA' ? [p.estadoPrevio ?? 'RECIBIDO'] : TRANSICIONES[p.estado];
    return {
      ...this.resumir(p),
      subtotal: p.subtotal,
      descuento: p.descuento,
      notas: p.notas,
      incidencia: p.estado === 'INCIDENCIA' ? p.incidencia : null,
      estadoPrevio: p.estadoPrevio,
      recibidoPor: p.recibidoPor,
      motivoCancelacion: p.motivoCancelacion,
      confirmadoAt: p.confirmadoAt,
      entregadoAt: p.entregadoAt,
      canceladoAt: p.canceladoAt,
      sucursal: { id: p.sucursal.id, nombre: p.sucursal.nombre },
      cliente: {
        id: p.cliente.id,
        nombre: p.cliente.nombre,
        tipo: p.cliente.tipo,
        telefono: p.cliente.whatsapp || p.cliente.telefono,
        direccion: p.cliente.direccion,
        municipio: p.cliente.municipio,
      },
      items: p.items.map((i) => ({
        id: i.id,
        productoId: i.productoId,
        descripcion: i.descripcion,
        unidad: i.producto.unidad,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        importe: i.importe,
        cantidadReservada: i.cantidadReservada,
        faltante: ['COTIZACION', 'CANCELADO', 'ENTREGADO'].includes(p.estado) ? 0 : r2(i.cantidad - i.cantidadReservada),
        lotes: i.reservas.map((r) => ({ codigo: r.lote.codigo, cantidad: r.cantidad, surtida: r.surtida, ubicacion: r.lote.ubicacion })),
      })),
      pagos: p.pagos.map((g) => ({
        id: g.id,
        folio: g.folio,
        monto: g.monto,
        metodo: g.metodo,
        referencia: g.referencia,
        fecha: g.fecha,
        cancelado: g.cancelado,
        motivoCancelacion: g.motivoCancelacion,
        usuarioNombre: g.usuarioNombre,
      })),
      siguientes,
    };
  }

  /* ============================ Internos ============================ */

  /** Valida productos y calcula importes con los precios vigentes */
  private async calcularRenglones(em: EntityManager, sesion: Sesion, items: ItemDto[]): Promise<Renglon[]> {
    const renglones: Renglon[] = [];
    for (const it of items) {
      const producto = await em.getRepository(Producto).findOne({ where: { id: it.productoId } });
      if (!producto || !producto.activo) throw new NotFoundException('Uno de los productos ya no está disponible en el catálogo');
      const precio = r2(it.precioUnitario ?? producto.precio);
      if (precio < producto.precio && !tiene(sesion, 'ventas.descuento')) {
        throw new ForbiddenException(`No tienes permiso para vender ${producto.nombre} por debajo del precio de lista (${pesos(producto.precio)})`);
      }
      renglones.push({
        productoId: producto.id,
        descripcion: producto.nombre,
        cantidad: r2(it.cantidad),
        precioUnitario: precio,
        importe: r2(it.cantidad * precio),
      });
    }
    return renglones;
  }

  /** Toma el pedido con bloqueo para que dos usuarios no lo cambien al mismo tiempo */
  private async bloquear(em: EntityManager, sesion: Sesion, id: number): Promise<Pedido> {
    const p = await em.getRepository(Pedido).createQueryBuilder('p').setLock('pessimistic_write').where('p.id = :id', { id }).getOne();
    if (!p || (sesion.sucursalId && p.sucursalId !== sesion.sucursalId)) throw new NotFoundException('Pedido no encontrado');
    return p;
  }

  async resolverSucursal(sesion: Sesion, solicitada?: number): Promise<number> {
    const repo = this.ds.getRepository(Sucursal);
    if (sesion.sucursalId) return sesion.sucursalId;
    if (solicitada) {
      exigir(await repo.findOne({ where: { id: solicitada, activa: true } }), 'La sucursal no existe');
      return solicitada;
    }
    const primera = await repo.findOne({ where: { activa: true }, order: { id: 'ASC' } });
    exigir(primera, 'Registra una sucursal en Configuración antes de vender');
    return primera.id;
  }

  private resumir(p: Pedido) {
    return {
      id: p.id,
      folio: p.folio,
      folioCotizacion: p.folioCotizacion,
      estado: p.estado,
      total: p.total,
      pagado: p.pagado,
      saldo: p.estado === 'COTIZACION' || p.estado === 'CANCELADO' ? 0 : r2(p.total - p.pagado),
      fechaEntrega: p.fechaEntrega,
      fechaVencimiento: p.fechaVencimiento,
      createdAt: p.createdAt,
      cliente: p.cliente ? { id: p.cliente.id, nombre: p.cliente.nombre } : undefined,
      vendedor: p.vendedor ? { id: p.vendedor.id, nombre: p.vendedor.nombre } : null,
      pollitanda: p.inscripcion ? { inscripcionId: p.inscripcion.id, folio: p.inscripcion.folio, pollitandaId: p.inscripcion.pollitandaId } : null,
    };
  }

  private nombreEstado(e: EstadoPedido): string {
    return { COTIZACION: 'en cotización', RECIBIDO: 'recibido', PREPARADO: 'preparado', EN_RUTA: 'en ruta', ENTREGADO: 'entregado', INCIDENCIA: 'con incidencia', CANCELADO: 'cancelado' }[e];
  }
}
