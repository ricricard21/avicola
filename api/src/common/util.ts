import { BadRequestException } from '@nestjs/common';

export const ZONA = process.env.TZ || 'America/Mexico_City';

/** Redondeo a 2 decimales seguro para dinero y cantidades */
export function r2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de operación */
export function hoy(): string {
  return fechaLocal(new Date());
}

export function fechaLocal(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Suma días a una fecha YYYY-MM-DD */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T12:00:00Z`).getTime();
  const b = new Date(`${hasta}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function primerDiaDelMes(fecha = hoy()): string {
  return `${fecha.slice(0, 7)}-01`;
}

export function pesos(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

export function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  );
}

export function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new BadRequestException(mensaje);
}

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export function paginar(pagina?: number | string, porPagina?: number | string) {
  const p = Math.max(1, Number(pagina) || 1);
  const pp = Math.min(200, Math.max(1, Number(porPagina) || 50));
  return { pagina: p, porPagina: pp, skip: (p - 1) * pp, take: pp };
}
