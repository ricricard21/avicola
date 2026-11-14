import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Sesion } from '../common/seguridad';
import { BitacoraService, FolioService } from '../common/servicios';
import { diasEntre, exigir, fechaLocal, hoy, paginar, pesos, primerDiaDelMes, r2, ZONA } from '../common/util';
import { Pago, Pedido } from '../db/entities';
import { PagoDto } from './pagos.dto';

@Injectable()
export class PagosService {
  constructor(
    private readonly ds: DataSource,
    private readonly folios: FolioService,
    private readonly bitacora: BitacoraService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /* ============================ Operaciones ============================ */

  registrar(sesion: Sesion, dto: PagoDto) {
    return this.ds.transaction((em) => this.registrarEn(em, sesion, dto));
  }

  /** Registra un pago dentro de una transacción ya abierta (lo usa también Pollitandas) */
  async registrarEn(em: EntityManager, sesion: Sesion, dto: PagoDto) {
    // Se bloquea el pedido para que dos cajeros no cobren el mismo saldo a la vez.
    const pedido = await em.getRepository(Pedido).createQueryBuilder('p').setLock('pessimistic_write').where('p.id = :id', { id: dto.pedidoId }).getOne();
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    if (sesion.sucursalId && pedido.sucursalId !== sesion.sucursalId) throw new NotFoundException('Pedido no encontrado');
    exigir(pedido.estado !== 'COTIZACION', 'Confirma la cotización antes de registrar pagos');
    exigir(pedido.estado !== 'CANCELADO', 'El pedido está cancelado');

    const monto = r2(dto.monto);
    const saldo = r2(pedido.total - pedido.pagado);
    if (monto > saldo) throw new ConflictException(`El pago (${pesos(monto)}) es mayor al saldo pendiente (${pesos(saldo)})`);

    const repo = em.getRepository(Pago);
    const pago = await repo.save(
      repo.create({
        folio: await this.folios.siguiente(em, 'REC'),
        clienteId: pedido.clienteId,
        pedidoId: pedido.id,
        monto,
        metodo: dto.metodo,
        referencia: dto.referencia?.trim() || null,
        fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
        notas: dto.notas?.trim() || null,
        usuarioId: sesion.id,
        usuarioNombre: sesion.nombre,
      }),
    );
    const pagado = r2(pedido.pagado + monto);
    await em.getRepository(Pedido).update(pedido.id, { pagado });
    const nuevoSaldo = r2(pedido.total - pagado);

    await this.bitacora.registrar(sesion, 'PAGO', 'pedido', pedido.id, `${pago.folio}: ${pesos(monto)} a ${pedido.folio} · saldo ${pesos(nuevoSaldo)}`, undefined, em);
    const cliente = await em.getRepository(Pedido).findOne({ where: { id: pedido.id }, relations: { cliente: true } });
    await this.notificaciones.crear(
      'pago_recibido',
      cliente!.cliente,
      { monto: pesos(monto), recibo: pago.folio, folio: pedido.folio, saldo: pesos(nuevoSaldo), saldoNum: nuevoSaldo },
      pago.folio,
      em,
    );
    return { ...pago, saldoPedido: nuevoSaldo };
  }

  /** Un pago nunca se borra: se cancela con motivo y el saldo regresa al pedido */
  async cancelar(sesion: Sesion, id: number, motivo: string) {
    return this.ds.transaction(async (em) => {
      const pago = await em.getRepository(Pago).findOne({ where: { id } });
      if (!pago) throw new NotFoundException('Pago no encontrado');
      exigir(!pago.cancelado, 'Este pago ya estaba cancelado');
      const pedido = await em.getRepository(Pedido).createQueryBuilder('p').setLock('pessimistic_write').where('p.id = :id', { id: pago.pedidoId }).getOne();
      await em.getRepository(Pago).update(id, { cancelado: true, motivoCancelacion: motivo.trim() });
      await em.getRepository(Pedido).update(pedido!.id, { pagado: r2(Math.max(0, pedido!.pagado - pago.monto)) });
      await this.bitacora.registrar(sesion, 'CANCELAR_PAGO', 'pedido', pedido!.id, `${pago.folio} (${pesos(pago.monto)}): ${motivo}`, undefined, em);
      return { ok: true };
    });
  }

  /* ============================ Consultas ============================ */

  async listar(sesion: Sesion, q: { desde?: string; hasta?: string; clienteId?: string; pedidoId?: string; metodo?: string; pagina?: string }) {
    const { pagina, porPagina, skip, take } = paginar(q.pagina, 60);
    const qb = this.ds
      .getRepository(Pago)
      .createQueryBuilder('g')
      .innerJoinAndSelect('g.cliente', 'c')
      .innerJoinAndSelect('g.pedido', 'p')
      .orderBy('g.fecha', 'DESC')
      .addOrderBy('g.id', 'DESC')
      .skip(skip)
      .take(take);
    if (q.desde) qb.andWhere(`(g.fecha AT TIME ZONE '${ZONA}')::date >= :desde`, { desde: q.desde });
    if (q.hasta) qb.andWhere(`(g.fecha AT TIME ZONE '${ZONA}')::date <= :hasta`, { hasta: q.hasta });
    if (q.clienteId) qb.andWhere('g.clienteId = :c', { c: Number(q.clienteId) });
    if (q.pedidoId) qb.andWhere('g.pedidoId = :p', { p: Number(q.pedidoId) });
    if (q.metodo) qb.andWhere('g.metodo = :m', { m: q.metodo });
    if (sesion.sucursalId) qb.andWhere('p.sucursalId = :s', { s: sesion.sucursalId });
    const [filas, total] = await qb.getManyAndCount();
    return {
      datos: filas.map((g) => ({
        id: g.id,
        folio: g.folio,
        monto: g.monto,
        metodo: g.metodo,
        referencia: g.referencia,
        fecha: g.fecha,
        cancelado: g.cancelado,
        motivoCancelacion: g.motivoCancelacion,
        usuarioNombre: g.usuarioNombre,
        cliente: { id: g.cliente.id, nombre: g.cliente.nombre },
        pedido: { id: g.pedido.id, folio: g.pedido.folio },
      })),
      total,
      pagina,
      porPagina,
    };
  }

  /** Datos del comprobante interno de pago */
  async recibo(id: number) {
    const pago = await this.ds.getRepository(Pago).findOne({
      where: { id },
      relations: { cliente: true, pedido: { inscripcion: { pollitanda: true }, sucursal: true } },
    });
    if (!pago) throw new NotFoundException('Pago no encontrado');
    const { pedido, cliente } = pago;
    // Saldo después de este pago: total menos todo lo pagado hasta este recibo inclusive.
    const [fila]: { acumulado: string }[] = await this.ds.query(
      `SELECT COALESCE(SUM(monto), 0) AS acumulado FROM pagos WHERE "pedidoId" = $1 AND cancelado = false AND id <= $2`,
      [pedido.id, pago.id],
    );
    return {
      id: pago.id,
      folio: pago.folio,
      fecha: pago.fecha,
      monto: pago.monto,
      metodo: pago.metodo,
      referencia: pago.referencia,
      notas: pago.notas,
      cancelado: pago.cancelado,
      motivoCancelacion: pago.motivoCancelacion,
      recibio: pago.usuarioNombre,
      cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.whatsapp || cliente.telefono, direccion: cliente.direccion },
      pedido: { id: pedido.id, folio: pedido.folio, total: pedido.total, sucursal: pedido.sucursal.nombre },
      pollitanda: pedido.inscripcion ? { folio: pedido.inscripcion.folio, programa: pedido.inscripcion.pollitanda.nombre } : null,
      acumulado: r2(Number(fila.acumulado)),
      saldoDespues: r2(pedido.total - Number(fila.acumulado)),
    };
  }

  /** Cuentas por cobrar con antigüedad */
  async porCobrar(sesion: Sesion, q: { q?: string } = {}) {
    const qb = this.ds
      .getRepository(Pedido)
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.cliente', 'c')
      .leftJoinAndSelect('p.inscripcion', 'i')
      .where(`p.estado NOT IN ('COTIZACION','CANCELADO')`)
      .andWhere('p.total > p.pagado')
      .orderBy('p.fechaVencimiento', 'ASC', 'NULLS LAST')
      .addOrderBy('p.id', 'ASC');
    if (sesion.sucursalId) qb.andWhere('p.sucursalId = :s', { s: sesion.sucursalId });
    if (q.q?.trim()) qb.andWhere('(c.nombre ILIKE :t OR p.folio ILIKE :t)', { t: `%${q.q.trim()}%` });
    const dia = hoy();
    const cuentas = (await qb.getMany()).map((p) => {
      const diasVencido = p.fechaVencimiento ? Math.max(0, diasEntre(p.fechaVencimiento, dia)) : 0;
      return {
        id: p.id,
        folio: p.folio,
        estado: p.estado,
        esPollitanda: !!p.inscripcion,
        cliente: { id: p.cliente.id, nombre: p.cliente.nombre, telefono: p.cliente.whatsapp || p.cliente.telefono },
        total: p.total,
        pagado: p.pagado,
        saldo: r2(p.total - p.pagado),
        fechaEntrega: p.fechaEntrega,
        fechaVencimiento: p.fechaVencimiento,
        diasVencido,
      };
    });
    const suma = (f: (d: number) => boolean) => r2(cuentas.filter((c) => f(c.diasVencido)).reduce((s, c) => s + c.saldo, 0));
    return {
      cuentas,
      antiguedad: {
        alCorriente: suma((d) => d === 0),
        de1a7: suma((d) => d >= 1 && d <= 7),
        de8a30: suma((d) => d >= 8 && d <= 30),
        masDe30: suma((d) => d > 30),
      },
      total: r2(cuentas.reduce((s, c) => s + c.saldo, 0)),
      vencido: suma((d) => d > 0),
    };
  }

  /** Cobrado hoy y en el mes, por método de pago */
  async resumen(sesion: Sesion) {
    const dia = hoy();
    const params: unknown[] = [primerDiaDelMes(dia), dia];
    let filtro = '';
    if (sesion.sucursalId) {
      params.push(sesion.sucursalId);
      filtro = `AND p."sucursalId" = $3`;
    }
    const filas: { metodo: string; mes: string; hoy: string; n: string }[] = await this.ds.query(
      `SELECT g.metodo,
              SUM(g.monto) AS mes,
              COALESCE(SUM(g.monto) FILTER (WHERE (g.fecha AT TIME ZONE '${ZONA}')::date = $2), 0) AS hoy,
              COUNT(*) AS n
         FROM pagos g JOIN pedidos p ON p.id = g."pedidoId"
        WHERE g.cancelado = false AND (g.fecha AT TIME ZONE '${ZONA}')::date >= $1 ${filtro}
        GROUP BY g.metodo ORDER BY mes DESC`,
      params,
    );
    return {
      cobradoHoy: r2(filas.reduce((s, f) => s + Number(f.hoy), 0)),
      cobradoMes: r2(filas.reduce((s, f) => s + Number(f.mes), 0)),
      pagosMes: filas.reduce((s, f) => s + Number(f.n), 0),
      porMetodo: filas.map((f) => ({ metodo: f.metodo, monto: r2(Number(f.mes)), pagos: Number(f.n) })),
      fecha: fechaLocal(new Date()),
    };
  }
}
