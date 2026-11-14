import { types } from 'pg';
import { DataSourceOptions } from 'typeorm';
import { ENTIDADES } from './entities';
import { MIGRACIONES } from './migrations';

// Las columnas DATE (fecha sin hora) viajan como texto 'YYYY-MM-DD'. Convertirlas a Date
// las movería de día según la zona horaria del servidor.
types.setTypeParser(types.builtins.DATE, (valor: string) => valor);

export function opcionesBD(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta la variable DATABASE_URL');
  return {
    type: 'postgres',
    url,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: ENTIDADES,
    migrations: MIGRACIONES,
    // El esquema solo cambia mediante migraciones; se aplican solas al arrancar.
    synchronize: false,
    migrationsRun: true,
    logging: process.env.DB_LOG === 'true' ? ['query', 'error'] : ['error'],
  };
}
