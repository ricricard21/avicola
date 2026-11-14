import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { Publico, Requiere, Sesion, Yo } from '../common/seguridad';
import { Sucursal } from '../db/entities';
import { CambiarPasswordDto, CrearUsuarioDto, EditarUsuarioDto, LoginDto, SucursalDto } from './acceso.dto';
import { AccesoService } from './acceso.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly servicio: AccesoService) {}

  /** Máximo 8 intentos por minuto por IP para frenar ataques de fuerza bruta */
  @Publico()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.servicio.login(dto);
  }

  @Get('yo')
  yo(@Yo() sesion: Sesion) {
    return this.servicio.yo(sesion);
  }

  @Post('password')
  cambiarPassword(@Yo() sesion: Sesion, @Body() dto: CambiarPasswordDto) {
    return this.servicio.cambiarPassword(sesion, dto);
  }
}

@Controller()
export class ConfiguracionController {
  constructor(private readonly servicio: AccesoService) {}

  @Requiere('config.usuarios')
  @Get('usuarios')
  usuarios() {
    return this.servicio.listarUsuarios();
  }

  @Requiere('config.usuarios')
  @Get('usuarios/permisos')
  permisos() {
    return this.servicio.catalogoPermisos();
  }

  @Requiere('config.usuarios')
  @Post('usuarios')
  crearUsuario(@Yo() sesion: Sesion, @Body() dto: CrearUsuarioDto) {
    return this.servicio.crearUsuario(sesion, dto);
  }

  @Requiere('config.usuarios')
  @Patch('usuarios/:id')
  editarUsuario(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarUsuarioDto) {
    return this.servicio.editarUsuario(sesion, id, dto);
  }

  /** Cualquier usuario autenticado puede leer las sucursales (se usan en formularios) */
  @Get('sucursales')
  sucursales() {
    return this.servicio.listarSucursales();
  }

  @Requiere('config.catalogos')
  @Post('sucursales')
  crearSucursal(@Yo() sesion: Sesion, @Body() dto: SucursalDto) {
    return this.servicio.crearSucursal(sesion, dto);
  }

  @Requiere('config.catalogos')
  @Patch('sucursales/:id')
  editarSucursal(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: SucursalDto) {
    return this.servicio.editarSucursal(sesion, id, dto);
  }

  @Requiere('config.bitacora')
  @Get('bitacora')
  bitacora(@Query() q: { entidad?: string; usuarioId?: string; pagina?: string }) {
    return this.servicio.listarBitacora(q);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Sucursal])],
  controllers: [AuthController, ConfiguracionController],
  providers: [AccesoService],
})
export class AccesoModule {}
