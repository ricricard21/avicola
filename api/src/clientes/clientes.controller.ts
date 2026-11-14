import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Requiere, Sesion, tiene, Yo } from '../common/seguridad';
import { ClienteDto, CompletarDto, SeguimientoDto } from './clientes.dto';
import { ClientesService } from './clientes.service';

@Controller()
export class ClientesController {
  constructor(private readonly servicio: ClientesService) {}

  @Requiere('clientes.ver')
  @Get('clientes')
  listar(@Query() q: { q?: string; tipo?: string; etapa?: string; conSaldo?: string; pagina?: string; porPagina?: string }) {
    return this.servicio.listar(q);
  }

  @Requiere('clientes.ver')
  @Get('clientes/:id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalle(id);
  }

  @Requiere('clientes.editar')
  @Post('clientes')
  crear(@Yo() sesion: Sesion, @Body() dto: ClienteDto) {
    return this.servicio.crear(sesion, dto);
  }

  @Requiere('clientes.editar')
  @Patch('clientes/:id')
  editar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: ClienteDto) {
    return this.servicio.editar(sesion, id, dto);
  }

  @Requiere('clientes.editar')
  @Post('clientes/:id/seguimientos')
  agregarSeguimiento(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: SeguimientoDto) {
    return this.servicio.agregarSeguimiento(sesion, id, dto);
  }

  @Requiere('clientes.ver')
  @Get('seguimientos/pendientes')
  pendientes(@Yo() sesion: Sesion) {
    // Dirección ve los de todo el equipo; cada vendedor ve los suyos.
    return this.servicio.seguimientosPendientes(sesion, !tiene(sesion, 'reportes.finanzas'));
  }

  @Requiere('clientes.editar')
  @Patch('seguimientos/:id')
  completar(@Param('id', ParseIntPipe) id: number, @Body() dto: CompletarDto) {
    return this.servicio.completarSeguimiento(id, dto.completado);
  }
}

@Module({ controllers: [ClientesController], providers: [ClientesService], exports: [ClientesService] })
export class ClientesModule {}
