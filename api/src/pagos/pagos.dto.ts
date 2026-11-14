import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';
import { MetodoPago, METODOS_PAGO } from '../db/entities';

export class PagoDto {
  @IsInt() pedidoId: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive({ message: 'El monto debe ser mayor a cero' }) monto: number;
  @IsIn(METODOS_PAGO) metodo: MetodoPago;
  @IsOptional() @IsString() @MaxLength(80) referencia?: string;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsString() @MaxLength(240) notas?: string;
}

export class CancelarPagoDto {
  @IsString() @MinLength(5, { message: 'Explica el motivo de la cancelación' }) @MaxLength(240) motivo: string;
}
