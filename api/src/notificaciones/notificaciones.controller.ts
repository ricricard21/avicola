import { Body, Controller, Get, Global, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsString, MaxLength, MinLength } from 'class-validator';
import { Requiere, Sesion, Yo } from '../common/seguridad';
import { EstadoNotificacion } from '../db/entities';
import { NotificacionesService } from './notificaciones.service';

class MarcarDto {
  @IsIn(['ENVIADA', 'DESCARTADA', 'PENDIENTE']) estado: EstadoNotificacion;
}

class MensajeManualDto {
  @IsInt() clienteId: number;
  @IsString() @MinLength(3) @MaxLength(1000) mensaje: string;
}

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly servicio: NotificacionesService) {}

  @Requiere('mensajes.ver')
  @Get()
  listar(@Query() q: { estado?: string; clienteId?: string; pagina?: string }) {
    return this.servicio.listar(q);
  }

  @Requiere('mensajes.enviar')
  @Post()
  crear(@Yo() sesion: Sesion, @Body() dto: MensajeManualDto) {
    return this.servicio.crearManual(sesion, dto.clienteId, dto.mensaje);
  }

  /** Ejecuta en este momento la revisión diaria de recordatorios */
  @Requiere('mensajes.enviar')
  @Post('recordatorios')
  recordatorios() {
    return this.servicio.generarRecordatorios();
  }

  @Requiere('mensajes.enviar')
  @Post(':id/estado')
  marcar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: MarcarDto) {
    return this.servicio.marcar(sesion, id, dto.estado);
  }
}

@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
