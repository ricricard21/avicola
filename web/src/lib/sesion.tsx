'use client';

import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { mutate } from 'swr';
import { sesionLocal, useApi } from './api';
import type { Usuario } from './tipos';

interface Sesion {
  usuario: Usuario;
  /** true si el usuario tiene al menos uno de los permisos */
  puede: (...permisos: string[]) => boolean;
  salir: () => void;
}

const Contexto = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [hayToken, setHayToken] = useState<boolean | null>(null);

  useEffect(() => {
    const token = sesionLocal.leer();
    setHayToken(!!token);
    if (!token) router.replace('/login');
  }, [router]);

  const { data: usuario } = useApi<Usuario>(hayToken ? '/auth/yo' : null, { revalidateOnFocus: true });

  const salir = useCallback(() => {
    sesionLocal.borrar();
    void mutate(() => true, undefined, { revalidate: false }); // no dejar datos de un usuario a la vista del siguiente
    router.replace('/login');
  }, [router]);

  const valor = useMemo<Sesion | null>(
    () => (usuario ? { usuario, puede: (...p) => p.some((x) => usuario.permisos.includes(x)), salir } : null),
    [usuario, salir],
  );

  if (!valor) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="esqueleto size-12 rounded-2xl" aria-label="Cargando" />
      </div>
    );
  }
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return c;
}

/* ------------------------------ Tema día / noche ------------------------------ */

export type Tema = 'dia' | 'noche';

export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>('dia');
  useEffect(() => {
    setTema((document.documentElement.dataset.tema as Tema) || 'dia');
  }, []);
  const alternar = useCallback(() => {
    setTema((actual) => {
      const nuevo: Tema = actual === 'dia' ? 'noche' : 'dia';
      document.documentElement.dataset.tema = nuevo;
      try {
        window.localStorage.setItem('asa.tema', nuevo);
      } catch {
        /* almacenamiento no disponible */
      }
      return nuevo;
    });
  }, []);
  return [tema, alternar];
}
