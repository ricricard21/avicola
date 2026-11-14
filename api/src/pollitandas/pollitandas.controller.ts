import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Requiere, Sesion, Yo } from '../common/seguridad';
import { PagosModule } from '../pagos/pagos.controller';
import { PedidosModule } from '../pedidos/pedidos.controller';
import { BajaDto, InscribirDto, PollitandaDto } from './pollitandas.dto';
import { PollitandasService } from './pollitandas.service';

@Controller('pollitandas')
export class PollitandasController {
  constructor(private readonly servicio: PollitandasService) {}

  @Requiere('pollitandas.ver')
  @Get()
  listar(@Yo() sesion: Sesion) {
    return this.servicio.listar(sesion);
  }

  @Requiere('pollitandas.ver')
  @Get('expedientes/:id')
  expediente(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number) {
    return this.servicio.expediente(sesion, id);
  }

  @Requiere('pollitandas.admin', 'ventas.cancelar')
  @Post('expedientes/:id/baja')
  baja(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: BajaDto) {
    return this.servicio.cancelarInscripcion(sesion, id, dto.motivo);
  }

  @Requiere('pollitandas.ver')
  @Get(':id')
  detalle(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalle(sesion, id);
  }

  @Requiere('pollitandas.admin')
  @Post()
  crear(@Yo() sesion: Sesion, @Body() dto: PollitandaDto) {
    return this.servicio.crear(sesion, dto);
  }

  @Requiere('pollitandas.admin')
  @Patch(':id')
  editar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: PollitandaDto) {
    return this.servicio.editar(sesion, id, dto);
  }

  @Requiere('pollitandas.inscribir')
  @Post(':id/inscripciones')
  inscribir(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: InscribirDto) {
    return this.servicio.inscribir(sesion, id, dto);
  }
}

@Module({
  imports: [PedidosModule, PagosModule],
  controllers: [PollitandasController],
  providers: [PollitandasService],
})
export class PollitandasModule {}
