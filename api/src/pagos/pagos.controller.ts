import { Body, Controller, Get, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Requiere, Sesion, Yo } from '../common/seguridad';
import { CancelarPagoDto, PagoDto } from './pagos.dto';
import { PagosService } from './pagos.service';

@Controller()
export class PagosController {
  constructor(private readonly servicio: PagosService) {}

  @Requiere('cobranza.ver')
  @Get('pagos')
  listar(@Yo() sesion: Sesion, @Query() q: { desde?: string; hasta?: string; clienteId?: string; pedidoId?: string; metodo?: string; pagina?: string }) {
    return this.servicio.listar(sesion, q);
  }

  @Requiere('cobranza.ver')
  @Get('pagos/:id')
  recibo(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.recibo(id);
  }

  @Requiere('cobranza.registrar')
  @Post('pagos')
  registrar(@Yo() sesion: Sesion, @Body() dto: PagoDto) {
    return this.servicio.registrar(sesion, dto);
  }

  @Requiere('cobranza.cancelar')
  @Post('pagos/:id/cancelar')
  cancelar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelarPagoDto) {
    return this.servicio.cancelar(sesion, id, dto.motivo);
  }

  @Requiere('cobranza.ver')
  @Get('cobranza/por-cobrar')
  porCobrar(@Yo() sesion: Sesion, @Query() q: { q?: string }) {
    return this.servicio.porCobrar(sesion, q);
  }

  @Requiere('cobranza.ver')
  @Get('cobranza/resumen')
  resumen(@Yo() sesion: Sesion) {
    return this.servicio.resumen(sesion);
  }
}

@Module({ controllers: [PagosController], providers: [PagosService], exports: [PagosService] })
export class PagosModule {}
