import { MigrationInterface, QueryRunner } from "typeorm";

export class Inicial1794691069687 implements MigrationInterface {
    name = 'Inicial1794691069687'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "sucursales" (
                "id" SERIAL NOT NULL,
                "nombre" character varying(120) NOT NULL,
                "direccion" character varying(240),
                "activa" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c2232960c9e458db5b18d35eeba" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "usuarios" (
                "id" SERIAL NOT NULL,
                "nombre" character varying(120) NOT NULL,
                "email" character varying(160) NOT NULL,
                "passwordHash" character varying(100) NOT NULL,
                "rol" character varying(20) NOT NULL,
                "sucursalId" integer,
                "permisosExtra" text array NOT NULL DEFAULT '{}',
                "permisosDenegados" text array NOT NULL DEFAULT '{}',
                "activo" boolean NOT NULL DEFAULT true,
                "ultimoAcceso" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_446adfc18b35418aac32ae0b7b" ON "usuarios" ("email")
        `);
        await queryRunner.query(`
            CREATE TABLE "bitacora" (
                "id" SERIAL NOT NULL,
                "usuarioId" integer,
                "usuarioNombre" character varying(120) NOT NULL,
                "accion" character varying(60) NOT NULL,
                "entidad" character varying(40) NOT NULL,
                "entidadId" character varying(40),
                "resumen" character varying(300),
                "detalle" jsonb,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e08eb7c81388757d9e53d62246e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4fb58db7db7268f5315fe402a3" ON "bitacora" ("createdAt")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ea6f369d61d21b45981cd91da3" ON "bitacora" ("entidad", "entidadId")
        `);
        await queryRunner.query(`
            CREATE TABLE "folios" (
                "serie" character varying(10) NOT NULL,
                "ultimo" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_0105ea660c747eba87bb028976a" PRIMARY KEY ("serie")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "clientes" (
                "id" SERIAL NOT NULL,
                "tipo" character varying(20) NOT NULL DEFAULT 'PROSPECTO',
                "nombre" character varying(160) NOT NULL,
                "telefono" character varying(30),
                "whatsapp" character varying(30),
                "email" character varying(160),
                "direccion" character varying(240),
                "municipio" character varying(120),
                "rfc" character varying(20),
                "etapa" character varying(20),
                "origen" character varying(60),
                "notas" text,
                "vendedorId" integer,
                "activo" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_fa1e326586a05f459771ac6ba8" ON "clientes" ("nombre")
        `);
        await queryRunner.query(`
            CREATE TABLE "seguimientos" (
                "id" SERIAL NOT NULL,
                "clienteId" integer NOT NULL,
                "usuarioId" integer,
                "tipo" character varying(20) NOT NULL DEFAULT 'NOTA',
                "nota" text NOT NULL,
                "proximaAccion" date,
                "completado" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_53f6ee6b1b536e84b9f46dcbe1e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9167076c1b71a6a8594c47a79f" ON "seguimientos" ("clienteId")
        `);
        await queryRunner.query(`
            CREATE TABLE "productos" (
                "id" SERIAL NOT NULL,
                "sku" character varying(30) NOT NULL,
                "nombre" character varying(160) NOT NULL,
                "categoria" character varying(20) NOT NULL,
                "unidad" character varying(30) NOT NULL DEFAULT 'pieza',
                "precio" numeric(12, 2) NOT NULL DEFAULT '0',
                "stockMinimo" numeric(12, 2) NOT NULL DEFAULT '0',
                "diasAlerta" integer NOT NULL DEFAULT '3',
                "activo" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_04f604609a0949a7f3b43400766" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_805687bf24c1411756fbd37b2f" ON "productos" ("sku")
        `);
        await queryRunner.query(`
            CREATE TABLE "lotes" (
                "id" SERIAL NOT NULL,
                "codigo" character varying(30) NOT NULL,
                "productoId" integer NOT NULL,
                "sucursalId" integer NOT NULL,
                "ubicacion" character varying(80),
                "cantidadFisica" numeric(12, 2) NOT NULL DEFAULT '0',
                "cantidadReservada" numeric(12, 2) NOT NULL DEFAULT '0',
                "costoUnitario" numeric(12, 2) NOT NULL DEFAULT '0',
                "fechaIngreso" date NOT NULL,
                "fechaLimiteVenta" date,
                "notas" character varying(240),
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6eda564423c09706b95cbf8ae1c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_1133e9609408cfef2daaeee78c" ON "lotes" ("codigo")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_16c9a048884f6328c4f5db9226" ON "lotes" ("productoId")
        `);
        await queryRunner.query(`
            CREATE TABLE "movimientos" (
                "id" SERIAL NOT NULL,
                "loteId" integer NOT NULL,
                "productoId" integer NOT NULL,
                "tipo" character varying(20) NOT NULL,
                "cantidad" numeric(12, 2) NOT NULL DEFAULT '0',
                "saldoFisico" numeric(12, 2) NOT NULL DEFAULT '0',
                "saldoReservado" numeric(12, 2) NOT NULL DEFAULT '0',
                "referencia" character varying(40),
                "motivo" character varying(240),
                "usuarioId" integer,
                "usuarioNombre" character varying(120),
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_519702aa97def3e7c1b6cc5e2f9" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_912f742e4db4f34e473027a289" ON "movimientos" ("loteId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bb83d42e45a0025561edbf6652" ON "movimientos" ("productoId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9c872c009bd17fb59daaff5340" ON "movimientos" ("createdAt")
        `);
        await queryRunner.query(`
            CREATE TABLE "pedidos" (
                "id" SERIAL NOT NULL,
                "folio" character varying(20) NOT NULL,
                "folioCotizacion" character varying(20),
                "estado" character varying(20) NOT NULL,
                "estadoPrevio" character varying(20),
                "clienteId" integer NOT NULL,
                "vendedorId" integer,
                "sucursalId" integer NOT NULL,
                "fechaEntrega" date,
                "fechaVencimiento" date,
                "subtotal" numeric(12, 2) NOT NULL DEFAULT '0',
                "descuento" numeric(12, 2) NOT NULL DEFAULT '0',
                "total" numeric(12, 2) NOT NULL DEFAULT '0',
                "pagado" numeric(12, 2) NOT NULL DEFAULT '0',
                "notas" text,
                "incidencia" text,
                "recibidoPor" character varying(120),
                "motivoCancelacion" character varying(240),
                "confirmadoAt" TIMESTAMP WITH TIME ZONE,
                "entregadoAt" TIMESTAMP WITH TIME ZONE,
                "canceladoAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ebb5680ed29a24efdc586846725" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_0c97ad4c89d8580060309a6569" ON "pedidos" ("folio")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_668fe658cebb5b8d3a7d7c7fb5" ON "pedidos" ("estado")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_485346a40b61bb8ae3a98f5400" ON "pedidos" ("clienteId")
        `);
        await queryRunner.query(`
            CREATE TABLE "pedido_items" (
                "id" SERIAL NOT NULL,
                "pedidoId" integer NOT NULL,
                "productoId" integer NOT NULL,
                "descripcion" character varying(200) NOT NULL,
                "cantidad" numeric(12, 2) NOT NULL DEFAULT '0',
                "precioUnitario" numeric(12, 2) NOT NULL DEFAULT '0',
                "importe" numeric(12, 2) NOT NULL DEFAULT '0',
                "cantidadReservada" numeric(12, 2) NOT NULL DEFAULT '0',
                CONSTRAINT "PK_f8fa1d930ff13073bc34571ba9d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4d42a5b92665897ad4cad91fc0" ON "pedido_items" ("pedidoId")
        `);
        await queryRunner.query(`
            CREATE TABLE "reservas" (
                "id" SERIAL NOT NULL,
                "pedidoItemId" integer NOT NULL,
                "loteId" integer NOT NULL,
                "cantidad" numeric(12, 2) NOT NULL DEFAULT '0',
                "surtida" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_309c659053bcf5e56f8e40a2b42" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_5b2c8f741ac8324725fc17c738" ON "reservas" ("pedidoItemId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b6ba0aea66285f88d87ce21c86" ON "reservas" ("loteId")
        `);
        await queryRunner.query(`
            CREATE TABLE "pagos" (
                "id" SERIAL NOT NULL,
                "folio" character varying(20) NOT NULL,
                "clienteId" integer NOT NULL,
                "pedidoId" integer NOT NULL,
                "monto" numeric(12, 2) NOT NULL DEFAULT '0',
                "metodo" character varying(20) NOT NULL,
                "referencia" character varying(80),
                "fecha" TIMESTAMP WITH TIME ZONE NOT NULL,
                "notas" character varying(240),
                "usuarioId" integer,
                "usuarioNombre" character varying(120),
                "cancelado" boolean NOT NULL DEFAULT false,
                "motivoCancelacion" character varying(240),
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_37321ca70a2ed50885dc205beb2" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_d1b47b27abf2ae76fe72e3bd6b" ON "pagos" ("folio")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_fb47de64de1680202893119163" ON "pagos" ("clienteId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_d1513a401feff80352ea6e6f62" ON "pagos" ("pedidoId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_107e2809e31d7d04db9629608e" ON "pagos" ("fecha")
        `);
        await queryRunner.query(`
            CREATE TABLE "pollitandas" (
                "id" SERIAL NOT NULL,
                "nombre" character varying(120) NOT NULL,
                "descripcion" text,
                "productoId" integer NOT NULL,
                "sucursalId" integer NOT NULL,
                "pollitosPorPaquete" integer NOT NULL,
                "precioPaquete" numeric(12, 2) NOT NULL DEFAULT '0',
                "anticipoMinimo" numeric(12, 2) NOT NULL DEFAULT '0',
                "cupoPaquetes" integer NOT NULL,
                "fechaCierre" date,
                "fechaEntrega" date NOT NULL,
                "preventa" boolean NOT NULL DEFAULT false,
                "estado" character varying(20) NOT NULL DEFAULT 'ABIERTA',
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6d2ede99ebbad1374cdf52e47b4" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "inscripciones" (
                "id" SERIAL NOT NULL,
                "folio" character varying(20) NOT NULL,
                "pollitandaId" integer NOT NULL,
                "clienteId" integer NOT NULL,
                "paquetes" integer NOT NULL,
                "cantidadPollitos" integer NOT NULL,
                "pedidoId" integer NOT NULL,
                "notas" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_1a882b6ec840cf6342da69f2da" UNIQUE ("pedidoId"),
                CONSTRAINT "PK_17a12f6ab342f6762d81e940d19" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e13891ed516b91fd9f88a1b28b" ON "inscripciones" ("folio")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_85da6075ef4ba10813b28be4a9" ON "inscripciones" ("pollitandaId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_21882d1f384e2f437ca92c84ff" ON "inscripciones" ("clienteId")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_1a882b6ec840cf6342da69f2da" ON "inscripciones" ("pedidoId")
        `);
        await queryRunner.query(`
            CREATE TABLE "notificaciones" (
                "id" SERIAL NOT NULL,
                "canal" character varying(20) NOT NULL DEFAULT 'WHATSAPP',
                "clienteId" integer,
                "destinatario" character varying(30),
                "plantilla" character varying(40) NOT NULL,
                "mensaje" text NOT NULL,
                "estado" character varying(20) NOT NULL DEFAULT 'PENDIENTE',
                "referencia" character varying(40),
                "error" character varying(240),
                "enviadaAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_a9d32a419ff58b53a38b5ef85d4" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e1fc5e910fca3d7ed1daae7c97" ON "notificaciones" ("estado")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bbc1c577ee93a7871b5392c525" ON "notificaciones" ("plantilla", "referencia")
        `);
        await queryRunner.query(`
            ALTER TABLE "usuarios"
            ADD CONSTRAINT "FK_5a3c397599fbf0c74f08a2863ff" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "clientes"
            ADD CONSTRAINT "FK_b1fc25559c842a3e366f03099d5" FOREIGN KEY ("vendedorId") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "seguimientos"
            ADD CONSTRAINT "FK_9167076c1b71a6a8594c47a79f2" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "seguimientos"
            ADD CONSTRAINT "FK_9f964358646f43462f9bf3234b8" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lotes"
            ADD CONSTRAINT "FK_16c9a048884f6328c4f5db9226e" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lotes"
            ADD CONSTRAINT "FK_34e752970f1b16cb71b28f34085" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "movimientos"
            ADD CONSTRAINT "FK_912f742e4db4f34e473027a2891" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pedidos"
            ADD CONSTRAINT "FK_485346a40b61bb8ae3a98f5400c" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pedidos"
            ADD CONSTRAINT "FK_ab8ce24ae42c28dc36716bb8054" FOREIGN KEY ("vendedorId") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pedidos"
            ADD CONSTRAINT "FK_aaa493727d8b3723eee84b39e5b" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pedido_items"
            ADD CONSTRAINT "FK_4d42a5b92665897ad4cad91fc09" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pedido_items"
            ADD CONSTRAINT "FK_1e4e1c746f31d52659cbe1ec63a" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "reservas"
            ADD CONSTRAINT "FK_5b2c8f741ac8324725fc17c738f" FOREIGN KEY ("pedidoItemId") REFERENCES "pedido_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "reservas"
            ADD CONSTRAINT "FK_b6ba0aea66285f88d87ce21c86d" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pagos"
            ADD CONSTRAINT "FK_fb47de64de16802028931191639" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pagos"
            ADD CONSTRAINT "FK_d1513a401feff80352ea6e6f624" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pollitandas"
            ADD CONSTRAINT "FK_4c94e85bd1acd2eb2903073cd65" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "pollitandas"
            ADD CONSTRAINT "FK_33093f8b8422ded27a0f67119f4" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "inscripciones"
            ADD CONSTRAINT "FK_85da6075ef4ba10813b28be4a95" FOREIGN KEY ("pollitandaId") REFERENCES "pollitandas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "inscripciones"
            ADD CONSTRAINT "FK_21882d1f384e2f437ca92c84ff2" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "inscripciones"
            ADD CONSTRAINT "FK_1a882b6ec840cf6342da69f2da3" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "notificaciones"
            ADD CONSTRAINT "FK_382acc7722d27b2b52acb406048" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "notificaciones" DROP CONSTRAINT "FK_382acc7722d27b2b52acb406048"
        `);
        await queryRunner.query(`
            ALTER TABLE "inscripciones" DROP CONSTRAINT "FK_1a882b6ec840cf6342da69f2da3"
        `);
        await queryRunner.query(`
            ALTER TABLE "inscripciones" DROP CONSTRAINT "FK_21882d1f384e2f437ca92c84ff2"
        `);
        await queryRunner.query(`
            ALTER TABLE "inscripciones" DROP CONSTRAINT "FK_85da6075ef4ba10813b28be4a95"
        `);
        await queryRunner.query(`
            ALTER TABLE "pollitandas" DROP CONSTRAINT "FK_33093f8b8422ded27a0f67119f4"
        `);
        await queryRunner.query(`
            ALTER TABLE "pollitandas" DROP CONSTRAINT "FK_4c94e85bd1acd2eb2903073cd65"
        `);
        await queryRunner.query(`
            ALTER TABLE "pagos" DROP CONSTRAINT "FK_d1513a401feff80352ea6e6f624"
        `);
        await queryRunner.query(`
            ALTER TABLE "pagos" DROP CONSTRAINT "FK_fb47de64de16802028931191639"
        `);
        await queryRunner.query(`
            ALTER TABLE "reservas" DROP CONSTRAINT "FK_b6ba0aea66285f88d87ce21c86d"
        `);
        await queryRunner.query(`
            ALTER TABLE "reservas" DROP CONSTRAINT "FK_5b2c8f741ac8324725fc17c738f"
        `);
        await queryRunner.query(`
            ALTER TABLE "pedido_items" DROP CONSTRAINT "FK_1e4e1c746f31d52659cbe1ec63a"
        `);
        await queryRunner.query(`
            ALTER TABLE "pedido_items" DROP CONSTRAINT "FK_4d42a5b92665897ad4cad91fc09"
        `);
        await queryRunner.query(`
            ALTER TABLE "pedidos" DROP CONSTRAINT "FK_aaa493727d8b3723eee84b39e5b"
        `);
        await queryRunner.query(`
            ALTER TABLE "pedidos" DROP CONSTRAINT "FK_ab8ce24ae42c28dc36716bb8054"
        `);
        await queryRunner.query(`
            ALTER TABLE "pedidos" DROP CONSTRAINT "FK_485346a40b61bb8ae3a98f5400c"
        `);
        await queryRunner.query(`
            ALTER TABLE "movimientos" DROP CONSTRAINT "FK_912f742e4db4f34e473027a2891"
        `);
        await queryRunner.query(`
            ALTER TABLE "lotes" DROP CONSTRAINT "FK_34e752970f1b16cb71b28f34085"
        `);
        await queryRunner.query(`
            ALTER TABLE "lotes" DROP CONSTRAINT "FK_16c9a048884f6328c4f5db9226e"
        `);
        await queryRunner.query(`
            ALTER TABLE "seguimientos" DROP CONSTRAINT "FK_9f964358646f43462f9bf3234b8"
        `);
        await queryRunner.query(`
            ALTER TABLE "seguimientos" DROP CONSTRAINT "FK_9167076c1b71a6a8594c47a79f2"
        `);
        await queryRunner.query(`
            ALTER TABLE "clientes" DROP CONSTRAINT "FK_b1fc25559c842a3e366f03099d5"
        `);
        await queryRunner.query(`
            ALTER TABLE "usuarios" DROP CONSTRAINT "FK_5a3c397599fbf0c74f08a2863ff"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_bbc1c577ee93a7871b5392c525"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e1fc5e910fca3d7ed1daae7c97"
        `);
        await queryRunner.query(`
            DROP TABLE "notificaciones"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1a882b6ec840cf6342da69f2da"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_21882d1f384e2f437ca92c84ff"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_85da6075ef4ba10813b28be4a9"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e13891ed516b91fd9f88a1b28b"
        `);
        await queryRunner.query(`
            DROP TABLE "inscripciones"
        `);
        await queryRunner.query(`
            DROP TABLE "pollitandas"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_107e2809e31d7d04db9629608e"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_d1513a401feff80352ea6e6f62"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_fb47de64de1680202893119163"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_d1b47b27abf2ae76fe72e3bd6b"
        `);
        await queryRunner.query(`
            DROP TABLE "pagos"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_b6ba0aea66285f88d87ce21c86"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_5b2c8f741ac8324725fc17c738"
        `);
        await queryRunner.query(`
            DROP TABLE "reservas"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4d42a5b92665897ad4cad91fc0"
        `);
        await queryRunner.query(`
            DROP TABLE "pedido_items"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_485346a40b61bb8ae3a98f5400"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_668fe658cebb5b8d3a7d7c7fb5"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_0c97ad4c89d8580060309a6569"
        `);
        await queryRunner.query(`
            DROP TABLE "pedidos"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9c872c009bd17fb59daaff5340"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_bb83d42e45a0025561edbf6652"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_912f742e4db4f34e473027a289"
        `);
        await queryRunner.query(`
            DROP TABLE "movimientos"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_16c9a048884f6328c4f5db9226"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1133e9609408cfef2daaeee78c"
        `);
        await queryRunner.query(`
            DROP TABLE "lotes"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_805687bf24c1411756fbd37b2f"
        `);
        await queryRunner.query(`
            DROP TABLE "productos"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9167076c1b71a6a8594c47a79f"
        `);
        await queryRunner.query(`
            DROP TABLE "seguimientos"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_fa1e326586a05f459771ac6ba8"
        `);
        await queryRunner.query(`
            DROP TABLE "clientes"
        `);
        await queryRunner.query(`
            DROP TABLE "folios"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ea6f369d61d21b45981cd91da3"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4fb58db7db7268f5315fe402a3"
        `);
        await queryRunner.query(`
            DROP TABLE "bitacora"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_446adfc18b35418aac32ae0b7b"
        `);
        await queryRunner.query(`
            DROP TABLE "usuarios"
        `);
        await queryRunner.query(`
            DROP TABLE "sucursales"
        `);
    }

}
