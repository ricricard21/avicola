import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EstadoPedido } from '../db/entities';

const opcionalVacio = () => ValidateIf((_, v) => v !== null && v !== undefined && v !== '');

export class ItemDto {
  @IsInt() productoId: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive({ message: 'La cantidad debe ser mayor a cero' }) cantidad: number;
  /** Si se omite se usa el precio de lista del producto */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) precioUnitario?: number;
}

export class CrearPedidoDto {
  @IsInt() clienteId: number;
  @IsArray() @ArrayMinSize(1, { message: 'Agrega al menos un producto' }) @ValidateNested({ each: true }) @Type(() => ItemDto) items: ItemDto[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) descuento?: number;
  @opcionalVacio() @IsDateString() fechaEntrega?: string | null;
  @opcionalVacio() @IsDateString() fechaVencimiento?: string | null;
  @opcionalVacio() @IsString() @MaxLength(2000) notas?: string | null;
  @IsOptional() @IsInt() sucursalId?: number;
  /** true = pedido en firme (aparta inventario); false = solo cotización */
  @IsBoolean() confirmar: boolean;
  /** Permite vender aunque no haya existencia suficiente (preventa) */
  @IsOptional() @IsBoolean() permitirFaltante?: boolean;
}

export class EditarPedidoDto {
  /** Solo se aceptan mientras el pedido es cotización */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ItemDto) items?: ItemDto[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) descuento?: number;
  @opcionalVacio() @IsDateString() fechaEntrega?: string | null;
  @opcionalVacio() @IsDateString() fechaVencimiento?: string | null;
  @opcionalVacio() @IsString() @MaxLength(2000) notas?: string | null;
}

export class ConfirmarDto {
  @IsOptional() @IsBoolean() permitirFaltante?: boolean;
}

export class EstadoDto {
  @IsIn(['RECIBIDO', 'PREPARADO', 'EN_RUTA', 'ENTREGADO', 'INCIDENCIA']) estado: EstadoPedido;
  /** Descripción de la incidencia u observación de entrega */
  @opcionalVacio() @IsString() @MaxLength(2000) nota?: string | null;
  @opcionalVacio() @IsString() @MaxLength(120) recibidoPor?: string | null;
}

export class CancelarDto {
  @IsString() @MinLength(5, { message: 'Explica el motivo de la cancelación' }) @MaxLength(240) motivo: string;
}
