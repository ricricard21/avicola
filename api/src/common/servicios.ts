import { Global, Injectable, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Bitacora, Folio, Usuario } from '../db/entities';
import { Sesion } from './seguridad';

/** Series de folios consecutivos del sistema */
export type Serie = 'PSA' | 'COT' | 'REC' | 'PT' | 'LOT';

@Injectable()
export class FolioService {
  /**
   * Devuelve el siguiente folio de la serie (p. ej. PSA-000125).
   * Debe llamarse dentro de una transacción: el UPSERT bloquea la fila, así
   * dos ventas simultáneas nunca reciben el mismo número.
   */
  async siguiente(em: EntityManager, serie: Serie): Promise<string> {
    const filas: { ultimo: number }[] = await em.query(
      `INSERT INTO folios (serie, ultimo) VALUES ($1, 1)
       ON CONFLICT (serie) DO UPDATE SET ultimo = folios.ultimo + 1
       RETURNING ultimo`,
      [serie],
    );
    return `${serie}-${String(filas[0].ultimo).padStart(6, '0')}`;
  }
}

@Injectable()
export class BitacoraService {
  constructor(private readonly ds: DataSource) {}

  /** Registra quién hizo qué. Nunca interrumpe la operación principal. */
  async registrar(
    sesion: Pick<Sesion, 'id' | 'nombre'> | null,
    accion: string,
    entidad: string,
    entidadId: string | number | null,
    resumen?: string,
    detalle?: Record<string, unknown>,
    em?: EntityManager,
  ): Promise<void> {
    const repo = (em ?? this.ds.manager).getRepository(Bitacora);
    try {
      await repo.insert({
        usuarioId: sesion?.id ?? null,
        usuarioNombre: sesion?.nombre ?? 'Sistema',
        accion,
        entidad,
        entidadId: entidadId === null ? null : String(entidadId),
        resumen: resumen?.slice(0, 300) ?? null,
        detalle: (detalle ?? null) as never,
      });
    } catch (e) {
      if (em) throw e; // dentro de una transacción el error debe propagarse
    }
  }
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, Bitacora, Folio]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: (process.env.JWT_EXPIRA || '10h') as never },
      }),
    }),
  ],
  providers: [FolioService, BitacoraService],
  exports: [FolioService, BitacoraService, JwtModule, TypeOrmModule],
})
export class ComunModule {}
