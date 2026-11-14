import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rol, Usuario } from '../db/entities';
import { Permiso, permisosEfectivos } from './permisos';

/** Usuario autenticado que viaja en cada petición */
export interface Sesion {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  /** null = todas las sucursales */
  sucursalId: number | null;
  permisos: Permiso[];
}

const CLAVE_PUBLICO = 'publico';
const CLAVE_PERMISOS = 'permisos';

/** Marca una ruta como accesible sin iniciar sesión */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Exige que el usuario tenga al menos uno de los permisos indicados */
export const Requiere = (...permisos: Permiso[]) => SetMetadata(CLAVE_PERMISOS, permisos);

/** Inyecta al usuario autenticado en el controlador */
export const Yo = createParamDecorator((_: unknown, ctx: ExecutionContext): Sesion => {
  return ctx.switchToHttp().getRequest().sesion;
});

export function tiene(sesion: Sesion, permiso: Permiso): boolean {
  return sesion.permisos.includes(permiso);
}

@Injectable()
export class GuardiaSesion implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivo = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivo)) return true;

    const req = ctx.switchToHttp().getRequest();
    const cabecera: string = req.headers.authorization ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
    if (!token) throw new UnauthorizedException('Inicia sesión para continuar');

    let id: number;
    try {
      id = (await this.jwt.verifyAsync<{ sub: number }>(token)).sub;
    } catch {
      throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión');
    }

    // Se consulta en cada petición para que un cambio de permisos o una baja
    // surtan efecto de inmediato, sin esperar a que caduque el token.
    const u = await this.usuarios.findOne({ where: { id } });
    if (!u || !u.activo) throw new UnauthorizedException('Tu usuario está desactivado');

    const sesion: Sesion = {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      sucursalId: u.sucursalId,
      permisos: permisosEfectivos(u.rol, u.permisosExtra, u.permisosDenegados),
    };
    req.sesion = sesion;

    const requeridos = this.reflector.getAllAndOverride<Permiso[]>(CLAVE_PERMISOS, objetivo);
    if (requeridos?.length && !requeridos.some((p) => sesion.permisos.includes(p))) {
      throw new ForbiddenException('No tienes permiso para realizar esta acción');
    }
    return true;
  }
}
