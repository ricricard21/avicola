import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { EtapaProspecto, ETAPAS_PROSPECTO, TipoCliente, TipoSeguimiento, TIPOS_CLIENTE, TIPOS_SEGUIMIENTO } from '../db/entities';

const opcionalVacio = () => ValidateIf((_, v) => v !== null && v !== undefined && v !== '');

export class ClienteDto {
  @IsString() @MinLength(2, { message: 'Escribe el nombre del cliente' }) @MaxLength(160) nombre: string;
  @IsOptional() @IsIn(TIPOS_CLIENTE) tipo?: TipoCliente;
  @opcionalVacio() @IsString() @MaxLength(30) telefono?: string | null;
  @opcionalVacio() @IsString() @MaxLength(30) whatsapp?: string | null;
  @opcionalVacio() @IsEmail({}, { message: 'Escribe un correo válido' }) email?: string | null;
  @opcionalVacio() @IsString() @MaxLength(240) direccion?: string | null;
  @opcionalVacio() @IsString() @MaxLength(120) municipio?: string | null;
  @opcionalVacio() @IsString() @MaxLength(20) rfc?: string | null;
  @opcionalVacio() @IsIn(ETAPAS_PROSPECTO) etapa?: EtapaProspecto | null;
  @opcionalVacio() @IsString() @MaxLength(60) origen?: string | null;
  @opcionalVacio() @IsString() @MaxLength(2000) notas?: string | null;
  @opcionalVacio() @IsInt() vendedorId?: number | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class SeguimientoDto {
  @IsOptional() @IsIn(TIPOS_SEGUIMIENTO) tipo?: TipoSeguimiento;
  @IsString() @MinLength(2, { message: 'Escribe una nota' }) @MaxLength(2000) nota: string;
  @opcionalVacio() @IsDateString() proximaAccion?: string | null;
}

export class CompletarDto {
  @IsBoolean() completado: boolean;
}
