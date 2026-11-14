import { Body, Controller, Get, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Requiere, Sesion, Yo } from '../common/seguridad';
import { AjusteDto, EntradaDto } from './inventario.dto';
import { InventarioService } from './inventario.service';

@Controller('inventario')
export class InventarioController {
  constructor(private readonly servicio: InventarioService) {}

  @Requiere('inventario.ver', 'productos.ver')
  @Get('existencias')
  existencias(@Yo() sesion: Sesion, @Query() q: { categoria?: string; q?: string; sucursalId?: string }) {
    return this.servicio.existencias(sesion, q);
  }

  @Requiere('inventario.ver')
  @Get('lotes')
  lotes(@Yo() sesion: Sesion, @Query() q: { productoId?: string; todos?: string }) {
    return this.servicio.lotes(sesion, q);
  }

  @Requiere('inventario.ver')
  @Get('movimientos')
  movimientos(@Yo() sesion: Sesion, @Query() q: { productoId?: string; loteId?: string; tipo?: string; pagina?: string }) {
    return this.servicio.movimientos(sesion, q);
  }

  @Requiere('inventario.entrada')
  @Post('lotes')
  entrada(@Yo() sesion: Sesion, @Body() dto: EntradaDto) {
    return this.servicio.entrada(sesion, dto);
  }

  @Requiere('inventario.ajustar')
  @Post('lotes/:id/ajuste')
  ajuste(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: AjusteDto) {
    return this.servicio.ajuste(sesion, id, dto);
  }
}

@Module({
  controllers: [InventarioController],
  providers: [InventarioService],
  exports: [InventarioService],
})
export class InventarioModule {}
