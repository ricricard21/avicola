import 'reflect-metadata';
import { cargarEnv } from './db/env';

cargarEnv(); // antes de importar la aplicación: los módulos leen process.env al cargarse

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

export function configurar(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.set('trust proxy', 1); // detrás del proxy de Railway, para limitar por IP real
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim()),
  });
  // Rechaza campos desconocidos y valida tipos en todas las peticiones
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }));
}

async function iniciar() {
  const secreto = process.env.JWT_SECRET ?? '';
  if (secreto.length < 24 || secreto.startsWith('cambia-esta-clave')) {
    if (process.env.NODE_ENV === 'production') throw new Error('Configura JWT_SECRET con una clave larga y aleatoria antes de publicar');
    new Logger('Seguridad').warn('JWT_SECRET usa el valor de ejemplo. Cámbialo antes de publicar.');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurar(app);
  const puerto = Number(process.env.PORT) || 4000;
  await app.listen(puerto, '0.0.0.0');
  new Logger('API').log(`Lista en el puerto ${puerto}`);
}

if (require.main === module) void iniciar();
