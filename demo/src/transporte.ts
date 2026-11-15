/**
 * Transporte de la demostración: en lugar de llamar a un servidor, atiende cada
 * petición con el motor que corre en el navegador. Sustituye a web/src/lib/transporte.ts.
 */
import { alSembrar, guardar, instantanea, reiniciar, restaurar } from './backend/bd';
import { sembrar, USUARIOS_DEMO as USUARIOS } from './backend/semilla';
import { atender, ErrorHttp } from './backend/servidor';

alSembrar(sembrar);

export const MODO_DEMO = true;
export const USUARIOS_DEMO = USUARIOS.map(({ rol, email, clave }) => ({ rol, email, clave }));

export async function enviar(metodo: string, ruta: string, cuerpo: unknown, token: string | null): Promise<{ estado: number; datos: Record<string, unknown> }> {
  await new Promise((r) => setTimeout(r, metodo === 'GET' ? 40 : 180)); // una pausa breve, como la de un servidor real
  const copia = metodo === 'GET' ? null : instantanea();
  try {
    const datos = atender(metodo, ruta, cuerpo, token);
    if (copia) guardar();
    return { estado: metodo === 'POST' ? 201 : 200, datos: JSON.parse(JSON.stringify(datos ?? {})) };
  } catch (e) {
    if (copia) restaurar(copia); // la operación falló a la mitad: no queda nada a medias
    if (e instanceof ErrorHttp) return { estado: e.estado, datos: { mensaje: e.message, ...(e.codigo ? { codigo: e.codigo } : {}) } };
    console.error(e);
    return { estado: 500, datos: { mensaje: 'Ocurrió un error inesperado. Inténtalo de nuevo.' } };
  }
}

export function irALogin(): void {
  if (!window.location.hash.startsWith('#/login')) window.location.hash = '#/login';
}

/** Dirección para abrir una pantalla en otra pestaña */
export const enlace = (ruta: string) => `${window.location.pathname}#${ruta}`;

/** Borra lo capturado y vuelve a los datos de ejemplo */
export function reiniciarDemo(): void {
  reiniciar();
  window.localStorage.removeItem('asa.token');
  window.location.hash = '#/login';
  window.location.reload();
}
