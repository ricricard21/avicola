import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Requiere, Sesion, Yo } from '../common/seguridad';
import { InventarioModule } from '../inventario/inventario.controller';
import { CancelarDto, ConfirmarDto, CrearPedidoDto, EditarPedidoDto, EstadoDto } from './pedidos.dto';
import { PedidosService } from './pedidos.service';

@Controller('pedidos')
export class PedidosController {
  constructor(private readonly servicio: PedidosService) {}

  @Requiere('ventas.ver')
  @Get()
  listar(
    @Yo() sesion: Sesion,
    @Query() q: { estado?: string; grupo?: string; q?: string; clienteId?: string; desde?: string; hasta?: string; pagina?: string; porPagina?: string },
  ) {
    return this.servicio.listar(sesion, q);
  }

  @Requiere('ventas.ver', 'cobranza.ver')
  @Get(':id')
  detalle(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalle(sesion, id);
  }

  @Requiere('ventas.crear')
  @Post()
  crear(@Yo() sesion: Sesion, @Body() dto: CrearPedidoDto) {
    return this.servicio.crear(sesion, dto);
  }

  @Requiere('ventas.crear')
  @Patch(':id')
  editar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarPedidoDto) {
    return this.servicio.editar(sesion, id, dto);
  }

  @Requiere('ventas.crear')
  @Post(':id/confirmar')
  confirmar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: ConfirmarDto) {
    return this.servicio.confirmar(sesion, id, !!dto.permitirFaltante);
  }

  @Requiere('ventas.crear', 'ventas.estado')
  @Post(':id/reservar')
  reservar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number) {
    return this.servicio.reservarPendiente(sesion, id);
  }

  @Requiere('ventas.estado')
  @Post(':id/estado')
  estado(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: EstadoDto) {
    return this.servicio.cambiarEstado(sesion, id, dto);
  }

  @Requiere('ventas.cancelar', 'ventas.crear')
  @Post(':id/cancelar')
  cancelar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelarDto) {
    return this.servicio.cancelar(sesion, id, dto.motivo);
  }
}

@Module({
  imports: [InventarioModule],
  controllers: [PedidosController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
