import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ClientesModule } from '../clientes/clientes.controller';
import { ClientesService } from '../clientes/clientes.service';
import { Requiere, Sesion, tiene, Yo } from '../common/seguridad';
import { exigir, fechaLarga, hoy, pesos, primerDiaDelMes, r2, sumarDias, ZONA } from '../common/util';
import { InventarioModule } from '../inventario/inventario.controller';
import { InventarioService } from '../inventario/inventario.service';

interface Alerta {
  tipo: 'inventario' | 'caducidad' | 'preventa' | 'cotizacion' | 'cobranza' | 'anticipo' | 'incidencia';
  nivel: 'alta' | 'media';
  titulo: string;
  detalle: string;
  enlace: string;
}

const FECHA = (col: string) => `(${col} AT TIME ZONE '${ZONA}')::date`;

@Injectable()
export class DashboardService {
  constructor(
    private readonly ds: DataSource,
    private readonly inventario: InventarioService,
    private readonly clientes: ClientesService,
  ) {}

  /** Todo lo que muestra la pantalla de Inicio, ajustado a los permisos del usuario */
  async inicio(sesion: Sesion) {
    const dia = hoy();
    const mes = primerDiaDelMes(dia);
    const mesAnterior = primerDiaDelMes(sumarDias(mes, -1));
    const verDinero = tiene(sesion, 'reportes.finanzas') || tiene(sesion, 'cobranza.ver');
    const verVentas = tiene(sesion, 'ventas.ver');
    const verInventario = tiene(sesion, 'inventario.ver');
    const s = sesion.sucursalId;
    const suc = (alias: string) => (s ? `AND ${alias}."sucursalId" = ${Number(s)}` : '');

    const [ventas] = await this.ds.query(
      `SELECT COALESCE(SUM(total) FILTER (WHERE ${FECHA('"confirmadoAt"')} >= $1), 0)                AS mes,
              COUNT(*)            FILTER (WHERE ${FECHA('"confirmadoAt"')} >= $1)                    AS "pedidosMes",
              COALESCE(SUM(total) FILTER (WHERE ${FECHA('"confirmadoAt"')} >= $2 AND ${FECHA('"confirmadoAt"')} < $1), 0) AS anterior,
              COALESCE(SUM(total) FILTER (WHERE ${FECHA('"confirmadoAt"')} = $3), 0)                 AS hoy,
              COALESCE(SUM(total - pagado), 0)                                                       AS "porCobrar",
              COALESCE(SUM(total - pagado) FILTER (WHERE "fechaVencimiento" < $3), 0)                AS vencido
         FROM pedidos p
        WHERE estado NOT IN ('COTIZACION','CANCELADO') ${suc('p')}`,
      [mes, mesAnterior, dia],
    );
    const [cobros] = await this.ds.query(
      `SELECT COALESCE(SUM(g.monto) FILTER (WHERE ${FECHA('g.fecha')} >= $1), 0) AS mes,
              COALESCE(SUM(g.monto) FILTER (WHERE ${FECHA('g.fecha')} = $2), 0)  AS hoy
         FROM pagos g JOIN pedidos p ON p.id = g."pedidoId"
        WHERE g.cancelado = false ${suc('p')}`,
      [mes, dia],
    );
    const estados: { estado: string; n: string }[] = await this.ds.query(`SELECT estado, COUNT(*) AS n FROM pedidos p WHERE true ${suc('p')} GROUP BY estado`);
    const porEstado = Object.fromEntries(estados.map((e) => [e.estado, Number(e.n)]));

    // Ventas de los últimos 14 días (días sin venta aparecen en cero)
    const serie: { dia: string; total: string; pedidos: string }[] = await this.ds.query(
      `SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia, COALESCE(SUM(p.total), 0) AS total, COUNT(p.id) AS pedidos
         FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS d(dia)
         LEFT JOIN pedidos p ON ${FECHA('p."confirmadoAt"')} = d.dia::date AND p.estado NOT IN ('COTIZACION','CANCELADO') ${suc('p')}
        GROUP BY d.dia ORDER BY d.dia`,
      [sumarDias(dia, -13), dia],
    );
    const top: { nombre: string; unidad: string; cantidad: string; importe: string }[] = await this.ds.query(
      `SELECT pr.nombre, pr.unidad, SUM(i.cantidad) AS cantidad, SUM(i.importe) AS importe
         FROM pedido_items i JOIN pedidos p ON p.id = i."pedidoId" JOIN productos pr ON pr.id = i."productoId"
        WHERE p.estado NOT IN ('COTIZACION','CANCELADO') AND ${FECHA('p."confirmadoAt"')} >= $1 ${suc('p')}
        GROUP BY pr.id ORDER BY importe DESC LIMIT 5`,
      [mes],
    );

    // Entregas programadas para los próximos 7 días (y atrasadas)
    const entregas: Record<string, string>[] = verVentas
      ? await this.ds.query(
          `SELECT p.id, p.folio, p.estado, p."fechaEntrega", p.total, p.pagado, c.nombre AS cliente,
                  EXISTS (SELECT 1 FROM inscripciones i WHERE i."pedidoId" = p.id) AS "esPollitanda"
             FROM pedidos p JOIN clientes c ON c.id = p."clienteId"
            WHERE p.estado IN ('RECIBIDO','PREPARADO','EN_RUTA','INCIDENCIA') AND p."fechaEntrega" <= $1 ${suc('p')}
            ORDER BY p."fechaEntrega", p.id LIMIT 12`,
          [sumarDias(dia, 7)],
        )
      : [];

    const pollitandas: Record<string, string>[] = tiene(sesion, 'pollitandas.ver')
      ? await this.ds.query(
          `SELECT t.id, t.nombre, t."fechaEntrega", t."cupoPaquetes",
                  COALESCE(SUM(i.paquetes) FILTER (WHERE p.estado <> 'CANCELADO'), 0) AS paquetes,
                  COALESCE(SUM(p.total)    FILTER (WHERE p.estado <> 'CANCELADO'), 0) AS vendido,
                  COALESCE(SUM(p.pagado)   FILTER (WHERE p.estado <> 'CANCELADO'), 0) AS cobrado
             FROM pollitandas t
             LEFT JOIN inscripciones i ON i."pollitandaId" = t.id
             LEFT JOIN pedidos p ON p.id = i."pedidoId"
            WHERE t.estado = 'ABIERTA' ${suc('t')}
            GROUP BY t.id ORDER BY t."fechaEntrega" LIMIT 4`,
        )
      : [];

    return {
      fecha: dia,
      dinero: verDinero
        ? {
            ventasMes: r2(Number(ventas.mes)),
            ventasMesAnterior: r2(Number(ventas.anterior)),
            ventasHoy: r2(Number(ventas.hoy)),
            pedidosMes: Number(ventas.pedidosMes),
            cobradoMes: r2(Number(cobros.mes)),
            cobradoHoy: r2(Number(cobros.hoy)),
            porCobrar: r2(Number(ventas.porCobrar)),
            vencido: r2(Number(ventas.vencido)),
          }
        : null,
      pedidos: verVentas
        ? {
            cotizaciones: porEstado.COTIZACION ?? 0,
            recibidos: porEstado.RECIBIDO ?? 0,
            preparados: porEstado.PREPARADO ?? 0,
            enRuta: porEstado.EN_RUTA ?? 0,
            incidencias: porEstado.INCIDENCIA ?? 0,
          }
        : null,
      serie: verDinero ? serie.map((f) => ({ dia: f.dia, total: r2(Number(f.total)), pedidos: Number(f.pedidos) })) : null,
      topProductos: verDinero ? top.map((t) => ({ nombre: t.nombre, unidad: t.unidad, cantidad: Number(t.cantidad), importe: r2(Number(t.importe)) })) : null,
      entregas: entregas.map((e) => ({
        id: Number(e.id),
        folio: e.folio,
        estado: e.estado,
        fechaEntrega: String(e.fechaEntrega).slice(0, 10),
        cliente: e.cliente,
        saldo: r2(Number(e.total) - Number(e.pagado)),
        esPollitanda: !!e.esPollitanda,
        atrasada: String(e.fechaEntrega).slice(0, 10) < dia,
      })),
      pollitandas: pollitandas.map((t) => ({
        id: Number(t.id),
        nombre: t.nombre,
        fechaEntrega: String(t.fechaEntrega).slice(0, 10),
        cupoPaquetes: Number(t.cupoPaquetes),
        paquetes: Number(t.paquetes),
        vendido: r2(Number(t.vendido)),
        cobrado: r2(Number(t.cobrado)),
      })),
      seguimientos: tiene(sesion, 'clientes.ver') ? await this.clientes.seguimientosPendientes(sesion, !tiene(sesion, 'reportes.finanzas')) : [],
      alertas: await this.alertas(sesion, { verInventario, verVentas, verDinero }),
    };
  }

  private async alertas(sesion: Sesion, ver: { verInventario: boolean; verVentas: boolean; verDinero: boolean }): Promise<Alerta[]> {
    const alertas: Alerta[] = [];
    const dia = hoy();
    const suc = sesion.sucursalId ? `AND p."sucursalId" = ${Number(sesion.sucursalId)}` : '';

    if (ver.verInventario) {
      for (const e of await this.inventario.existencias(sesion)) {
        const enlace = `/inventario?producto=${e.id}`;
        if (e.porSurtir > 0) {
          alertas.push({ tipo: 'preventa', nivel: 'alta', titulo: `Por surtir: ${e.nombre}`, detalle: `${e.porSurtir} vendidos en preventa que aún no tienen lote`, enlace });
        } else if (e.bajoMinimo) {
          const agotado = e.disponible <= 0;
          alertas.push({ tipo: 'inventario', nivel: agotado ? 'alta' : 'media', titulo: `${agotado ? 'Sin existencia' : 'Existencia baja'}: ${e.nombre}`, detalle: `Quedan ${e.disponible} disponibles · mínimo ${e.stockMinimo}`, enlace });
        }
        if (e.porCaducar) {
          const vencido = e.proximaCaducidad! < dia;
          alertas.push({ tipo: 'caducidad', nivel: vencido ? 'alta' : 'media', titulo: `${vencido ? 'Lote vencido' : 'Lote por vencer'}: ${e.nombre}`, detalle: `Fecha límite de venta: ${fechaLarga(e.proximaCaducidad!)}`, enlace });
        }
      }
    }
    if (ver.verVentas) {
      const [f] = await this.ds.query(
        `SELECT COUNT(*) FILTER (WHERE p.estado = 'COTIZACION' AND p."createdAt" < NOW() - INTERVAL '3 days') AS cotizaciones,
                COUNT(*) FILTER (WHERE p.estado = 'INCIDENCIA') AS incidencias,
                COUNT(*) FILTER (WHERE p.estado IN ('RECIBIDO','PREPARADO') AND p.pagado = 0 AND p."createdAt" < NOW() - INTERVAL '2 days'
                                   AND EXISTS (SELECT 1 FROM inscripciones i WHERE i."pedidoId" = p.id)) AS "sinAnticipo"
           FROM pedidos p WHERE true ${suc}`,
      );
      if (Number(f.incidencias)) alertas.push({ tipo: 'incidencia', nivel: 'alta', titulo: Number(f.incidencias) === 1 ? '1 pedido con incidencia' : `${f.incidencias} pedidos con incidencia`, detalle: 'Hay que resolverla para poder entregar', enlace: '/ventas?estado=INCIDENCIA' });
      if (Number(f.cotizaciones)) alertas.push({ tipo: 'cotizacion', nivel: 'media', titulo: Number(f.cotizaciones) === 1 ? '1 cotización sin respuesta' : `${f.cotizaciones} cotizaciones sin respuesta`, detalle: 'Más de 3 días sin confirmarse', enlace: '/ventas?grupo=cotizaciones' });
      if (Number(f.sinAnticipo)) alertas.push({ tipo: 'anticipo', nivel: 'media', titulo: Number(f.sinAnticipo) === 1 ? '1 lugar de Pollitanda sin anticipo' : `${f.sinAnticipo} lugares de Pollitanda sin anticipo`, detalle: 'Apartados hace más de 2 días', enlace: '/pollitandas' });
    }
    if (ver.verDinero) {
      const [f] = await this.ds.query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(p.total - p.pagado), 0) AS monto
           FROM pedidos p
          WHERE p.estado NOT IN ('COTIZACION','CANCELADO') AND p.total > p.pagado AND p."fechaVencimiento" < $1 ${suc}`,
        [dia],
      );
      if (Number(f.n)) alertas.push({ tipo: 'cobranza', nivel: 'alta', titulo: Number(f.n) === 1 ? '1 cuenta vencida' : `${f.n} cuentas vencidas`, detalle: `Saldo vencido: ${pesos(Number(f.monto))}`, enlace: '/cobranza' });
    }
    return alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'alta' ? -1 : 1));
  }

  /** Reporte de ventas y cobranza de un periodo */
  async ventas(sesion: Sesion, q: { desde?: string; hasta?: string }) {
    const hasta = q.hasta || hoy();
    const desde = q.desde || primerDiaDelMes(hasta);
    exigir(/^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && desde <= hasta, 'Periodo no válido');
    const suc = sesion.sucursalId ? `AND p."sucursalId" = ${Number(sesion.sucursalId)}` : '';
    const base = `FROM pedidos p WHERE p.estado NOT IN ('COTIZACION','CANCELADO') AND ${FECHA('p."confirmadoAt"')} BETWEEN $1 AND $2 ${suc}`;
    const params = [desde, hasta];
    const num = (v: unknown) => r2(Number(v));

    const [[totales], porDia, porProducto, porVendedor, porCliente, cobranza, [cotizaciones]] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS pedidos, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(descuento), 0) AS descuentos, COALESCE(SUM(pagado), 0) AS cobrado ${base}`, params),
      this.ds.query(`SELECT to_char(${FECHA('p."confirmadoAt"')}, 'YYYY-MM-DD') AS dia, COUNT(*) AS pedidos, SUM(total) AS total ${base} GROUP BY 1 ORDER BY 1`, params),
      this.ds.query(
        `SELECT pr.sku, pr.nombre, pr.categoria, pr.unidad, SUM(i.cantidad) AS cantidad, SUM(i.importe) AS importe
           FROM pedido_items i JOIN productos pr ON pr.id = i."productoId"
          WHERE i."pedidoId" IN (SELECT p.id ${base})
          GROUP BY pr.id ORDER BY importe DESC`,
        params,
      ),
      this.ds.query(
        `SELECT COALESCE(u.nombre, 'Sin vendedor') AS vendedor, COUNT(*) AS pedidos, SUM(v.total) AS total
           FROM (SELECT p.* ${base}) v LEFT JOIN usuarios u ON u.id = v."vendedorId"
          GROUP BY u.id, u.nombre ORDER BY total DESC`,
        params,
      ),
      this.ds.query(
        `SELECT c.id, c.nombre, c.tipo, COUNT(*) AS pedidos, SUM(v.total) AS total, SUM(v.total - v.pagado) AS saldo
           FROM (SELECT p.* ${base}) v JOIN clientes c ON c.id = v."clienteId"
          GROUP BY c.id ORDER BY total DESC LIMIT 20`,
        params,
      ),
      this.ds.query(
        `SELECT g.metodo, COUNT(*) AS pagos, SUM(g.monto) AS monto
           FROM pagos g JOIN pedidos p ON p.id = g."pedidoId"
          WHERE g.cancelado = false AND ${FECHA('g.fecha')} BETWEEN $1 AND $2 ${suc}
          GROUP BY g.metodo ORDER BY monto DESC`,
        params,
      ),
      this.ds.query(
        `SELECT COUNT(*) AS emitidas, COUNT(*) FILTER (WHERE p.estado NOT IN ('COTIZACION','CANCELADO')) AS ganadas
           FROM pedidos p
          WHERE (p."folioCotizacion" IS NOT NULL OR p.estado = 'COTIZACION')
            AND ${FECHA('p."createdAt"')} BETWEEN $1 AND $2 ${suc}`,
        params,
      ),
    ]);
    const total = num(totales.total);
    const pedidos = Number(totales.pedidos);
    return {
      desde,
      hasta,
      totales: {
        pedidos,
        total,
        descuentos: num(totales.descuentos),
        cobrado: num(totales.cobrado),
        porCobrar: r2(total - num(totales.cobrado)),
        ticketPromedio: pedidos ? r2(total / pedidos) : 0,
        cobradoEnPeriodo: r2(cobranza.reduce((s: number, c: { monto: string }) => s + Number(c.monto), 0)),
        cotizacionesEmitidas: Number(cotizaciones.emitidas),
        cotizacionesGanadas: Number(cotizaciones.ganadas),
      },
      porDia: porDia.map((f: Record<string, string>) => ({ dia: f.dia, pedidos: Number(f.pedidos), total: num(f.total) })),
      porProducto: porProducto.map((f: Record<string, string>) => ({ sku: f.sku, nombre: f.nombre, categoria: f.categoria, unidad: f.unidad, cantidad: Number(f.cantidad), importe: num(f.importe) })),
      porVendedor: porVendedor.map((f: Record<string, string>) => ({ vendedor: f.vendedor, pedidos: Number(f.pedidos), total: num(f.total) })),
      porCliente: porCliente.map((f: Record<string, string>) => ({ id: Number(f.id), nombre: f.nombre, tipo: f.tipo, pedidos: Number(f.pedidos), total: num(f.total), saldo: num(f.saldo) })),
      cobranza: cobranza.map((f: Record<string, string>) => ({ metodo: f.metodo, pagos: Number(f.pagos), monto: num(f.monto) })),
    };
  }
}

@Controller()
export class DashboardController {
  constructor(private readonly servicio: DashboardService) {}

  @Get('dashboard')
  inicio(@Yo() sesion: Sesion) {
    return this.servicio.inicio(sesion);
  }

  @Requiere('reportes.ver')
  @Get('reportes/ventas')
  ventas(@Yo() sesion: Sesion, @Query() q: { desde?: string; hasta?: string }) {
    return this.servicio.ventas(sesion, q);
  }
}

@Module({
  imports: [InventarioModule, ClientesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
