import { Type } from 'class-transformer';
import {
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
import { EstadoPollitanda, ESTADOS_POLLITANDA, MetodoPago, METODOS_PAGO } from '../db/entities';

const opcionalVacio = () => ValidateIf((_, v) => v !== null && v !== undefined && v !== '');

export class PollitandaDto {
  @IsString() @MinLength(3) @MaxLength(120) nombre: string;
  @opcionalVacio() @IsString() @MaxLength(2000) descripcion?: string | null;
  @IsInt() productoId: number;
  @IsOptional() @IsInt() sucursalId?: number;
  @IsInt() @IsPositive() pollitosPorPaquete: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() precioPaquete: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) anticipoMinimo?: number;
  @IsInt() @IsPositive() cupoPaquetes: number;
  @opcionalVacio() @IsDateString() fechaCierre?: string | null;
  @IsDateString() fechaEntrega: string;
  @IsOptional() @IsBoolean() preventa?: boolean;
  @IsOptional() @IsIn(ESTADOS_POLLITANDA) estado?: EstadoPollitanda;
}

export class AnticipoDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() monto: number;
  @IsIn(METODOS_PAGO) metodo: MetodoPago;
  @IsOptional() @IsString() @MaxLength(80) referencia?: string;
}

export class InscribirDto {
  @IsInt() clienteId: number;
  @IsInt() @IsPositive({ message: 'Indica cuántos paquetes' }) paquetes: number;
  @IsOptional() @ValidateNested() @Type(() => AnticipoDto) anticipo?: AnticipoDto;
  @opcionalVacio() @IsString() @MaxLength(2000) notas?: string | null;
}

export class BajaDto {
  @IsString() @MinLength(5, { message: 'Explica el motivo de la baja' }) @MaxLength(240) motivo: string;
}
