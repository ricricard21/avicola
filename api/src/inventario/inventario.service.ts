import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Sesion } from '../common/seguridad';
import { BitacoraService, FolioService } from '../common/servicios';
import { exigir, hoy, paginar, r2, sumarDias } from '../common/util';
import { Lote, Movimiento, PedidoItem, Producto, Reserva, Sucursal, TipoMovimiento } from '../db/entities';
import { AjusteDto, EntradaDto } from './inventario.dto';

type Autor = Pick<Sesion, 'id' | 'nombre'> | null;
/** Lo que el inventario necesita saber del pedido para apartarle mercancía */
type DatosReserva = { sucursalId: number; folio: string; fechaEntrega: string | null };

/**
 * Reglas del inventario:
 *   disponible = cantidad física − cantidad reservada
 * Un pedido confirmado RESERVA (no descuenta). La existencia física solo baja
 * cuando el pedido se entrega (SALIDA) o por un ajuste. Todo queda en `movimientos`.
 */
@Injectable()
export class InventarioService {
  constructor(
    private readonly ds: DataSource,
    private readonly folios: FolioService,
    private readonly bitacora: BitacoraService,
  ) {}

  /* ============================ Consultas ============================ */

  /** Existencias agrupadas por producto, con banderas de alerta */
  async existencias(sesion: Sesion, q: { categoria?: string; q?: string; sucursalId?: string } = {}) {
    const sucursalId = sesion.sucursalId ?? (q.sucursalId ? Number(q.sucursalId) : null);
    const dia = hoy();
    const params: unknown[] = [dia];
    let filtroSucursal = '';
    if (sucursalId) {
      params.push(sucursalId);
      filtroSucursal = `AND l."sucursalId" = $${params.length}`;
    }
    let filtro = '';
    if (q.categoria) {
      params.push(q.categoria);
      filtro += ` AND p.categoria = $${params.length}`;
    }
    if (q.q?.trim()) {
      params.push(`%${q.q.trim()}%`);
      filtro += ` AND (p.nombre ILIKE $${params.length} OR p.sku ILIKE $${params.length})`;
    }
    const filas: Record<string, string | null>[] = await this.ds.query(
      `SELECT p.id, p.sku, p.nombre, p.categoria, p.unidad, p.precio, p."stockMinimo", p."diasAlerta",
              COALESCE(SUM(l."cantidadFisica"), 0)                              AS fisica,
              COALESCE(SUM(l."cantidadReservada"), 0)                           AS reservada,
              COALESCE(SUM(l."cantidadFisica" * l."costoUnitario"), 0)          AS valor,
              COUNT(l.id) FILTER (WHERE l."cantidadFisica" > 0)                 AS lotes,
              MIN(l."fechaLimiteVenta") FILTER (WHERE l."cantidadFisica" > 0)   AS "proximaCaducidad",
              COALESCE(SUM(l."cantidadFisica" - l."cantidadReservada")
                       FILTER (WHERE l."fechaLimiteVenta" IS NULL OR l."fechaLimiteVenta" >= $1), 0) AS disponible
         FROM productos p
         LEFT JOIN lotes l ON l."productoId" = p.id ${filtroSucursal}
        WHERE p.activo = true ${filtro}
        GROUP BY p.id
        ORDER BY p.categoria, p.nombre`,
      params,
    );
    const faltantes = await this.faltantesPorProducto(sucursalId);
    return filas.map((f) => {
      const disponible = Number(f.disponible);
      const stockMinimo = Number(f.stockMinimo);
      const caducidad = f.proximaCaducidad ? String(f.proximaCaducidad).slice(0, 10) : null;
      return {
        id: Number(f.id),
        sku: f.sku,
        nombre: f.nombre,
        categoria: f.categoria,
        unidad: f.unidad,
        precio: Number(f.precio),
        stockMinimo,
        fisica: Number(f.fisica),
        reservada: Number(f.reservada),
        disponible,
        valor: r2(Number(f.valor)),
        lotes: Number(f.lotes),
        proximaCaducidad: caducidad,
        porSurtir: faltantes.get(Number(f.id)) ?? 0,
        bajoMinimo: stockMinimo > 0 && disponible <= stockMinimo,
        porCaducar: !!caducidad && caducidad <= sumarDias(dia, Number(f.diasAlerta)),
      };
    });
  }

  async lotes(sesion: Sesion, q: { productoId?: string; todos?: string }) {
    const qb = this.ds
      .getRepository(Lote)
      .createQueryBuilder('l')
      .innerJoinAndSelect('l.producto', 'p')
      .innerJoinAndSelect('l.sucursal', 's')
      .orderBy('l.fechaLimiteVenta', 'ASC', 'NULLS LAST')
      .addOrderBy('l.fechaIngreso', 'ASC')
      .addOrderBy('l.id', 'ASC');
    if (q.productoId) qb.andWhere('l.productoId = :p', { p: Number(q.productoId) });
    if (sesion.sucursalId) qb.andWhere('l.sucursalId = :s', { s: sesion.sucursalId });
    if (q.todos !== '1') qb.andWhere('l.cantidadFisica > 0');
    const dia = hoy();
    return (await qb.getMany()).map((l) => ({
      ...l,
      disponible: r2(l.cantidadFisica - l.cantidadReservada),
      caducado: !!l.fechaLimiteVenta && l.fechaLimiteVenta < dia,
      producto: { id: l.producto.id, nombre: l.producto.nombre, sku: l.producto.sku, unidad: l.producto.unidad, diasAlerta: l.producto.diasAlerta },
      sucursal: { id: l.sucursal.id, nombre: l.sucursal.nombre },
    }));
  }

  async movimientos(sesion: Sesion, q: { productoId?: string; loteId?: string; tipo?: string; pagina?: string }) {
    const { pagina, porPagina, skip, take } = paginar(q.pagina, 60);
    const qb = this.ds
      .getRepository(Movimiento)
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.lote', 'l')
      .innerJoinAndSelect('l.producto', 'p')
      .orderBy('m.id', 'DESC')
      .skip(skip)
      .take(take);
    if (q.productoId) qb.andWhere('m.productoId = :p', { p: Number(q.productoId) });
    if (q.loteId) qb.andWhere('m.loteId = :l', { l: Number(q.loteId) });
    if (q.tipo) qb.andWhere('m.tipo = :t', { t: q.tipo });
    if (sesion.sucursalId) qb.andWhere('l.sucursalId = :s', { s: sesion.sucursalId });
    const [filas, total] = await qb.getManyAndCount();
    return {
      datos: filas.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        cantidad: m.cantidad,
        saldoFisico: m.saldoFisico,
        saldoReservado: m.saldoReservado,
        referencia: m.referencia,
        motivo: m.motivo,
        usuarioNombre: m.usuarioNombre,
        createdAt: m.createdAt,
        lote: { id: m.lote.id, codigo: m.lote.codigo },
        producto: { id: m.lote.producto.id, nombre: m.lote.producto.nombre, unidad: m.lote.producto.unidad },
      })),
      total,
      pagina,
      porPagina,
    };
  }

  /** Cantidad vendida que aún no tiene inventario apartado (ventas en preventa) */
  private async faltantesPorProducto(sucursalId: number | null): Promise<Map<number, number>> {
    const params: unknown[] = [];
    let filtro = '';
    if (sucursalId) {
      params.push(sucursalId);
      filtro = `AND pe."sucursalId" = $1`;
    }
    const filas: { productoId: number; faltante: string }[] = await this.ds.query(
      `SELECT i."productoId", SUM(i.cantidad - i."cantidadReservada") AS faltante
         FROM pedido_items i
         JOIN pedidos pe ON pe.id = i."pedidoId"
        WHERE pe.estado IN ('RECIBIDO','PREPARADO','EN_RUTA','INCIDENCIA')
          AND i.cantidad > i."cantidadReservada" ${filtro}
        GROUP BY i."productoId"`,
      params,
    );
    return new Map(filas.map((f) => [Number(f.productoId), Number(f.faltante)]));
  }

  /* ============================ Operaciones ============================ */

  /** Entrada de mercancía: crea un lote nuevo y, si hay ventas en preventa esperando, las surte */
  async entrada(sesion: Sesion, dto: EntradaDto) {
    const sucursalId = sesion.sucursalId ?? dto.sucursalId;
    exigir(sucursalId, 'Indica la sucursal que recibe la mercancía');
    return this.ds.transaction(async (em) => {
      const producto = await em.getRepository(Producto).findOne({ where: { id: dto.productoId } });
      if (!producto || !producto.activo) throw new NotFoundException('Producto no encontrado');
      exigir(await em.getRepository(Sucursal).findOne({ where: { id: sucursalId } }), 'La sucursal no existe');
      const fechaIngreso = dto.fechaIngreso ?? hoy();
      exigir(!dto.fechaLimiteVenta || dto.fechaLimiteVenta >= fechaIngreso, 'La fecha límite de venta no puede ser anterior al ingreso');

      const lote = await em.getRepository(Lote).save(
        em.getRepository(Lote).create({
          codigo: dto.codigo?.trim() || (await this.folios.siguiente(em, 'LOT')),
          productoId: producto.id,
          sucursalId,
          ubicacion: dto.ubicacion?.trim() || null,
          cantidadFisica: r2(dto.cantidad),
          cantidadReservada: 0,
          costoUnitario: r2(dto.costoUnitario ?? 0),
          fechaIngreso,
          fechaLimiteVenta: dto.fechaLimiteVenta ?? null,
          notas: dto.notas?.trim() || null,
        }),
      );
      await this.mover(em, lote, 'ENTRADA', r2(dto.cantidad), sesion, lote.codigo, dto.notas ?? 'Entrada de lote');
      const surtidos = await this.surtirPreventas(em, producto.id, sucursalId, sesion);
      await this.bitacora.registrar(sesion, 'ENTRADA', 'lote', lote.id, `${lote.codigo}: +${dto.cantidad} ${producto.unidad} de ${producto.nombre}`, undefined, em);
      return { lote: await em.getRepository(Lote).findOne({ where: { id: lote.id } }), pedidosSurtidos: surtidos };
    });
  }

  /** Ajuste por conteo físico, merma o mortalidad. Se captura la cantidad real contada. */
  async ajuste(sesion: Sesion, loteId: number, dto: AjusteDto) {
    return this.ds.transaction(async (em) => {
      const lote = await this.bloquearLote(em, loteId);
      if (sesion.sucursalId && lote.sucursalId !== sesion.sucursalId) throw new NotFoundException('Lote no encontrado');
      const nueva = r2(dto.cantidadFisica);
      if (nueva < lote.cantidadReservada) {
        throw new ConflictException(
          `Este lote tiene ${lote.cantidadReservada} unidades apartadas en pedidos. Libera o reasigna esas reservas antes de bajar la existencia.`,
        );
      }
      const delta = r2(nueva - lote.cantidadFisica);
      exigir(delta !== 0, 'La cantidad capturada es igual a la existencia actual');
      lote.cantidadFisica = nueva;
      await em.getRepository(Lote).update(lote.id, { cantidadFisica: nueva });
      await this.mover(em, lote, 'AJUSTE', delta, sesion, lote.codigo, dto.motivo.trim());
      const surtidos = delta > 0 ? await this.surtirPreventas(em, lote.productoId, lote.sucursalId, sesion) : [];
      await this.bitacora.registrar(sesion, 'AJUSTE', 'lote', lote.id, `${lote.codigo}: ${delta > 0 ? '+' : ''}${delta} (${dto.motivo})`, undefined, em);
      return { lote: await em.getRepository(Lote).findOne({ where: { id: lote.id } }), pedidosSurtidos: surtidos };
    });
  }

  /* =================== Reservas (usadas por Pedidos) =================== */

  /**
   * Aparta inventario para un renglón de pedido. Toma primero los lotes que
   * vencen antes y descarta los que ya no estarán vigentes el día de la entrega.
   * Devuelve la cantidad que NO pudo apartarse.
   */
  async reservarItem(em: EntityManager, item: PedidoItem, pedido: DatosReserva, autor: Autor): Promise<number> {
    let restante = r2(item.cantidad - item.cantidadReservada);
    if (restante <= 0) return 0;
    const { sucursalId, folio } = pedido;
    // Solo sirven los lotes que sigan vigentes el día de la entrega.
    const dia = hoy();
    const vigenteAl = pedido.fechaEntrega && pedido.fechaEntrega > dia ? pedido.fechaEntrega : dia;

    // FOR UPDATE: dos vendedores no pueden apartar las mismas unidades al mismo tiempo.
    const lotes = await em
      .getRepository(Lote)
      .createQueryBuilder('l')
      .setLock('pessimistic_write')
      .where('l.productoId = :p AND l.sucursalId = :s', { p: item.productoId, s: sucursalId })
      .andWhere('l.cantidadFisica > l.cantidadReservada')
      .andWhere('(l.fechaLimiteVenta IS NULL OR l.fechaLimiteVenta >= :vigenteAl)', { vigenteAl })
      .orderBy('l.fechaLimiteVenta', 'ASC', 'NULLS LAST')
      .addOrderBy('l.fechaIngreso', 'ASC')
      .addOrderBy('l.id', 'ASC')
      .getMany();

    const reservas = em.getRepository(Reserva);
    for (const lote of lotes) {
      if (restante <= 0) break;
      const toma = Math.min(r2(lote.cantidadFisica - lote.cantidadReservada), restante);
      if (toma <= 0) continue;
      lote.cantidadReservada = r2(lote.cantidadReservada + toma);
      await em.getRepository(Lote).update(lote.id, { cantidadReservada: lote.cantidadReservada });

      const previa = await reservas.findOne({ where: { pedidoItemId: item.id, loteId: lote.id, surtida: false } });
      if (previa) await reservas.update(previa.id, { cantidad: r2(previa.cantidad + toma) });
      else await reservas.insert({ pedidoItemId: item.id, loteId: lote.id, cantidad: toma, surtida: false });

      await this.mover(em, lote, 'RESERVA', toma, autor, folio, 'Apartado para pedido');
      restante = r2(restante - toma);
    }
    item.cantidadReservada = r2(item.cantidad - restante);
    await em.getRepository(PedidoItem).update(item.id, { cantidadReservada: item.cantidadReservada });
    return restante;
  }

  /** Devuelve al disponible lo apartado por un renglón (cancelaciones) */
  async liberarItem(em: EntityManager, item: PedidoItem, folio: string, autor: Autor): Promise<void> {
    const reservas = await em.getRepository(Reserva).find({ where: { pedidoItemId: item.id, surtida: false } });
    for (const r of reservas) {
      const lote = await this.bloquearLote(em, r.loteId);
      lote.cantidadReservada = r2(Math.max(0, lote.cantidadReservada - r.cantidad));
      await em.getRepository(Lote).update(lote.id, { cantidadReservada: lote.cantidadReservada });
      await this.mover(em, lote, 'LIBERACION', -r.cantidad, autor, folio, 'Reserva liberada');
      await em.getRepository(Reserva).delete(r.id);
    }
    await em.getRepository(PedidoItem).update(item.id, { cantidadReservada: 0 });
    item.cantidadReservada = 0;
  }

  /** Salida efectiva del almacén al entregar el pedido */
  async surtirItem(em: EntityManager, item: PedidoItem, folio: string, autor: Autor): Promise<void> {
    const reservas = await em.getRepository(Reserva).find({ where: { pedidoItemId: item.id, surtida: false } });
    for (const r of reservas) {
      const lote = await this.bloquearLote(em, r.loteId);
      lote.cantidadFisica = r2(lote.cantidadFisica - r.cantidad);
      lote.cantidadReservada = r2(Math.max(0, lote.cantidadReservada - r.cantidad));
      if (lote.cantidadFisica < 0) throw new ConflictException(`El lote ${lote.codigo} no tiene existencia suficiente para surtir ${folio}`);
      await em.getRepository(Lote).update(lote.id, { cantidadFisica: lote.cantidadFisica, cantidadReservada: lote.cantidadReservada });
      await this.mover(em, lote, 'SALIDA', -r.cantidad, autor, folio, 'Entrega de pedido');
      await em.getRepository(Reserva).update(r.id, { surtida: true });
    }
  }

  /**
   * Cuando entra mercancía, aparta inventario para los pedidos en preventa
   * que estaban esperando, del más antiguo al más reciente.
   */
  async surtirPreventas(em: EntityManager, productoId: number, sucursalId: number, autor: Autor): Promise<string[]> {
    const pendientes = await em
      .getRepository(PedidoItem)
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.pedido', 'pe')
      .where('i.productoId = :p AND pe.sucursalId = :s', { p: productoId, s: sucursalId })
      .andWhere(`pe.estado IN ('RECIBIDO','PREPARADO','EN_RUTA','INCIDENCIA')`)
      .andWhere('i.cantidad > i.cantidadReservada')
      .orderBy('pe.confirmadoAt', 'ASC')
      .addOrderBy('i.id', 'ASC')
      .getMany();
    const folios: string[] = [];
    for (const item of pendientes) {
      const antes = item.cantidadReservada;
      const faltante = await this.reservarItem(em, item, item.pedido, autor);
      if (item.cantidadReservada > antes) folios.push(item.pedido.folio);
      // No se corta el ciclo: un pedido con entrega lejana puede quedarse esperando
      // mientras otro más reciente sí alcanza a surtirse con el lote que entró.
      void faltante;
    }
    return [...new Set(folios)];
  }

  /* ============================ Internos ============================ */

  private async bloquearLote(em: EntityManager, id: number): Promise<Lote> {
    const lote = await em.getRepository(Lote).createQueryBuilder('l').setLock('pessimistic_write').where('l.id = :id', { id }).getOne();
    if (!lote) throw new NotFoundException('Lote no encontrado');
    return lote;
  }

  private async mover(em: EntityManager, lote: Lote, tipo: TipoMovimiento, cantidad: number, autor: Autor, referencia: string | null, motivo: string | null) {
    await em.getRepository(Movimiento).insert({
      loteId: lote.id,
      productoId: lote.productoId,
      tipo,
      cantidad: r2(cantidad),
      saldoFisico: lote.cantidadFisica,
      saldoReservado: lote.cantidadReservada,
      referencia,
      motivo: motivo?.slice(0, 240) ?? null,
      usuarioId: autor?.id ?? null,
      usuarioNombre: autor?.nombre ?? 'Sistema',
    });
  }
}
