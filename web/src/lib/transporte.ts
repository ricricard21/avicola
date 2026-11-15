/**
 * Transporte hacia la API real (servidor NestJS).
 * La versión de demostración sustituye este archivo por un motor que corre en el navegador.
 */
export const MODO_DEMO = false;
export const USUARIOS_DEMO: { rol: string; email: string; clave: string }[] = [];

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

export async function enviar(metodo: string, ruta: string, cuerpo: unknown, token: string | null): Promise<{ estado: number; datos: Record<string, unknown> }> {
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    cache: 'no-store',
  });
  return { estado: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

export function irALogin(): void {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) window.location.assign('/login');
}

/** Dirección para abrir una pantalla en otra pestaña */
export const enlace = (ruta: string) => ruta;

export function reiniciarDemo(): void {}
