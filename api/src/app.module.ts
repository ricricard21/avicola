import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Response } from 'express';
import { AccesoModule } from './acceso/acceso.controller';
import { ClientesModule } from './clientes/clientes.controller';
import { GuardiaSesion } from './common/seguridad';
import { ComunModule } from './common/servicios';
import { DashboardModule } from './dashboard/dashboard.controller';
import { opcionesBD } from './db/opciones';
import { InventarioModule } from './inventario/inventario.controller';
import { NotificacionesModule } from './notificaciones/notificaciones.controller';
import { PagosModule } from './pagos/pagos.controller';
import { PedidosModule } from './pedidos/pedidos.controller';
import { PollitandasModule } from './pollitandas/pollitandas.controller';
import { ProductosModule } from './productos/productos.controller';

/** Respuesta de error uniforme: { mensaje, codigo? }. Los errores inesperados no exponen detalles internos. */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const cuerpo = error.getResponse();
      const datos = typeof cuerpo === 'string' ? { message: cuerpo } : (cuerpo as Record<string, unknown>);
      const mensaje = Array.isArray(datos.message) ? datos.message.join('. ') : String(datos.message ?? error.message);
      const traducido = mensaje === 'ThrottlerException: Too Many Requests' ? 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.' : mensaje;
      return res.status(error.getStatus()).json({ mensaje: traducido, ...(datos.codigo ? { codigo: datos.codigo } : {}), ...(datos.faltantes ? { faltantes: datos.faltantes } : {}) });
    }
    this.log.error(error instanceof Error ? error.stack : String(error));
    return res.status(500).json({ mensaje: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
  }
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: () => opcionesBD() }),
    ScheduleModule.forRoot(),
    // Límite general: 300 peticiones por minuto por IP (el login tiene uno más estricto)
    ThrottlerModule.forRootAsync({ useFactory: () => [{ ttl: 60_000, limit: Number(process.env.LIMITE_PETICIONES) || 300 }] }),
    ComunModule,
    NotificacionesModule,
    AccesoModule,
    ClientesModule,
    ProductosModule,
    InventarioModule,
    PedidosModule,
    PagosModule,
    PollitandasModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: GuardiaSesion },
    { provide: APP_FILTER, useClass: FiltroErrores },
  ],
})
export class AppModule {}
