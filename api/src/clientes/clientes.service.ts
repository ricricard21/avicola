import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { Sesion } from '../common/seguridad';
import { BitacoraService } from '../common/servicios';
import { hoy, paginar, r2 } from '../common/util';
import { Cliente, Inscripcion, Pago, Pedido, Seguimiento } from '../db/entities';
import { ClienteDto, SeguimientoDto } from './clientes.dto';

@Injectable()
export class ClientesService {
  constructor(
    private readonly ds: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  private get repo() {
    return this.ds.getRepository(Cliente);
  }

  async listar(q: { q?: string; tipo?: string; etapa?: string; conSaldo?: string; pagina?: string; porPagina?: string }) {
    const { pagina, porPagina, skip, take } = paginar(q.pagina, q.porPagina);
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoin('c.vendedor', 'v')
      .addSelect(['v.id', 'v.nombre'])
      // Saldo y total comprado en pedidos confirmados
      .addSelect(
        (sq) =>
          sq
            .select('COALESCE(SUM(p.total - p.pagado), 0)')
            .from(Pedido, 'p')
            .where('p.clienteId = c.id')
            .andWhere(`p.estado NOT IN ('COTIZACION','CANCELADO')`),
        'saldo',
      )
      .addSelect(
        (sq) =>
          sq.select('COALESCE(SUM(p.total), 0)').from(Pedido, 'p').where('p.clienteId = c.id').andWhere(`p.estado NOT IN ('COTIZACION','CANCELADO')`),
        'comprado',
      )
      .where('c.activo = true')
      .orderBy('c.nombre', 'ASC');

    if (q.tipo) qb.andWhere('c.tipo = :tipo', { tipo: q.tipo });
    if (q.etapa) qb.andWhere('c.etapa = :etapa', { etapa: q.etapa });
    if (q.q?.trim()) {
      const texto = `%${q.q.trim()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b.where('c.nombre ILIKE :texto', { texto }).orWhere('c.telefono ILIKE :texto').orWhere('c.whatsapp ILIKE :texto').orWhere('c.municipio ILIKE :texto'),
        ),
      );
    }
    if (q.conSaldo === '1') {
      qb.andWhere(`EXISTS (SELECT 1 FROM pedidos p WHERE p."clienteId" = c.id AND p.estado NOT IN ('COTIZACION','CANCELADO') AND p.total > p.pagado)`);
    }

    const total = await qb.getCount();
    const { entities, raw } = await qb.offset(skip).limit(take).getRawAndEntities();
    return {
      datos: entities.map((c, i) => ({ ...c, saldo: r2(Number(raw[i].saldo)), comprado: r2(Number(raw[i].comprado)) })),
      total,
      pagina,
      porPagina,
    };
  }

  /** Expediente completo del cliente: datos, compras, pagos, Pollitandas y seguimiento */
  async detalle(id: number) {
    const cliente = await this.repo.findOne({ where: { id }, relations: { vendedor: true } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const [pedidos, pagos, seguimientos, inscripciones] = await Promise.all([
      this.ds.getRepository(Pedido).find({ where: { clienteId: id }, order: { id: 'DESC' }, take: 100 }),
      this.ds.getRepository(Pago).find({ where: { clienteId: id }, relations: { pedido: true }, order: { fecha: 'DESC' }, take: 100 }),
      this.ds.getRepository(Seguimiento).find({ where: { clienteId: id }, relations: { usuario: true }, order: { id: 'DESC' }, take: 100 }),
      this.ds.getRepository(Inscripcion).find({ where: { clienteId: id }, relations: { pollitanda: true, pedido: true }, order: { id: 'DESC' } }),
    ]);
    const vigentes = pedidos.filter((p) => p.estado !== 'COTIZACION' && p.estado !== 'CANCELADO');
    return {
      ...cliente,
      vendedor: cliente.vendedor ? { id: cliente.vendedor.id, nombre: cliente.vendedor.nombre } : null,
      resumen: {
        comprado: r2(vigentes.reduce((s, p) => s + p.total, 0)),
        pagado: r2(vigentes.reduce((s, p) => s + p.pagado, 0)),
        saldo: r2(vigentes.reduce((s, p) => s + (p.total - p.pagado), 0)),
        pedidos: vigentes.length,
        ultimaCompra: vigentes[0]?.confirmadoAt ?? null,
      },
      pedidos: pedidos.map((p) => ({
        id: p.id,
        folio: p.folio,
        estado: p.estado,
        total: p.total,
        pagado: p.pagado,
        saldo: r2(p.total - p.pagado),
        fechaEntrega: p.fechaEntrega,
        createdAt: p.createdAt,
      })),
      pagos: pagos.map((p) => ({
        id: p.id,
        folio: p.folio,
        monto: p.monto,
        metodo: p.metodo,
        fecha: p.fecha,
        cancelado: p.cancelado,
        pedido: { id: p.pedido.id, folio: p.pedido.folio },
      })),
      seguimientos: seguimientos.map((s) => ({ ...s, usuario: s.usuario ? { id: s.usuario.id, nombre: s.usuario.nombre } : null })),
      pollitandas: inscripciones.map((i) => ({
        id: i.id,
        folio: i.folio,
        programa: i.pollitanda.nombre,
        pollitandaId: i.pollitandaId,
        paquetes: i.paquetes,
        cantidadPollitos: i.cantidadPollitos,
        total: i.pedido.total,
        pagado: i.pedido.pagado,
        saldo: r2(i.pedido.total - i.pedido.pagado),
        fechaEntrega: i.pedido.fechaEntrega,
        estadoPedido: i.pedido.estado,
        pedidoId: i.pedidoId,
      })),
    };
  }

  async crear(sesion: Sesion, dto: ClienteDto) {
    await this.validarDuplicado(dto);
    const tipo = dto.tipo ?? 'PROSPECTO';
    const c = await this.repo.save(
      this.repo.create({
        ...this.limpiar(dto),
        tipo,
        etapa: tipo === 'PROSPECTO' ? (dto.etapa ?? 'NUEVO') : null,
        vendedorId: dto.vendedorId ?? sesion.id,
      }),
    );
    await this.bitacora.registrar(sesion, 'CREAR', 'cliente', c.id, `Alta de ${c.nombre} (${c.tipo})`);
    return c;
  }

  async editar(sesion: Sesion, id: number, dto: ClienteDto) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    await this.validarDuplicado(dto, id);
    const tipo = dto.tipo ?? c.tipo;
    await this.repo.update(id, {
      ...this.limpiar(dto),
      tipo,
      etapa: tipo === 'PROSPECTO' ? (dto.etapa ?? c.etapa ?? 'NUEVO') : null,
      ...(dto.vendedorId !== undefined ? { vendedorId: dto.vendedorId } : {}),
      ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
    });
    await this.bitacora.registrar(sesion, 'EDITAR', 'cliente', id, `Cambios en ${dto.nombre}`);
    return this.repo.findOne({ where: { id } });
  }

  /* --------------------------- Seguimiento --------------------------- */

  async agregarSeguimiento(sesion: Sesion, clienteId: number, dto: SeguimientoDto) {
    const c = await this.repo.findOne({ where: { id: clienteId } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    const repo = this.ds.getRepository(Seguimiento);
    const s = await repo.save(
      repo.create({ clienteId, usuarioId: sesion.id, tipo: dto.tipo ?? 'NOTA', nota: dto.nota.trim(), proximaAccion: dto.proximaAccion ?? null }),
    );
    // Un prospecto recién contactado avanza de etapa por sí solo.
    if (c.tipo === 'PROSPECTO' && c.etapa === 'NUEVO' && s.tipo !== 'NOTA') await this.repo.update(clienteId, { etapa: 'CONTACTADO' });
    return s;
  }

  async completarSeguimiento(id: number, completado: boolean) {
    const repo = this.ds.getRepository(Seguimiento);
    if (!(await repo.findOne({ where: { id } }))) throw new NotFoundException('Seguimiento no encontrado');
    await repo.update(id, { completado });
    return repo.findOne({ where: { id } });
  }

  /** Contactos comprometidos para hoy o atrasados */
  async seguimientosPendientes(sesion: Sesion, soloMios: boolean) {
    const qb = this.ds
      .getRepository(Seguimiento)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.cliente', 'c')
      .where('s.completado = false AND s.proximaAccion IS NOT NULL AND s.proximaAccion <= :hoy', { hoy: hoy() })
      .orderBy('s.proximaAccion', 'ASC')
      .take(50);
    if (soloMios) qb.andWhere('s.usuarioId = :u', { u: sesion.id });
    return (await qb.getMany()).map((s) => ({
      id: s.id,
      tipo: s.tipo,
      nota: s.nota,
      proximaAccion: s.proximaAccion,
      cliente: { id: s.cliente.id, nombre: s.cliente.nombre, telefono: s.cliente.whatsapp || s.cliente.telefono },
    }));
  }

  /* ----------------------------- Internos ---------------------------- */

  private limpiar(dto: ClienteDto) {
    const t = (v?: string | null) => v?.trim() || null;
    return {
      nombre: dto.nombre.trim(),
      telefono: t(dto.telefono),
      whatsapp: t(dto.whatsapp),
      email: t(dto.email)?.toLowerCase() ?? null,
      direccion: t(dto.direccion),
      municipio: t(dto.municipio),
      rfc: t(dto.rfc)?.toUpperCase() ?? null,
      origen: t(dto.origen),
      notas: t(dto.notas),
    };
  }

  /** Evita capturar dos veces al mismo cliente (mismo teléfono) */
  private async validarDuplicado(dto: ClienteDto, idActual?: number) {
    const digitos = [dto.telefono, dto.whatsapp].map((v) => (v ?? '').replace(/\D/g, '')).filter((v) => v.length >= 10);
    if (!digitos.length) return;
    const qb = this.repo
      .createQueryBuilder('c')
      .where(`(regexp_replace(COALESCE(c.telefono, ''), '\\D', '', 'g') IN (:...d) OR regexp_replace(COALESCE(c.whatsapp, ''), '\\D', '', 'g') IN (:...d))`, { d: digitos });
    if (idActual) qb.andWhere('c.id <> :id', { id: idActual });
    const otro = await qb.getOne();
    if (otro) throw new ConflictException(`Ya existe un cliente con ese teléfono: ${otro.nombre}`);
  }
}
