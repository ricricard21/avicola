import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Rol, ROLES } from '../db/entities';

export class LoginDto {
  @IsEmail({}, { message: 'Escribe un correo válido' }) email: string;
  @IsString() @MinLength(1) password: string;
}

export class CambiarPasswordDto {
  @IsString() actual: string;
  @IsString() @MinLength(8, { message: 'La contraseña nueva debe tener al menos 8 caracteres' }) nueva: string;
}

export class CrearUsuarioDto {
  @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @IsEmail({}, { message: 'Escribe un correo válido' }) email: string;
  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) password: string;
  @IsIn(ROLES) rol: Rol;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() sucursalId?: number | null;
  @IsOptional() @IsArray() @IsString({ each: true }) permisosExtra?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) permisosDenegados?: string[];
}

export class EditarUsuarioDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nombre?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) password?: string;
  @IsOptional() @IsIn(ROLES) rol?: Rol;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() sucursalId?: number | null;
  @IsOptional() @IsArray() @IsString({ each: true }) permisosExtra?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) permisosDenegados?: string[];
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class SucursalDto {
  @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @IsOptional() @IsString() @MaxLength(240) direccion?: string;
  @IsOptional() @IsBoolean() activa?: boolean;
}
