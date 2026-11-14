/**
 * Datos iniciales.
 *
 *   npm run db:seed                → datos de DEMOSTRACIÓN (para presentar y capacitar)
 *   npm run db:seed -- --minimo    → solo la sucursal y el usuario director (arranque real)
 *   npm run db:seed -- --forzar    → borra TODO lo existente antes de sembrar
 *
 * La demostración se genera usando los mismos servicios que la aplicación,
 * por lo que inventario, reservas, pagos y saldos quedan cuadrados.
 */
import 'reflect-metadata';
import { cargarEnv } from './env';

cargarEnv();
process.env.RECORDATORIOS_AUTOMATICOS = 'false';

import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ClientesService } from '../clientes/clientes.service';
import { permisosEfectivos } from '../common/permisos';
import { Sesion } from '../common/seguridad';
import { hoy, sumarDias } from '../common/util';
import { InventarioService } from '../inventario/inventario.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PagosService } from '../pagos/pagos.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { PollitandasService } from '../pollitandas/pollitandas.service';
import { Categoria, MetodoPago, Producto, Rol, Sucursal, TipoCliente, Usuario } from './entities';

const CLAVE_DEMO = 'Avicola2026';

async function sembrar() {
  const args = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);

  try {
    const existentes = await ds.getRepository(Usuario).count();
    if (existentes > 0) {
      if (!args.includes('--forzar')) {
        console.log('La base ya tiene datos. Usa "--forzar" para borrarla y volver a sembrar.');
        return;
      }
      const tablas = ds.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
      await ds.query(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE`);
      console.log('Base vaciada.');
    }

    if (args.includes('--minimo')) await sembrarMinimo(ds);
    else await sembrarDemo(app, ds);
  } finally {
    await app.close();
  }
}

/* ------------------------------------------------------------------ */
/*  Arranque real: una sucursal y el usuario director                  */
/* ------------------------------------------------------------------ */

async function sembrarMinimo(ds: DataSource) {
  const email = (process.env.ADMIN_EMAIL || 'direccion@avicolasanangel.com').toLowerCase();
  const clave = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
  await ds.getRepository(Sucursal).save({ nombre: 'Matriz' });
  await ds.getRepository(Usuario).save({
    nombre: process.env.ADMIN_NOMBRE || 'Dirección general',
    email,
    passwordHash: await bcrypt.hash(clave, 10),
    rol: 'DIRECTOR',
    sucursalId: null,
  });
  console.log(`\nUsuario director creado:\n  correo:     ${email}\n  contraseña: ${clave}\nCámbiala al entrar (menú de usuario → Cambiar contraseña).\n`);
}

/* ------------------------------------------------------------------ */
/*  Demostración                                                       */
/* ------------------------------------------------------------------ */

async function sembrarDemo(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>, ds: DataSource) {
  const inventario = app.get(InventarioService);
  const pedidos = app.get(PedidosService);
  const pagos = app.get(PagosService);
  const pollitandas = app.get(PollitandasService);
  const clientesSrv = app.get(ClientesService);
  const notificaciones = app.get(NotificacionesService);
  const dia = hoy();

  /* Sucursales y usuarios */
  const [matriz, centro] = await ds.getRepository(Sucursal).save([
    { nombre: 'Granja San Ángel (matriz)', direccion: 'Instalaciones de la granja' },
    { nombre: 'Punto de venta Centro', direccion: 'Local de venta al público' },
  ]);
  const hash = await bcrypt.hash(CLAVE_DEMO, 10);
  const equipo: { nombre: string; email: string; rol: Rol; sucursalId: number | null }[] = [
    { nombre: 'Dirección General', email: 'direccion@avicolasanangel.com', rol: 'DIRECTOR', sucursalId: null },
    { nombre: 'Mariana López', email: 'ventas@avicolasanangel.com', rol: 'VENTAS', sucursalId: null },
    { nombre: 'Luis Hernández', email: 'almacen@avicolasanangel.com', rol: 'INVENTARIO', sucursalId: null },
    { nombre: 'Patricia Gómez', email: 'cobranza@avicolasanangel.com', rol: 'COBRANZA', sucursalId: null },
    { nombre: 'Raúl Mendoza', email: 'logistica@avicolasanangel.com', rol: 'LOGISTICA', sucursalId: null },
    { nombre: 'José Ortiz', email: 'granja@avicolasanangel.com', rol: 'GRANJA', sucursalId: matriz.id },
  ];
  const usuarios = await ds.getRepository(Usuario).save(equipo.map((u) => ({ ...u, passwordHash: hash })));
  const sesion = (rol: Rol): Sesion => {
    const u = usuarios.find((x) => x.rol === rol)!;
    return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sucursalId: u.sucursalId, permisos: permisosEfectivos(u.rol) };
  };
  const director = sesion('DIRECTOR');
  const ventas = { ...sesion('VENTAS'), permisos: director.permisos }; // la demo registra todo a nombre de la vendedora
  const almacen = sesion('INVENTARIO');
  const cobranza = sesion('COBRANZA');
  const logistica = sesion('LOGISTICA');

  /* Catálogo */
  const catalogo: [string, string, Categoria, string, number, number, number][] = [
    ['HUE-BCO-360', 'Huevo blanco · caja 360 pzas', 'HUEVO', 'caja', 780, 20, 4],
    ['HUE-ROJ-360', 'Huevo rojo · caja 360 pzas', 'HUEVO', 'caja', 840, 10, 4],
    ['HUE-BCO-030', 'Huevo blanco · cartera 30 pzas', 'HUEVO', 'cartera', 72, 60, 4],
    ['POL-ENG-01', 'Pollito de engorda (1 día)', 'POLLITO', 'pollito', 17.5, 200, 2],
    ['POL-PON-01', 'Pollita ponedora (1 día)', 'POLLITO', 'pollita', 32, 100, 2],
    ['AVE-POS-18', 'Gallina de postura (18 semanas)', 'AVE', 'ave', 185, 30, 7],
    ['ALI-INI-40', 'Alimento iniciador · bulto 40 kg', 'ALIMENTO', 'bulto', 520, 15, 15],
    ['ALI-POS-40', 'Alimento postura · bulto 40 kg', 'ALIMENTO', 'bulto', 468, 20, 15],
    ['EMP-CON-100', 'Cono de cartón 30 pzas · paca 100', 'EMPAQUE', 'paca', 145, 10, 0],
    ['EMP-CAJ-360', 'Caja de cartón para 360 pzas', 'EMPAQUE', 'pieza', 18, 100, 0],
    ['INS-VIT-100', 'Vitaminas + electrolitos · sobre 100 g', 'INSUMO', 'sobre', 65, 20, 30],
  ];
  const productos = await ds.getRepository(Producto).save(
    catalogo.map(([sku, nombre, categoria, unidad, precio, stockMinimo, diasAlerta]) => ({ sku, nombre, categoria, unidad, precio, stockMinimo, diasAlerta })),
  );
  const P = (sku: string) => productos.find((p) => p.sku === sku)!.id;

  /* Entradas de inventario (lotes) */
  const lotes: [string, number, number, string, number, number | null][] = [
    // sku, cantidad, costo, ubicación, ingreso (días atrás), vigencia (días desde hoy)
    ['HUE-BCO-360', 90, 610, 'Cámara 1', 12, 9],
    ['HUE-BCO-360', 60, 615, 'Cámara 1', 3, 18],
    ['HUE-ROJ-360', 34, 660, 'Cámara 2', 6, 15],
    ['HUE-BCO-030', 140, 55, 'Anaquel A', 9, 2],
    ['HUE-BCO-030', 200, 56, 'Anaquel A', 2, 19],
    ['POL-ENG-01', 500, 11, 'Nacedora 2', 1, null],
    ['AVE-POS-18', 58, 140, 'Galpón 3', 20, null],
    ['ALI-INI-40', 14, 430, 'Bodega', 15, 75],
    ['ALI-POS-40', 46, 390, 'Bodega', 15, 75],
    ['EMP-CON-100', 28, 110, 'Bodega', 30, null],
    ['EMP-CAJ-360', 420, 12, 'Bodega', 30, null],
    ['INS-VIT-100', 55, 41, 'Farmacia', 25, 240],
  ];
  for (const [sku, cantidad, costoUnitario, ubicacion, atras, vigencia] of lotes) {
    await inventario.entrada(almacen, {
      productoId: P(sku),
      sucursalId: matriz.id,
      cantidad,
      costoUnitario,
      ubicacion,
      fechaIngreso: sumarDias(dia, -atras),
      fechaLimiteVenta: vigencia === null ? undefined : sumarDias(dia, vigencia),
    });
  }

  /* Clientes (teléfonos ficticios) */
  const cartera: [string, TipoCliente, string, string][] = [
    ['Abarrotes La Esperanza', 'DISTRIBUIDOR', '5550100101', 'Mercado municipal, local 14'],
    ['Tortillería y Pollería El Gallo', 'DISTRIBUIDOR', '5550100102', 'Av. Reforma 210'],
    ['Restaurante Doña Lupita', 'CLIENTE', '5550100103', 'Calle 5 de Mayo 48'],
    ['María Fernanda Ruiz', 'CLIENTE', '5550100104', 'Col. San Rafael'],
    ['Juan Carlos Pérez', 'CLIENTE', '5550100105', 'Rancho El Mirador'],
    ['Rosa Elena Martínez', 'CLIENTE', '5550100106', 'Col. Las Flores'],
    ['Granja Familiar Los Tres Hermanos', 'CLIENTE', '5550100107', 'Camino a San Lorenzo km 3'],
    ['Miguel Ángel Torres', 'CLIENTE', '5550100108', 'Col. Aviación'],
    ['Panadería San José', 'PROSPECTO', '5550100109', 'Calle Hidalgo 77'],
    ['Minisúper El Ahorro', 'PROSPECTO', '5550100110', 'Blvd. Principal 1500'],
    ['Guadalupe Sánchez', 'PROSPECTO', '5550100111', 'Col. El Carmen'],
    ['Comedor Industrial Santa Fe', 'PROSPECTO', '5550100112', 'Parque industrial, nave 8'],
  ];
  const C: Record<string, number> = {};
  for (const [nombre, tipo, telefono, direccion] of cartera) {
    const c = await clientesSrv.crear(ventas, { nombre, tipo, telefono, whatsapp: telefono, direccion, origen: tipo === 'PROSPECTO' ? 'Recomendación' : 'Mostrador' });
    C[nombre] = c.id;
  }

  /* Pedidos. Cada uno: cliente, renglones, hace cuántos días, hasta qué estado llegó y qué se cobró */
  type Demo = {
    cliente: string;
    items: [string, number][];
    atras: number;
    hasta: 'COTIZACION' | 'RECIBIDO' | 'PREPARADO' | 'EN_RUTA' | 'ENTREGADO' | 'INCIDENCIA';
    entrega?: number; // días desde hoy (negativo = pasado)
    vence?: number;
    pago?: [number, MetodoPago] | 'total';
    nota?: string;
  };
  const demo: Demo[] = [
    { cliente: 'Abarrotes La Esperanza', items: [['HUE-BCO-360', 10]], atras: 13, hasta: 'ENTREGADO', entrega: -12, pago: 'total' },
    { cliente: 'Restaurante Doña Lupita', items: [['HUE-ROJ-360', 3], ['HUE-BCO-030', 10]], atras: 12, hasta: 'ENTREGADO', entrega: -11, pago: 'total' },
    { cliente: 'Tortillería y Pollería El Gallo', items: [['HUE-BCO-360', 8], ['EMP-CON-100', 2]], atras: 10, hasta: 'ENTREGADO', entrega: -9, vence: -4, pago: [3000, 'TRANSFERENCIA'] },
    { cliente: 'Juan Carlos Pérez', items: [['ALI-POS-40', 6], ['INS-VIT-100', 4]], atras: 9, hasta: 'ENTREGADO', entrega: -9, pago: 'total' },
    { cliente: 'Abarrotes La Esperanza', items: [['HUE-BCO-360', 12], ['HUE-BCO-030', 30]], atras: 7, hasta: 'ENTREGADO', entrega: -6, pago: 'total' },
    { cliente: 'María Fernanda Ruiz', items: [['AVE-POS-18', 4]], atras: 6, hasta: 'ENTREGADO', entrega: -6, pago: 'total' },
    { cliente: 'Granja Familiar Los Tres Hermanos', items: [['ALI-INI-40', 3], ['ALI-POS-40', 5]], atras: 5, hasta: 'ENTREGADO', entrega: -4, vence: -1, pago: [2000, 'EFECTIVO'] },
    { cliente: 'Restaurante Doña Lupita', items: [['HUE-ROJ-360', 4]], atras: 4, hasta: 'ENTREGADO', entrega: -3, pago: 'total' },
    { cliente: 'Tortillería y Pollería El Gallo', items: [['HUE-BCO-360', 10]], atras: 3, hasta: 'ENTREGADO', entrega: -2, vence: 5 },
    { cliente: 'Miguel Ángel Torres', items: [['HUE-BCO-030', 12], ['INS-VIT-100', 2]], atras: 2, hasta: 'ENTREGADO', entrega: -2, pago: 'total' },
    { cliente: 'Abarrotes La Esperanza', items: [['HUE-BCO-360', 15]], atras: 1, hasta: 'EN_RUTA', entrega: 0, vence: 7 },
    { cliente: 'Rosa Elena Martínez', items: [['ALI-POS-40', 8]], atras: 1, hasta: 'PREPARADO', entrega: 1, pago: [1500, 'EFECTIVO'] },
    { cliente: 'Juan Carlos Pérez', items: [['AVE-POS-18', 6]], atras: 0, hasta: 'RECIBIDO', entrega: 3 },
    { cliente: 'Restaurante Doña Lupita', items: [['HUE-BCO-360', 2], ['HUE-ROJ-360', 2]], atras: 2, hasta: 'INCIDENCIA', entrega: -1, nota: 'El negocio estaba cerrado al llegar. Reprogramar entrega con el cliente.' },
    { cliente: 'Minisúper El Ahorro', items: [['HUE-BCO-360', 30], ['HUE-BCO-030', 50]], atras: 5, hasta: 'COTIZACION' },
    { cliente: 'Comedor Industrial Santa Fe', items: [['HUE-BCO-360', 20]], atras: 0, hasta: 'COTIZACION' },
  ];
  const inscritos: { cliente: string; paquetes: number; anticipo?: [number, MetodoPago]; atras: number }[] = [
    { cliente: 'María Fernanda Ruiz', paquetes: 1, anticipo: [350, 'EFECTIVO'], atras: 6 },
    { cliente: 'Juan Carlos Pérez', paquetes: 3, anticipo: [300, 'TRANSFERENCIA'], atras: 5 },
    { cliente: 'Rosa Elena Martínez', paquetes: 1, atras: 4 },
    { cliente: 'Granja Familiar Los Tres Hermanos', paquetes: 5, anticipo: [1000, 'TRANSFERENCIA'], atras: 3 },
    { cliente: 'Miguel Ángel Torres', paquetes: 2, anticipo: [200, 'EFECTIVO'], atras: 1 },
  ];
  const inscritosPonedoras: typeof inscritos = [
    { cliente: 'Granja Familiar Los Tres Hermanos', paquetes: 2, anticipo: [640, 'TRANSFERENCIA'], atras: 2 },
    { cliente: 'Guadalupe Sánchez', paquetes: 1, atras: 0 },
  ];

  // El siguiente pedido que se capture será el PSA-000125, como en el documento de alcance.
  const enFirme = demo.filter((d) => d.hasta !== 'COTIZACION').length + inscritos.length + inscritosPonedoras.length;
  await ds.query(`INSERT INTO folios (serie, ultimo) VALUES ('PSA', $1)`, [124 - enFirme]);

  /** Mueve en el tiempo todo lo que generó un pedido, para que la demo tenga historia */
  const antedatar = async (pedidoId: number, folio: string, atras: number, d: { entrega?: number; vence?: number; entregado?: boolean }) => {
    const creado = `NOW() - INTERVAL '${atras} days' - INTERVAL '${(pedidoId * 37) % 300} minutes'`;
    await ds.query(
      `UPDATE pedidos SET "createdAt" = ${creado},
              "confirmadoAt" = CASE WHEN "confirmadoAt" IS NULL THEN NULL ELSE ${creado} END,
              "fechaEntrega" = $2, "fechaVencimiento" = $3,
              "entregadoAt" = CASE WHEN $4::boolean THEN ($2::date + TIME '11:30') AT TIME ZONE 'America/Mexico_City' ELSE NULL END
        WHERE id = $1`,
      [
        pedidoId,
        d.entrega === undefined ? null : sumarDias(dia, d.entrega),
        d.vence === undefined ? (d.entrega === undefined ? null : sumarDias(dia, d.entrega)) : sumarDias(dia, d.vence),
        !!d.entregado,
      ],
    );
    await ds.query(`UPDATE pagos SET fecha = ${creado} + INTERVAL '20 minutes', "createdAt" = ${creado} WHERE "pedidoId" = $1`, [pedidoId]);
    await ds.query(`UPDATE movimientos SET "createdAt" = ${creado} WHERE referencia = $1`, [folio]);
    await ds.query(`UPDATE notificaciones SET "createdAt" = ${creado} WHERE referencia = $1 OR referencia IN (SELECT folio FROM pagos WHERE "pedidoId" = $2)`, [folio, pedidoId]);
    await ds.query(`UPDATE bitacora SET "createdAt" = ${creado} WHERE entidad = 'pedido' AND "entidadId" = $1`, [String(pedidoId)]);
  };

  for (const d of demo) {
    const p = await pedidos.crear(ventas, {
      clienteId: C[d.cliente],
      sucursalId: matriz.id,
      items: d.items.map(([sku, cantidad]) => ({ productoId: P(sku), cantidad })),
      confirmar: d.hasta !== 'COTIZACION',
    });
    if (d.pago) await pagos.registrar(cobranza, { pedidoId: p.id, monto: d.pago === 'total' ? p.total : d.pago[0], metodo: d.pago === 'total' ? 'EFECTIVO' : d.pago[1] });
    const ruta: Demo['hasta'][] = ['PREPARADO', 'EN_RUTA', 'ENTREGADO'];
    const meta = d.hasta === 'INCIDENCIA' ? 'EN_RUTA' : d.hasta;
    for (const paso of ruta.slice(0, ruta.indexOf(meta) + 1)) {
      await pedidos.cambiarEstado(logistica, p.id, { estado: paso, recibidoPor: paso === 'ENTREGADO' ? d.cliente : undefined });
    }
    if (d.hasta === 'INCIDENCIA') await pedidos.cambiarEstado(logistica, p.id, { estado: 'INCIDENCIA', nota: d.nota });
    await antedatar(p.id, p.folio, d.atras, { entrega: d.entrega, vence: d.vence, entregado: d.hasta === 'ENTREGADO' });
  }

  /* Pollitandas */
  const diciembre = await pollitandas.crear(director, {
    nombre: 'Pollitanda de Engorda',
    descripcion: 'Paquete de 20 pollitos de engorda de 1 día. Se aparta con anticipo y se liquida antes de la entrega.',
    productoId: P('POL-ENG-01'),
    sucursalId: matriz.id,
    pollitosPorPaquete: 20,
    precioPaquete: 350,
    anticipoMinimo: 100,
    cupoPaquetes: 25,
    fechaCierre: sumarDias(dia, 10),
    fechaEntrega: sumarDias(dia, 16),
    preventa: false,
  });
  const ponedoras = await pollitandas.crear(director, {
    nombre: 'Pollitanda Ponedoras',
    descripcion: 'Paquete de 10 pollitas ponedoras. Venta anticipada: las pollitas se apartan cuando nace el lote.',
    productoId: P('POL-PON-01'),
    sucursalId: matriz.id,
    pollitosPorPaquete: 10,
    precioPaquete: 320,
    anticipoMinimo: 100,
    cupoPaquetes: 30,
    fechaCierre: sumarDias(dia, 20),
    fechaEntrega: sumarDias(dia, 35),
    preventa: true,
  });
  for (const [programa, lista] of [[diciembre, inscritos], [ponedoras, inscritosPonedoras]] as const) {
    for (const i of lista) {
      const e = await pollitandas.inscribir(ventas, programa.id, {
        clienteId: C[i.cliente],
        paquetes: i.paquetes,
        anticipo: i.anticipo ? { monto: i.anticipo[0], metodo: i.anticipo[1] } : undefined,
      });
      const creado = `NOW() - INTERVAL '${i.atras} days' - INTERVAL '${(e.id * 53) % 240} minutes'`;
      await ds.query(`UPDATE pedidos SET "createdAt" = ${creado}, "confirmadoAt" = ${creado} WHERE id = $1`, [e.pedido.id]);
      await ds.query(`UPDATE inscripciones SET "createdAt" = ${creado} WHERE id = $1`, [e.id]);
      await ds.query(`UPDATE pagos SET fecha = ${creado} + INTERVAL '10 minutes' WHERE "pedidoId" = $1`, [e.pedido.id]);
      await ds.query(`UPDATE notificaciones SET "createdAt" = ${creado} WHERE referencia = $1 OR referencia = $2`, [e.folio, e.pedido.folio]);
    }
  }

  /* Seguimiento comercial */
  await clientesSrv.agregarSeguimiento(ventas, C['Minisúper El Ahorro'], { tipo: 'LLAMADA', nota: 'Pidió cotización para surtir sus 2 sucursales. Compara precio con su proveedor actual.', proximaAccion: sumarDias(dia, -1) });
  await clientesSrv.agregarSeguimiento(ventas, C['Panadería San José'], { tipo: 'VISITA', nota: 'Consume ~8 cajas por semana. Quiere probar una caja antes de decidir.', proximaAccion: dia });
  await clientesSrv.agregarSeguimiento(ventas, C['Comedor Industrial Santa Fe'], { tipo: 'WHATSAPP', nota: 'Se envió cotización. Decide el jefe de compras el viernes.', proximaAccion: sumarDias(dia, 2) });
  await clientesSrv.agregarSeguimiento(ventas, C['Guadalupe Sánchez'], { tipo: 'NOTA', nota: 'Interesada en ponedoras para traspatio; se inscribió a la Pollitanda.' });

  // Los mensajes antiguos se dan por enviados; quedan pendientes los de los últimos 2 días.
  await ds.query(`UPDATE notificaciones SET estado = 'ENVIADA', "enviadaAt" = "createdAt" + INTERVAL '5 minutes' WHERE "createdAt" < NOW() - INTERVAL '2 days'`);
  const recordatorios = await notificaciones.generarRecordatorios();

  console.log(`
Demostración lista.
  Sucursales: ${matriz.nombre} · ${centro.nombre}
  Productos: ${productos.length} · Clientes: ${cartera.length} · Pedidos y cotizaciones: ${demo.length} · Pollitandas: 2
  Recordatorios generados: ${JSON.stringify(recordatorios)}

Usuarios (contraseña para todos: ${CLAVE_DEMO})
${equipo.map((u) => `  ${u.rol.padEnd(11)} ${u.email}`).join('\n')}
`);
}

sembrar().catch((e) => {
  console.error(e);
  process.exit(1);
});
