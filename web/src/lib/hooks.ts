'use client';

import { useEffect, useState } from 'react';

/** Devuelve el valor con retraso, para no consultar al servidor en cada tecla */
export function useRetardo<T>(valor: T, ms = 300): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

/** Arma una ruta con parámetros, omitiendo los vacíos */
export function conParametros(ruta: string, parametros: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) {
    if (v !== null && v !== undefined && v !== '' && v !== false) q.set(k, v === true ? '1' : String(v));
  }
  const texto = q.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}
