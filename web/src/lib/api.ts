'use client';

import useSWR, { mutate as mutarGlobal, SWRConfiguration } from 'swr';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const CLAVE_TOKEN = 'asa.token';

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
    readonly codigo?: string,
  ) {
    super(mensaje);
  }
}

export const sesionLocal = {
  leer: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(CLAVE_TOKEN)),
  guardar: (token: string) => window.localStorage.setItem(CLAVE_TOKEN, token),
  borrar: () => window.localStorage.removeItem(CLAVE_TOKEN),
};

/** Llamada a la API con la sesión del usuario. Lanza ErrorApi con el mensaje listo para mostrarse. */
export async function api<T = unknown>(ruta: string, opciones: { metodo?: 'GET' | 'POST' | 'PATCH'; cuerpo?: unknown } = {}): Promise<T> {
  const token = sesionLocal.leer();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
      headers: {
        ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ErrorApi('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.', 0);
  }
  if (respuesta.status === 401 && !ruta.startsWith('/auth/login')) {
    sesionLocal.borrar();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) window.location.assign('/login');
  }
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new ErrorApi(datos.mensaje || 'Ocurrió un error inesperado', respuesta.status, datos.codigo);
  return datos as T;
}

/** Lectura con caché y actualización automática. Pasar null para no consultar todavía. */
export function useApi<T>(ruta: string | null, config?: SWRConfiguration<T, ErrorApi>) {
  return useSWR<T, ErrorApi>(ruta, (r: string) => api<T>(r), { revalidateOnFocus: true, keepPreviousData: true, ...config });
}

/** Después de una operación, refresca todo lo que dependa de los módulos indicados (p. ej. 'pedidos', 'inventario'). */
export function refrescar(...prefijos: string[]) {
  return mutarGlobal((clave) => typeof clave === 'string' && prefijos.some((p) => clave.startsWith(`/${p}`)), undefined, { revalidate: true });
}

/** Todo lo que puede cambiar cuando se mueve un pedido, un pago o el inventario */
export const refrescarOperacion = () => refrescar('pedidos', 'pagos', 'cobranza', 'inventario', 'pollitandas', 'dashboard', 'clientes', 'notificaciones', 'reportes');

export function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado';
}
