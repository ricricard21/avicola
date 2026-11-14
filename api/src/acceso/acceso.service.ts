import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { NOMBRES_ROL, PERMISOS, PERMISOS_POR_ROL, permisosEfectivos } from '../common/permisos';
import { Sesion } from '../common/seguridad';
import { BitacoraService } from '../common/servicios';
import { paginar } from '../common/util';
import { Bitacora, ROLES, Sucursal, Usuario } from '../db/entities';
import { CambiarPasswordDto, CrearUsuarioDto, EditarUsuarioDto, LoginDto, SucursalDto } from './acceso.dto';

@Injectable()
export class AccesoService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Sucursal) private readonly sucursales: Repository<Sucursal>,
    @InjectRepository(Bitacora) private readonly bitacoras: Repository<Bitacora>,
    private readonly jwt: JwtService,
    private readonly bitacora: BitacoraService,
  ) {}

  /* ---------------------------- Sesión ---------------------------- */

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const u = await this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.sucursal', 's')
      .where('u.email = :email', { email })
      .getOne();
    // Mismo mensaje para correo inexistente y contraseña incorrecta.
    const valido = u && u.activo && (await bcrypt.compare(dto.password, u.passwordHash));
    if (!u || !valido) throw new UnauthorizedException('Correo o contraseña incorrectos');

    await this.usuarios.update(u.id, { ultimoAcceso: new Date() });
    await this.bitacora.registrar(u, 'INICIO_SESION', 'usuario', u.id);
    return { token: await this.jwt.signAsync({ sub: u.id }), usuario: this.presentar(u) };
  }

  async yo(sesion: Sesion) {
    const u = await this.usuarios.findOne({ where: { id: sesion.id }, relations: { sucursal: true } });
    if (!u) throw new UnauthorizedException();
    return this.presentar(u);
  }

  async cambiarPassword(sesion: Sesion, dto: CambiarPasswordDto) {
    const u = await this.usuarios.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id: sesion.id }).getOne();
    if (!u || !(await bcrypt.compare(dto.actual, u.passwordHash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    await this.usuarios.update(u.id, { passwordHash: await bcrypt.hash(dto.nueva, 10) });
    await this.bitacora.registrar(sesion, 'CAMBIO_PASSWORD', 'usuario', u.id);
    return { ok: true };
  }

  /* ---------------------------- Usuarios -------------------------- */

  async listarUsuarios() {
    const lista = await this.usuarios.find({ relations: { sucursal: true }, order: { activo: 'DESC', nombre: 'ASC' } });
    return lista.map((u) => this.presentar(u));
  }

  catalogoPermisos() {
    return {
      permisos: Object.entries(PERMISOS).map(([clave, descripcion]) => ({ clave, descripcion, modulo: clave.split('.')[0] })),
      roles: ROLES.map((rol) => ({ rol, nombre: NOMBRES_ROL[rol], permisos: PERMISOS_POR_ROL[rol] })),
    };
  }

  async crearUsuario(sesion: Sesion, dto: CrearUsuarioDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.usuarios.findOne({ where: { email } })) throw new ConflictException('Ya existe un usuario con ese correo');
    if (dto.sucursalId) await this.exigirSucursal(dto.sucursalId);
    const u = await this.usuarios.save(
      this.usuarios.create({
        nombre: dto.nombre.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        rol: dto.rol,
        sucursalId: dto.sucursalId ?? null,
        permisosExtra: this.limpiarPermisos(dto.permisosExtra),
        permisosDenegados: this.limpiarPermisos(dto.permisosDenegados),
      }),
    );
    await this.bitacora.registrar(sesion, 'CREAR', 'usuario', u.id, `Alta de ${u.nombre} (${NOMBRES_ROL[u.rol]})`);
    return this.detalleUsuario(u.id);
  }

  async editarUsuario(sesion: Sesion, id: number, dto: EditarUsuarioDto) {
    const u = await this.usuarios.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    if (id === sesion.id && (dto.activo === false || (dto.rol && dto.rol !== u.rol))) {
      throw new BadRequestException('No puedes cambiar tu propio rol ni desactivarte');
    }
    const cambios: Partial<Usuario> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const otro = await this.usuarios.findOne({ where: { email } });
      if (otro && otro.id !== id) throw new ConflictException('Ya existe un usuario con ese correo');
      cambios.email = email;
    }
    if (dto.password) cambios.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.rol !== undefined) cambios.rol = dto.rol;
    if (dto.sucursalId !== undefined) {
      if (dto.sucursalId) await this.exigirSucursal(dto.sucursalId);
      cambios.sucursalId = dto.sucursalId ?? null;
    }
    if (dto.permisosExtra !== undefined) cambios.permisosExtra = this.limpiarPermisos(dto.permisosExtra);
    if (dto.permisosDenegados !== undefined) cambios.permisosDenegados = this.limpiarPermisos(dto.permisosDenegados);
    if (dto.activo !== undefined) cambios.activo = dto.activo;

    await this.usuarios.update(id, cambios);
    const { passwordHash: _omitida, ...visibles } = cambios;
    await this.bitacora.registrar(sesion, 'EDITAR', 'usuario', id, `Cambios en ${u.nombre}`, {
      ...visibles,
      ...(dto.password ? { password: 'restablecida' } : {}),
    });
    return this.detalleUsuario(id);
  }

  /* ---------------------------- Sucursales ------------------------ */

  listarSucursales() {
    return this.sucursales.find({ order: { activa: 'DESC', id: 'ASC' } });
  }

  async crearSucursal(sesion: Sesion, dto: SucursalDto) {
    const s = await this.sucursales.save(this.sucursales.create({ nombre: dto.nombre.trim(), direccion: dto.direccion?.trim() || null }));
    await this.bitacora.registrar(sesion, 'CREAR', 'sucursal', s.id, `Alta de sucursal ${s.nombre}`);
    return s;
  }

  async editarSucursal(sesion: Sesion, id: number, dto: SucursalDto) {
    await this.exigirSucursal(id);
    await this.sucursales.update(id, {
      nombre: dto.nombre.trim(),
      direccion: dto.direccion?.trim() || null,
      ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
    });
    await this.bitacora.registrar(sesion, 'EDITAR', 'sucursal', id, `Cambios en sucursal ${dto.nombre}`);
    return this.sucursales.findOne({ where: { id } });
  }

  /* ---------------------------- Bitácora -------------------------- */

  async listarBitacora(q: { entidad?: string; usuarioId?: string; pagina?: string }) {
    const { pagina, porPagina, skip, take } = paginar(q.pagina, 60);
    const [datos, total] = await this.bitacoras.findAndCount({
      where: {
        ...(q.entidad ? { entidad: q.entidad } : {}),
        ...(q.usuarioId ? { usuarioId: Number(q.usuarioId) } : {}),
      },
      order: { id: 'DESC' },
      skip,
      take,
    });
    return { datos, total, pagina, porPagina };
  }

  /* ---------------------------- Internos -------------------------- */

  private async detalleUsuario(id: number) {
    const u = await this.usuarios.findOne({ where: { id }, relations: { sucursal: true } });
    return this.presentar(u!);
  }

  private async exigirSucursal(id: number) {
    if (!(await this.sucursales.findOne({ where: { id } }))) throw new BadRequestException('La sucursal no existe');
  }

  private limpiarPermisos(lista?: string[]): string[] {
    return [...new Set((lista ?? []).filter((p) => p in PERMISOS))];
  }

  private presentar(u: Usuario) {
    return {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      rolNombre: NOMBRES_ROL[u.rol],
      sucursalId: u.sucursalId,
      sucursal: u.sucursal ? { id: u.sucursal.id, nombre: u.sucursal.nombre } : null,
      permisosExtra: u.permisosExtra,
      permisosDenegados: u.permisosDenegados,
      permisos: permisosEfectivos(u.rol, u.permisosExtra, u.permisosDenegados),
      activo: u.activo,
      ultimoAcceso: u.ultimoAcceso,
      createdAt: u.createdAt,
    };
  }
}
