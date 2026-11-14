const ZONA = 'America/Mexico_City';

const fmtPesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const fmtPesosCortos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const fmtNumero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

export const pesos = (n: number | null | undefined) => fmtPesos.format(n ?? 0);
export const pesosCortos = (n: number | null | undefined) => fmtPesosCortos.format(n ?? 0);
export const numero = (n: number | null | undefined) => fmtNumero.format(n ?? 0);

/** "12 cajas", "1 bulto", "48 aves": cantidad con su unidad en singular o plural */
export function plural(unidad: string, cantidad: number): string {
  if (cantidad === 1) return unidad;
  return /[aeiouáéíóú]$/i.test(unidad) ? `${unidad}s` : /s$/i.test(unidad) ? unidad : `${unidad}es`;
}

/** Acepta 'YYYY-MM-DD' (fecha sin hora) o una fecha ISO completa */
function aFecha(valor: string | Date): { fecha: Date; soloDia: boolean } {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return { fecha: new Date(`${valor}T12:00:00Z`), soloDia: true };
  return { fecha: new Date(valor), soloDia: false };
}

/** 14 nov · 14 nov 2025 si es de otro año */
export function fecha(valor: string | Date | null | undefined, opciones: { anio?: boolean; hora?: boolean } = {}): string {
  if (!valor) return '—';
  const { fecha: f, soloDia } = aFecha(valor);
  const zona = soloDia ? 'UTC' : ZONA;
  const otroAnio = opciones.anio ?? f.getUTCFullYear() !== new Date().getFullYear();
  let texto = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', ...(otroAnio ? { year: 'numeric' } : {}), timeZone: zona }).format(f).replace('.', '');
  if (opciones.hora && !soloDia) texto += ` · ${new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }).format(f)}`;
  return texto;
}

export function fechaLarga(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const { fecha: f, soloDia } = aFecha(valor);
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: soloDia ? 'UTC' : ZONA }).format(f);
}

/** Fecha de hoy en México, como YYYY-MM-DD */
export function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function sumarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "hoy", "mañana", "en 3 días", "hace 2 días" para fechas sin hora */
export function relativa(dia: string | null | undefined): string {
  if (!dia) return '—';
  const dif = Math.round((new Date(`${dia.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${hoy()}T12:00:00Z`).getTime()) / 86_400_000);
  if (dif === 0) return 'hoy';
  if (dif === 1) return 'mañana';
  if (dif === -1) return 'ayer';
  return dif > 0 ? `en ${dif} días` : `hace ${-dif} días`;
}

/** Enlace para abrir WhatsApp con el mensaje ya escrito (envío manual mientras se contrata la API oficial) */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje = ''): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.length === 10 ? `52${digitos}` : digitos;
  return `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
}

export function telefono(valor: string | null | undefined): string {
  const d = (valor ?? '').replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : (valor ?? '—');
}

export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/** Descarga una tabla como CSV que Excel abre con acentos correctos */
export function descargarCsv(nombre: string, encabezados: string[], filas: (string | number | null | undefined)[][]) {
  const celda = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const contenido = [encabezados, ...filas].map((f) => f.map(celda).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', contenido], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}
