import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { Requiere, Sesion, Yo } from '../common/seguridad';
import { BitacoraService } from '../common/servicios';
import { r2 } from '../common/util';
import { Categoria, CATEGORIAS, Producto } from '../db/entities';

export class ProductoDto {
  @IsString() @MinLength(2) @MaxLength(30) sku: string;
  @IsString() @MinLength(2) @MaxLength(160) nombre: string;
  @IsIn(CATEGORIAS) categoria: Categoria;
  @IsString() @MinLength(1) @MaxLength(30) unidad: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) precio: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) stockMinimo?: number;
  @IsOptional() @IsInt() @Min(0) diasAlerta?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
}

@Injectable()
export class ProductosService {
  constructor(
    private readonly ds: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  private get repo() {
    return this.ds.getRepository(Producto);
  }

  listar(q: { todos?: string }) {
    return this.repo.find({ where: q.todos === '1' ? {} : { activo: true }, order: { categoria: 'ASC', nombre: 'ASC' } });
  }

  async crear(sesion: Sesion, dto: ProductoDto) {
    const sku = dto.sku.trim().toUpperCase();
    if (await this.repo.findOne({ where: { sku } })) throw new ConflictException(`Ya existe un producto con la clave ${sku}`);
    const p = await this.repo.save(
      this.repo.create({
        sku,
        nombre: dto.nombre.trim(),
        categoria: dto.categoria,
        unidad: dto.unidad.trim(),
        precio: r2(dto.precio),
        stockMinimo: r2(dto.stockMinimo ?? 0),
        diasAlerta: dto.diasAlerta ?? 3,
      }),
    );
    await this.bitacora.registrar(sesion, 'CREAR', 'producto', p.id, `Alta de ${p.nombre}`);
    return p;
  }

  async editar(sesion: Sesion, id: number, dto: ProductoDto) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    const sku = dto.sku.trim().toUpperCase();
    const otro = await this.repo.findOne({ where: { sku } });
    if (otro && otro.id !== id) throw new ConflictException(`Ya existe un producto con la clave ${sku}`);
    const antes = { precio: p.precio, activo: p.activo };
    await this.repo.update(id, {
      sku,
      nombre: dto.nombre.trim(),
      categoria: dto.categoria,
      unidad: dto.unidad.trim(),
      precio: r2(dto.precio),
      stockMinimo: r2(dto.stockMinimo ?? 0),
      diasAlerta: dto.diasAlerta ?? p.diasAlerta,
      ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
    });
    const cambioPrecio = antes.precio !== r2(dto.precio) ? ` · precio ${antes.precio} → ${r2(dto.precio)}` : '';
    await this.bitacora.registrar(sesion, 'EDITAR', 'producto', id, `Cambios en ${dto.nombre}${cambioPrecio}`);
    return this.repo.findOne({ where: { id } });
  }
}

@Controller('productos')
export class ProductosController {
  constructor(private readonly servicio: ProductosService) {}

  @Requiere('productos.ver', 'ventas.crear', 'inventario.ver')
  @Get()
  listar(@Query() q: { todos?: string }) {
    return this.servicio.listar(q);
  }

  @Requiere('productos.editar')
  @Post()
  crear(@Yo() sesion: Sesion, @Body() dto: ProductoDto) {
    return this.servicio.crear(sesion, dto);
  }

  @Requiere('productos.editar')
  @Patch(':id')
  editar(@Yo() sesion: Sesion, @Param('id', ParseIntPipe) id: number, @Body() dto: ProductoDto) {
    return this.servicio.editar(sesion, id, dto);
  }
}

@Module({ controllers: [ProductosController], providers: [ProductosService] })
export class ProductosModule {}
