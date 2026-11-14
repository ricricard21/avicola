import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { Sesion } from '../common/seguridad';
import { BitacoraService } from '../common/servicios';
import { exigir, fechaLarga, hoy, paginar, pesos, r2, sumarDias, ZONA } from '../common/util';
import { Cliente, EstadoNotificacion, Notificacion, Pedido } from '../db/entities';

const EMPRESA = 'Avícola San Ángel';

/** Textos de los mensajes. Al contratar la API oficial se registran como plantillas aprobadas. */
const PLANTILLAS = {
  pedido_confirmado: (v: Vars) =>
    `Hola ${v.nombre}, confirmamos tu pedido ${v.folio} en ${EMPRESA} por ${v.total}.` +
    (v.fechaEntrega ? ` Entrega programada: ${v.fechaEntrega}.` : '') +
    ` ¡Gracias por tu compra!`,
  pollitanda_inscripcion: (v: Vars) =>
    `Hola ${v.nombre}, quedó registrada tu participación en la Pollitanda "${v.programa}": ${v.pollitos} aves por ${v.total}.` +
    ` Entrega: ${v.fechaEntrega}. Tu folio es ${v.folio}.`,
  pago_recibido: (v: Vars) =>
    `Hola ${v.nombre}, recibimos tu pago de ${v.monto} (recibo ${v.recibo}) del pedido ${v.folio}. ` +
    (Number(v.saldoNum) > 0 ? `Saldo pendiente: ${v.saldo}.` : `Tu pedido quedó liquidado.`) +
    ` Gracias. — ${EMPRESA}`,
  pedido_preparado: (v: Vars) => `Hola ${v.nombre}, tu pedido ${v.folio} ya está preparado. — ${EMPRESA}`,
  pedido_en_ruta: (v: Vars) => `Hola ${v.nombre}, tu pedido ${v.folio} va en camino. — ${EMPRESA}`,
  pedido_entregado: (v: Vars) =>
    `Hola ${v.nombre}, entregamos tu pedido ${v.folio}.` +
    (Number(v.saldoNum) > 0 ? ` Saldo pendiente: ${v.saldo}.` : '') +
    ` ¡Gracias por tu preferencia! — ${EMPRESA}`,
  recordatorio_cotizacion: (v: Vars) =>
    `Hola ${v.nombre}, te compartimos de nuevo tu cotización ${v.folio} por ${v.total}. ¿Te apoyamos para confirmar tu pedido? — ${EMPRESA}`,
  recordatorio_saldo: (v: Vars) =>
    `Hola ${v.nombre}, te recordamos que el pedido ${v.folio} tiene un saldo pendiente de ${v.saldo}` +
    (v.vencimiento ? ` con vencimiento el ${v.vencimiento}` : '') +
    `. — ${EMPRESA}`,
  recordatorio_anticipo: (v: Vars) =>
    `Hola ${v.nombre}, tu lugar en la Pollitanda "${v.programa}" (${v.folio}) está apartado. Para asegurarlo falta tu anticipo de ${v.anticipo}. — ${EMPRESA}`,
  recordatorio_entrega: (v: Vars) =>
    `Hola ${v.nombre}, la entrega de tu pedido ${v.folio} está programada para el ${v.fechaEntrega}.` +
    (Number(v.saldoNum) > 0 ? ` Saldo por liquidar: ${v.saldo}.` : '') +
    ` — ${EMPRESA}`,
  manual: (v: Vars) => String(v.mensaje),
} as const;

type Vars = Record<string, string | number | null | undefined>;
export type Plantilla = keyof typeof PLANTILLAS;

/** Contrato que debe cumplir cualquier proveedor de WhatsApp */
interface ProveedorWhatsapp {
  /** true = el mensaje sale automáticamente; false = queda en bandeja para envío manual */
  readonly automatico: boolean;
  enviar(telefono: string, mensaje: string): Promise<void>;
}

/** Sin API contratada: los mensajes se quedan en la bandeja y se envían con un clic desde el panel. */
class ProveedorSimulado implements ProveedorWhatsapp {
  readonly automatico = false;
  async enviar(): Promise<void> {}
}

/**
 * Punto de conexión para la API oficial de WhatsApp Business (pendiente de contratar).
 * Al activarla solo se implementa este método; el resto del sistema no cambia.
 */
class ProveedorOficial implements ProveedorWhatsapp {
  readonly automatico = true;
  async enviar(): Promise<void> {
    throw new Error('La API oficial de WhatsApp aún no está configurada');
  }
}

@Injectable()
export class NotificacionesService {
  private readonly log = new Logger('Notificaciones');
  private readonly proveedor: ProveedorWhatsapp =
    process.env.WHATSAPP_PROVEEDOR === 'oficial' ? new ProveedorOficial() : new ProveedorSimulado();

  constructor(
    private readonly ds: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  /**
   * Genera un mensaje para el cliente. Si el cliente no tiene teléfono, no se crea nada.
   * Acepta el EntityManager de una transacción para que el mensaje solo exista si la operación se confirma.
   */
  async crear(
    plantilla: Plantilla,
    cliente: Pick<Cliente, 'id' | 'nombre' | 'whatsapp' | 'telefono'>,
    vars: Vars,
    referencia: string | null,
    em?: EntityManager,
  ): Promise<Notificacion | null> {
    const destinatario = (cliente.whatsapp || cliente.telefono || '').replace(/\D/g, '');
    if (destinatario.length < 10) return null;
    const mensaje = PLANTILLAS[plantilla]({ ...vars, nombre: cliente.nombre });
    const repo = (em ?? this.ds.manager).getRepository(Notificacion);
    const n = await repo.save(repo.create({ clienteId: cliente.id, destinatario, plantilla, mensaje, referencia, estado: 'PENDIENTE' }));

    if (this.proveedor.automatico) {
      try {
        await this.proveedor.enviar(destinatario, mensaje);
        await repo.update(n.id, { estado: 'ENVIADA', enviadaAt: new Date() });
      } catch (e) {
        await repo.update(n.id, { estado: 'FALLIDA', error: String((e as Error).message).slice(0, 240) });
      }
    }
    return n;
  }

  async listar(q: { estado?: string; clienteId?: string; pagina?: string }) {
    const { pagina, porPagina, skip, take } = paginar(q.pagina, 60);
    const repo = this.ds.getRepository(Notificacion);
    const [datos, total] = await repo.findAndCount({
      where: {
        ...(q.estado ? { estado: q.estado as EstadoNotificacion } : {}),
        ...(q.clienteId ? { clienteId: Number(q.clienteId) } : {}),
      },
      relations: { cliente: true },
      order: { id: 'DESC' },
      skip,
      take,
    });
    const conteo: { estado: string; n: string }[] = await repo.query(
      `SELECT estado, COUNT(*) AS n FROM notificaciones GROUP BY estado`,
    );
    return {
      datos: datos.map((n) => ({ ...n, cliente: n.cliente ? { id: n.cliente.id, nombre: n.cliente.nombre } : null })),
      total,
      pagina,
      porPagina,
      conteo: Object.fromEntries(conteo.map((c) => [c.estado, Number(c.n)])),
      envioAutomatico: this.proveedor.automatico,
    };
  }

  async marcar(sesion: Sesion, id: number, estado: EstadoNotificacion) {
    const repo = this.ds.getRepository(Notificacion);
    const n = await repo.findOne({ where: { id } });
    if (!n) throw new NotFoundException('Mensaje no encontrado');
    exigir(['ENVIADA', 'DESCARTADA', 'PENDIENTE'].includes(estado), 'Estado no válido');
    await repo.update(id, { estado, enviadaAt: estado === 'ENVIADA' ? new Date() : null });
    await this.bitacora.registrar(sesion, `MENSAJE_${estado}`, 'notificacion', id, n.mensaje.slice(0, 120));
    return repo.findOne({ where: { id } });
  }

  async crearManual(sesion: Sesion, clienteId: number, mensaje: string) {
    const cliente = await this.ds.getRepository(Cliente).findOne({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const n = await this.crear('manual', cliente, { mensaje: mensaje.trim() }, null);
    exigir(n, 'El cliente no tiene un teléfono válido registrado');
    await this.bitacora.registrar(sesion, 'MENSAJE_MANUAL', 'notificacion', n.id, `Mensaje para ${cliente.nombre}`);
    return n;
  }

  /* ------------------- Recordatorios automáticos ------------------- */

  @Cron('0 9 * * *', { timeZone: ZONA })
  async tareaDiaria() {
    if (process.env.RECORDATORIOS_AUTOMATICOS === 'false') return;
    const r = await this.generarRecordatorios();
    this.log.log(`Recordatorios generados: ${JSON.stringify(r)}`);
  }

  /**
   * Revisa la operación y deja listos los recordatorios del día.
   * No repite el mismo recordatorio para el mismo folio en menos de 3 días.
   */
  async generarRecordatorios() {
    const pedidos = this.ds.getRepository(Pedido);
    const dia = hoy();
    const generados = { cotizaciones: 0, saldos: 0, anticipos: 0, entregas: 0 };

    // 1. Cotizaciones sin respuesta desde hace 3 días o más
    const cotizaciones = await pedidos
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.cliente', 'c')
      .where(`p.estado = 'COTIZACION'`)
      .andWhere(`p.createdAt < NOW() - INTERVAL '3 days'`)
      .andWhere(`p.createdAt > NOW() - INTERVAL '30 days'`)
      .getMany();
    for (const p of cotizaciones) {
      if (await this.reciente('recordatorio_cotizacion', p.folio, 3)) continue;
      if (await this.crear('recordatorio_cotizacion', p.cliente, { folio: p.folio, total: pesos(p.total) }, p.folio)) generados.cotizaciones++;
    }

    // 2. Pedidos con saldo vencido
    const vencidos = await pedidos
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.cliente', 'c')
      .leftJoinAndSelect('p.inscripcion', 'i')
      .where(`p.estado NOT IN ('COTIZACION','CANCELADO')`)
      .andWhere('p.total > p.pagado')
      .andWhere('p.fechaVencimiento < :dia', { dia })
      .getMany();
    for (const p of vencidos) {
      if (await this.reciente('recordatorio_saldo', p.folio, 3)) continue;
      const vars = { folio: p.folio, saldo: pesos(r2(p.total - p.pagado)), vencimiento: p.fechaVencimiento ? fechaLarga(p.fechaVencimiento) : null };
      if (await this.crear('recordatorio_saldo', p.cliente, vars, p.folio)) generados.saldos++;
    }

    // 3. Lugares de Pollitanda apartados hace 2 días o más y aún sin anticipo
    const sinAnticipo = await pedidos
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.cliente', 'c')
      .innerJoinAndSelect('p.inscripcion', 'i')
      .innerJoinAndSelect('i.pollitanda', 't')
      .where(`p.estado NOT IN ('COTIZACION','CANCELADO','ENTREGADO')`)
      .andWhere('p.pagado = 0')
      .andWhere(`p.createdAt < NOW() - INTERVAL '2 days'`)
      .getMany();
    for (const p of sinAnticipo) {
      if (await this.reciente('recordatorio_anticipo', p.folio, 3)) continue;
      const t = p.inscripcion!.pollitanda;
      const anticipo = t.anticipoMinimo > 0 ? r2(t.anticipoMinimo * p.inscripcion!.paquetes) : p.total;
      if (await this.crear('recordatorio_anticipo', p.cliente, { folio: p.inscripcion!.folio, programa: t.nombre, anticipo: pesos(anticipo) }, p.folio)) generados.anticipos++;
    }

    // 4. Entregas programadas dentro de los próximos 3 días (un solo aviso por pedido)
    const proximas = await pedidos
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.cliente', 'c')
      .where(`p.estado IN ('RECIBIDO','PREPARADO')`)
      .andWhere('p.fechaEntrega BETWEEN :dia AND :limite', { dia, limite: sumarDias(dia, 3) })
      .getMany();
    for (const p of proximas) {
      if (await this.reciente('recordatorio_entrega', p.folio, 3650)) continue;
      const saldo = r2(p.total - p.pagado);
      const vars = { folio: p.folio, fechaEntrega: fechaLarga(p.fechaEntrega!), saldo: pesos(saldo), saldoNum: saldo };
      if (await this.crear('recordatorio_entrega', p.cliente, vars, p.folio)) generados.entregas++;
    }

    return generados;
  }

  private async reciente(plantilla: Plantilla, referencia: string, dias: number): Promise<boolean> {
    const n = await this.ds
      .getRepository(Notificacion)
      .createQueryBuilder('n')
      .where('n.plantilla = :plantilla AND n.referencia = :referencia', { plantilla, referencia })
      .andWhere(`n.createdAt > NOW() - make_interval(days => CAST(:dias AS int))`, { dias })
      .getCount();
    return n > 0;
  }
}
