/** Punto de entrada para la CLI de TypeORM (generar y correr migraciones). */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { cargarEnv } from './env';

cargarEnv();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { opcionesBD } = require('./opciones');

export default new DataSource({ ...opcionesBD(), migrationsRun: false });
