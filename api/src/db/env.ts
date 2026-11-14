import { readFileSync } from 'fs';
import { parseEnv } from 'util';

/**
 * Carga el archivo .env si existe. Las variables ya definidas en el entorno
 * (por ejemplo las del servicio en Railway) tienen prioridad.
 */
export function cargarEnv(): void {
  try {
    const variables = parseEnv(readFileSync('.env', 'utf8'));
    for (const [clave, valor] of Object.entries(variables)) {
      if (process.env[clave] === undefined) process.env[clave] = valor;
    }
  } catch {
    /* sin archivo .env */
  }
  process.env.TZ = process.env.TZ || 'America/Mexico_City';
}
