import { IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class EntradaDto {
  @IsInt() productoId: number;
  @IsOptional() @IsInt() sucursalId?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive({ message: 'La cantidad debe ser mayor a cero' }) cantidad: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) costoUnitario?: number;
  @IsOptional() @IsString() @MaxLength(30) codigo?: string;
  @IsOptional() @IsString() @MaxLength(80) ubicacion?: string;
  @IsOptional() @IsDateString() fechaIngreso?: string;
  @IsOptional() @IsDateString() fechaLimiteVenta?: string;
  @IsOptional() @IsString() @MaxLength(240) notas?: string;
}

export class AjusteDto {
  /** Cantidad física real después del conteo */
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cantidadFisica: number;
  @IsString() @MinLength(3, { message: 'Explica el motivo del ajuste' }) @MaxLength(240) motivo: string;
}
