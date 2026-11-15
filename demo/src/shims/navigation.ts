/**
 * Sustituto de next/navigation para la demostración. La ruta vive después del "#"
 * (por ejemplo …/index.html#/ventas/12), así funciona en cualquier hosting estático
 * y en cualquier subcarpeta, sin configurar nada en el servidor.
 */
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

const suscribir = (aviso: () => void) => {
  window.addEventListener('hashchange', aviso);
  return () => window.removeEventListener('hashchange', aviso);
};
const leerHash = () => window.location.hash;

export function useUbicacion() {
  const hash = useSyncExternalStore(suscribir, leerHash);
  return useMemo(() => {
    const [ruta, consulta = ''] = (hash.slice(1) || '/').split('?');
    return { pathname: ruta.length > 1 ? ruta.replace(/\/$/, '') : '/', search: consulta };
  }, [hash]);
}

const enrutador = {
  push: (ruta: string) => void (window.location.hash = ruta),
  replace: (ruta: string) => window.location.replace(`#${ruta}`),
  back: () => window.history.back(),
};
export const useRouter = () => enrutador;
export const usePathname = () => useUbicacion().pathname;
export function useSearchParams() {
  const { search } = useUbicacion();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export const ContextoParametros = createContext<Record<string, string>>({});
export const useParams = <T extends Record<string, string>>() => useContext(ContextoParametros) as T;
