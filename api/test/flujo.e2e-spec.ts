/**
 * Pruebas de punta a punta de las reglas de negocio de la Etapa 1.
 * Corren contra una base PostgreSQL real (<base>_test), que se recrea en cada corrida,
 * así que también validan que la migración inicial funcione desde cero.
 *
 *   npm run test:e2e
 */
import { cargarEnv } from '../src/db/env';

cargarEnv();
const urlPrincipal = process.env.DATABASE_URL!;
const urlPruebas = process.env.DATABASE_URL_TEST || urlPrincipal.replace(/\/([^/?]+)(\?.*)?$/, '/$1_test$2');
process.env.DATABASE_URL = urlPruebas;
process.env.JWT_SECRET = 'clave-solo-para-pruebas-automatizadas';
process.env.RECORDATORIOS_AUTOMATICOS = 'false';
process.env.LIMITE_PETICIONES = '100000';

import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { hoy, sumarDias } from '../src/common/util';
import { Sucursal, Usuario } from '../src/db/entities';
import { configurar } from '../src/main';

let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let director: string;
let vendedora: string;
let sucursalId: number;

const como = (token: string) => ({
  get: (ruta: string) => http.get(`/api${ruta}`).set('Authorization', `Bearer ${token}`),
  post: (ruta: string, cuerpo: object = {}) => http.post(`/api${ruta}`).set('Authorization', `Bearer ${token}`).send(cuerpo),
  patch: (ruta: string, cuerpo: object = {}) => http.patch(`/api${ruta}`).set('Authorization', `Bearer ${token}`).send(cuerpo),
});

/** Crea un producto con un lote inicial y devuelve su id */
async function producto(sku: string, existencia: number, extra: { precio?: number; fechaLimiteVenta?: string } = {}) {
  const p = await como(director).post('/productos', { sku, nombre: `Producto ${sku}`, categoria: 'POLLITO', unidad: 'pieza', precio: extra.precio ?? 17.5, stockMinimo: 0 }).expect(201);
  if (existencia > 0) {
    await como(director).post('/inventario/lotes', { productoId: p.body.id, sucursalId, cantidad: existencia, fechaLimiteVenta: extra.fechaLimiteVenta }).expect(201);
  }
  return p.body.id as number;
}

async function cliente(nombre: string, tipo = 'CLIENTE') {
  const c = await como(director).post('/clientes', { nombre, tipo }).expect(201);
  return c.body.id as number;
}

async function existencia(productoId: number) {
  const r = await como(director).get('/inventario/existencias').expect(200);
  return r.body.find((e: { id: number }) => e.id === productoId) as { fisica: number; reservada: number; disponible: number; porSurtir: number; proximaCaducidad: string | null };
}

beforeAll(async () => {
  // Base de pruebas limpia
  const admin = new Client({ connectionString: urlPrincipal });
  await admin.connect();
  const nombre = new URL(urlPruebas).pathname.slice(1);
  const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
  if (!existe.rowCount) await admin.query(`CREATE DATABASE "${nombre}"`);
  await admin.end();
  const limpia = new Client({ connectionString: urlPruebas });
  await limpia.connect();
  await limpia.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await limpia.end();

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication<NestExpressApplication>();
  configurar(app);
  await app.init();
  http = request(app.getHttpServer());

  const ds = app.get(DataSource);
  sucursalId = (await ds.getRepository(Sucursal).save({ nombre: 'Matriz' })).id;
  const passwordHash = await bcrypt.hash('Prueba1234', 4);
  await ds.getRepository(Usuario).save([
    { nombre: 'Directora', email: 'direccion@prueba.mx', passwordHash, rol: 'DIRECTOR', sucursalId: null },
    { nombre: 'Vendedora', email: 'ventas@prueba.mx', passwordHash, rol: 'VENTAS', sucursalId: null },
  ]);
  director = (await http.post('/api/auth/login').send({ email: 'direccion@prueba.mx', password: 'Prueba1234' }).expect(201)).body.token;
  vendedora = (await http.post('/api/auth/login').send({ email: 'ventas@prueba.mx', password: 'Prueba1234' }).expect(201)).body.token;
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('Acceso y permisos', () => {
  it('rechaza credenciales incorrectas sin revelar si el correo existe', async () => {
    const a = await http.post('/api/auth/login').send({ email: 'direccion@prueba.mx', password: 'incorrecta' }).expect(401);
    const b = await http.post('/api/auth/login').send({ email: 'nadie@prueba.mx', password: 'incorrecta' }).expect(401);
    expect(a.body.mensaje).toBe(b.body.mensaje);
  });

  it('exige sesión en las rutas protegidas', async () => {
    await http.get('/api/clientes').expect(401);
    await http.get('/api/clientes').set('Authorization', 'Bearer token-falso').expect(401);
  });

  it('aplica los permisos del rol', async () => {
    await como(vendedora).get('/clientes').expect(200);
    await como(vendedora).post('/productos', { sku: 'X', nombre: 'No debería', categoria: 'HUEVO', unidad: 'caja', precio: 1 }).expect(403);
    await como(vendedora).get('/usuarios').expect(403);
    await como(vendedora).get('/bitacora').expect(403);
  });

  it('permite conceder y retirar permisos por empleado, con efecto inmediato', async () => {
    const usuarios = (await como(director).get('/usuarios').expect(200)).body;
    const v = usuarios.find((u: { email: string }) => u.email === 'ventas@prueba.mx');
    await como(director).patch(`/usuarios/${v.id}`, { permisosExtra: ['productos.editar'], permisosDenegados: ['clientes.ver'] }).expect(200);
    await como(vendedora).get('/clientes').expect(403);
    await como(vendedora).post('/productos', { sku: 'EXTRA-1', nombre: 'Con permiso extra', categoria: 'HUEVO', unidad: 'caja', precio: 10 }).expect(201);
    await como(director).patch(`/usuarios/${v.id}`, { permisosExtra: [], permisosDenegados: [] }).expect(200);
    await como(vendedora).get('/clientes').expect(200);
  });

  it('un usuario desactivado pierde el acceso aunque su token siga vigente', async () => {
    const nuevo = (await como(director).post('/usuarios', { nombre: 'Temporal', email: 'temporal@prueba.mx', password: 'Prueba1234', rol: 'COBRANZA' }).expect(201)).body;
    const token = (await http.post('/api/auth/login').send({ email: 'temporal@prueba.mx', password: 'Prueba1234' }).expect(201)).body.token;
    await como(token).get('/cobranza/resumen').expect(200);
    await como(director).patch(`/usuarios/${nuevo.id}`, { activo: false }).expect(200);
    await como(token).get('/cobranza/resumen').expect(401);
  });

  it('rechaza campos desconocidos y datos inválidos', async () => {
    await como(director).post('/clientes', { nombre: 'Con campo extra', esAdmin: true }).expect(400);
    await como(director).post('/clientes', { nombre: '' }).expect(400);
  });
});

describe('Flujo del documento: 500 pollitos, se venden 20', () => {
  let productoId: number;
  let pedido: { id: number; folio: string; total: number };

  it('al confirmar el pedido aparta 20 y deja 480 disponibles', async () => {
    productoId = await producto('POL-500', 500);
    const clienteId = await cliente('Cliente del ejemplo');
    const r = await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 20 }], confirmar: true, fechaEntrega: sumarDias(hoy(), 3) }).expect(201);
    pedido = r.body;
    expect(pedido.folio).toMatch(/^PSA-\d{6}$/);
    expect(r.body.estado).toBe('RECIBIDO');
    expect(pedido.total).toBe(350);
    expect(await existencia(productoId)).toMatchObject({ fisica: 500, reservada: 20, disponible: 480 });
  });

  it('registra el anticipo, actualiza el saldo y deja listo el mensaje de WhatsApp', async () => {
    const pago = await como(vendedora).post('/pagos', { pedidoId: pedido.id, monto: 150, metodo: 'EFECTIVO' }).expect(201);
    expect(pago.body.folio).toMatch(/^REC-\d{6}$/);
    expect(pago.body.saldoPedido).toBe(200);
    const recibo = await como(director).get(`/pagos/${pago.body.id}`).expect(200);
    expect(recibo.body).toMatchObject({ monto: 150, saldoDespues: 200 });
  });

  it('no permite cobrar más que el saldo', async () => {
    const r = await como(vendedora).post('/pagos', { pedidoId: pedido.id, monto: 200.01, metodo: 'EFECTIVO' }).expect(409);
    expect(r.body.mensaje).toContain('mayor al saldo');
  });

  it('al entregar descuenta la existencia física y conserva la cuenta por cobrar', async () => {
    await como(vendedora).post(`/pedidos/${pedido.id}/estado`, { estado: 'PREPARADO' }).expect(403); // ventas no mueve logística
    await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'PREPARADO' }).expect(201);
    await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'EN_RUTA' }).expect(201);
    const r = await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'ENTREGADO', recibidoPor: 'Cliente del ejemplo' }).expect(201);
    expect(r.body).toMatchObject({ estado: 'ENTREGADO', saldo: 200, recibidoPor: 'Cliente del ejemplo' });
    expect(await existencia(productoId)).toMatchObject({ fisica: 480, reservada: 0, disponible: 480 });

    const porCobrar = await como(director).get('/cobranza/por-cobrar').expect(200);
    expect(porCobrar.body.cuentas.find((c: { id: number }) => c.id === pedido.id)).toMatchObject({ saldo: 200 });
  });

  it('al liquidar, el pedido sale de las cuentas por cobrar', async () => {
    await como(vendedora).post('/pagos', { pedidoId: pedido.id, monto: 200, metodo: 'TRANSFERENCIA', referencia: 'SPEI 123' }).expect(201);
    const porCobrar = await como(director).get('/cobranza/por-cobrar').expect(200);
    expect(porCobrar.body.cuentas.find((c: { id: number }) => c.id === pedido.id)).toBeUndefined();
  });

  it('deja rastro completo: movimientos de inventario, mensajes y bitácora', async () => {
    const mov = await como(director).get(`/inventario/movimientos?productoId=${productoId}`).expect(200);
    expect(mov.body.datos.map((m: { tipo: string }) => m.tipo)).toEqual(['SALIDA', 'RESERVA', 'ENTRADA']);
    expect(mov.body.datos[0]).toMatchObject({ cantidad: -20, saldoFisico: 480, saldoReservado: 0, referencia: pedido.folio });
    const bitacora = await como(director).get('/bitacora?entidad=pedido').expect(200);
    expect(bitacora.body.datos.some((b: { accion: string; entidadId: string }) => b.accion === 'ESTADO_ENTREGADO' && b.entidadId === String(pedido.id))).toBe(true);
  });
});

describe('Inventario', () => {
  it('rechaza la venta sin existencia y no deja nada apartado', async () => {
    const productoId = await producto('SIN-STOCK', 10);
    const clienteId = await cliente('Cliente sin stock');
    const r = await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 11 }], confirmar: true }).expect(409);
    expect(r.body.codigo).toBe('SIN_EXISTENCIA');
    expect(await existencia(productoId)).toMatchObject({ fisica: 10, reservada: 0, disponible: 10 });
    const pedidos = await como(director).get(`/pedidos?clienteId=${clienteId}`).expect(200);
    expect(pedidos.body.total).toBe(0);
  });

  it('dos ventas simultáneas por las últimas unidades: solo una se confirma', async () => {
    const productoId = await producto('ULTIMAS', 10);
    const clienteId = await cliente('Cliente concurrente');
    const venta = () => como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 8 }], confirmar: true });
    const resultados = await Promise.all([venta(), venta(), venta()]);
    expect(resultados.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await existencia(productoId)).toMatchObject({ fisica: 10, reservada: 8, disponible: 2 });
  });

  it('los folios no se repiten ni dejan huecos con ventas simultáneas', async () => {
    const productoId = await producto('FOLIOS', 100);
    const clienteId = await cliente('Cliente folios');
    const resultados = await Promise.all(
      Array.from({ length: 6 }, () => como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 1 }], confirmar: true })),
    );
    const numeros = resultados.map((r) => Number(r.body.folio.slice(4))).sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(6);
    expect(numeros[5] - numeros[0]).toBe(5);
  });

  it('toma primero el lote que vence antes y nunca uno vencido', async () => {
    const dia = hoy();
    const productoId = await producto('LOTES', 0);
    const entrada = (cantidad: number, limite: string, ingreso = dia) =>
      como(director).post('/inventario/lotes', { productoId, sucursalId, cantidad, fechaIngreso: ingreso, fechaLimiteVenta: limite }).expect(201);
    await entrada(5, sumarDias(dia, 10));
    await entrada(5, sumarDias(dia, 2));
    await entrada(50, sumarDias(dia, -1), sumarDias(dia, -8)); // vencido: no cuenta como disponible
    expect(await existencia(productoId)).toMatchObject({ disponible: 10, proximaCaducidad: sumarDias(dia, -1), porCaducar: true });

    const clienteId = await cliente('Cliente lotes');
    const r = await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 7 }], confirmar: true }).expect(201);
    const lotes = r.body.items[0].lotes.map((l: { cantidad: number }) => l.cantidad);
    expect(lotes).toEqual([5, 2]); // 5 del que vence en 2 días, 2 del que vence en 10
    await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 4 }], confirmar: true }).expect(409);
  });

  it('no aparta lotes que vencerán antes de la fecha de entrega', async () => {
    const dia = hoy();
    const productoId = await producto('VIGENCIA', 20, { fechaLimiteVenta: sumarDias(dia, 3) });
    const clienteId = await cliente('Cliente vigencia');
    await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 5 }], confirmar: true, fechaEntrega: sumarDias(dia, 7) }).expect(409);
    await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 5 }], confirmar: true, fechaEntrega: sumarDias(dia, 2) }).expect(201);
  });

  it('un ajuste no puede dejar la existencia por debajo de lo apartado', async () => {
    const productoId = await producto('AJUSTE', 30);
    const clienteId = await cliente('Cliente ajuste');
    await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 12 }], confirmar: true }).expect(201);
    const [lote] = (await como(director).get(`/inventario/lotes?productoId=${productoId}`).expect(200)).body;
    await como(director).post(`/inventario/lotes/${lote.id}/ajuste`, { cantidadFisica: 11, motivo: 'Conteo físico' }).expect(409);
    await como(director).post(`/inventario/lotes/${lote.id}/ajuste`, { cantidadFisica: 27, motivo: 'Mortalidad en nacedora' }).expect(201);
    expect(await existencia(productoId)).toMatchObject({ fisica: 27, reservada: 12, disponible: 15 });
    await como(vendedora).post(`/inventario/lotes/${lote.id}/ajuste`, { cantidadFisica: 1, motivo: 'Sin permiso' }).expect(403);
  });
});

describe('Cotizaciones, preventa y cancelaciones', () => {
  it('la cotización no aparta inventario; al confirmarla recibe folio PSA y el prospecto pasa a cliente', async () => {
    const productoId = await producto('COTIZA', 40);
    const clienteId = await cliente('Prospecto interesado', 'PROSPECTO');
    const cot = (await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 10 }], confirmar: false }).expect(201)).body;
    expect(cot.folio).toMatch(/^COT-/);
    expect(cot.estado).toBe('COTIZACION');
    expect((await existencia(productoId)).reservada).toBe(0);
    await como(vendedora).post('/pagos', { pedidoId: cot.id, monto: 10, metodo: 'EFECTIVO' }).expect(400); // no se cobra una cotización

    const editada = (await como(vendedora).patch(`/pedidos/${cot.id}`, { items: [{ productoId, cantidad: 15 }] }).expect(200)).body;
    expect(editada.total).toBe(262.5);

    const pedido = (await como(vendedora).post(`/pedidos/${cot.id}/confirmar`).expect(201)).body;
    expect(pedido.folio).toMatch(/^PSA-/);
    expect(pedido.folioCotizacion).toBe(cot.folio);
    expect((await existencia(productoId)).reservada).toBe(15);
    expect((await como(director).get(`/clientes/${clienteId}`).expect(200)).body.tipo).toBe('CLIENTE');
    await como(vendedora).patch(`/pedidos/${cot.id}`, { items: [{ productoId, cantidad: 1 }] }).expect(400); // ya en firme
  });

  it('vender por debajo del precio de lista o con descuento requiere permiso', async () => {
    const productoId = await producto('PRECIO', 40, { precio: 100 });
    const clienteId = await cliente('Cliente precio');
    await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 1, precioUnitario: 90 }], confirmar: false }).expect(403);
    await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 1 }], descuento: 5, confirmar: false }).expect(403);
    const r = await como(director).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 2, precioUnitario: 90 }], descuento: 30, confirmar: false }).expect(201);
    expect(r.body).toMatchObject({ subtotal: 180, descuento: 30, total: 150 });
  });

  it('preventa: se vende sin existencia y se aparta sola cuando entra el lote', async () => {
    const productoId = await producto('PREVENTA', 5);
    const clienteId = await cliente('Cliente preventa');
    const pedido = (await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 30 }], confirmar: true, permitirFaltante: true }).expect(201)).body;
    expect(pedido.items[0]).toMatchObject({ cantidadReservada: 5, faltante: 25 });
    expect(await existencia(productoId)).toMatchObject({ disponible: 0, porSurtir: 25 });
    const bloqueo = await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'PREPARADO' }).expect(409);
    expect(bloqueo.body.mensaje).toContain('faltan 25');

    const entrada = await como(director).post('/inventario/lotes', { productoId, sucursalId, cantidad: 100 }).expect(201);
    expect(entrada.body.pedidosSurtidos).toEqual([pedido.folio]);
    expect(await existencia(productoId)).toMatchObject({ fisica: 105, reservada: 30, disponible: 75, porSurtir: 0 });
    await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'ENTREGADO' }).expect(201);
    expect(await existencia(productoId)).toMatchObject({ fisica: 75, reservada: 0 });
  });

  it('cancelar libera lo apartado; con pagos exige cancelar primero el pago', async () => {
    const productoId = await producto('CANCELA', 20);
    const clienteId = await cliente('Cliente cancela');
    const pedido = (await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 6 }], confirmar: true }).expect(201)).body;
    const pago = (await como(vendedora).post('/pagos', { pedidoId: pedido.id, monto: 50, metodo: 'EFECTIVO' }).expect(201)).body;

    await como(vendedora).post(`/pedidos/${pedido.id}/cancelar`, { motivo: 'El cliente desistió' }).expect(403); // pedido en firme
    await como(director).post(`/pedidos/${pedido.id}/cancelar`, { motivo: 'El cliente desistió' }).expect(409); // tiene pagos
    await como(director).post(`/pagos/${pago.id}/cancelar`, { motivo: 'Devolución en efectivo' }).expect(201);
    const cancelado = (await como(director).post(`/pedidos/${pedido.id}/cancelar`, { motivo: 'El cliente desistió' }).expect(201)).body;
    expect(cancelado).toMatchObject({ estado: 'CANCELADO', pagado: 0, saldo: 0 });
    expect(await existencia(productoId)).toMatchObject({ fisica: 20, reservada: 0, disponible: 20 });
    await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'PREPARADO' }).expect(400);
  });

  it('una incidencia detiene el pedido y al resolverse regresa a donde estaba', async () => {
    const productoId = await producto('INCIDE', 20);
    const clienteId = await cliente('Cliente incidencia');
    const pedido = (await como(vendedora).post('/pedidos', { clienteId, items: [{ productoId, cantidad: 2 }], confirmar: true }).expect(201)).body;
    await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'PREPARADO' }).expect(201);
    await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'INCIDENCIA' }).expect(400); // falta describirla
    const inc = (await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'INCIDENCIA', nota: 'Caja dañada' }).expect(201)).body;
    expect(inc).toMatchObject({ estado: 'INCIDENCIA', incidencia: 'Caja dañada', siguientes: ['PREPARADO'] });
    const resuelto = (await como(director).post(`/pedidos/${pedido.id}/estado`, { estado: 'PREPARADO' }).expect(201)).body;
    expect(resuelto).toMatchObject({ estado: 'PREPARADO', incidencia: null });
  });
});

describe('Pollitandas', () => {
  let pollitandaId: number;
  let productoId: number;
  let expediente: { id: number; folio: string; pedido: { id: number; folio: string } };

  it('crea el programa', async () => {
    productoId = await producto('POL-TANDA', 100);
    const dia = hoy();
    const r = await como(director)
      .post('/pollitandas', { nombre: 'Pollitanda de prueba', productoId, sucursalId, pollitosPorPaquete: 20, precioPaquete: 350, anticipoMinimo: 100, cupoPaquetes: 4, fechaEntrega: sumarDias(dia, 15), preventa: false })
      .expect(201);
    pollitandaId = r.body.id;
    await como(vendedora).post('/pollitandas', { nombre: 'Sin permiso', productoId, pollitosPorPaquete: 1, precioPaquete: 1, cupoPaquetes: 1, fechaEntrega: dia }).expect(403);
  });

  it('inscribir genera el pedido, aparta los pollitos y registra el anticipo en una sola operación', async () => {
    const clienteId = await cliente('Participante uno');
    await como(vendedora).post(`/pollitandas/${pollitandaId}/inscripciones`, { clienteId, paquetes: 2, anticipo: { monto: 150, metodo: 'EFECTIVO' } }).expect(400); // mínimo 200
    const r = await como(vendedora).post(`/pollitandas/${pollitandaId}/inscripciones`, { clienteId, paquetes: 2, anticipo: { monto: 200, metodo: 'EFECTIVO' } }).expect(201);
    expediente = r.body;
    expect(r.body).toMatchObject({ paquetes: 2, cantidadPollitos: 40, total: 700, pagado: 200, saldo: 500, estado: 'EN_PAGOS', pollitosPorSurtir: 0 });
    expect(r.body.folio).toMatch(/^PT-/);
    expect(r.body.pedido.folio).toMatch(/^PSA-/);
    expect(await existencia(productoId)).toMatchObject({ fisica: 100, reservada: 40, disponible: 60 });
  });

  it('respeta el cupo y permite apartar sin anticipo', async () => {
    const clienteId = await cliente('Participante dos');
    const lleno = await como(vendedora).post(`/pollitandas/${pollitandaId}/inscripciones`, { clienteId, paquetes: 3 }).expect(409);
    expect(lleno.body.mensaje).toContain('Solo quedan 2');
    const r = await como(vendedora).post(`/pollitandas/${pollitandaId}/inscripciones`, { clienteId, paquetes: 1 }).expect(201);
    expect(r.body.estado).toBe('APARTADO');
    const programa = (await como(director).get(`/pollitandas/${pollitandaId}`).expect(200)).body;
    expect(programa).toMatchObject({ participantes: 2, paquetesVendidos: 3, cupoDisponible: 1, pollitos: 60, vendido: 1050, cobrado: 200, porCobrar: 850 });
  });

  it('el expediente refleja pagos y entrega sin capturar nada dos veces', async () => {
    await como(vendedora).post('/pagos', { pedidoId: expediente.pedido.id, monto: 500, metodo: 'TRANSFERENCIA' }).expect(201);
    let e = (await como(director).get(`/pollitandas/expedientes/${expediente.id}`).expect(200)).body;
    expect(e).toMatchObject({ estado: 'LIQUIDADO', saldo: 0 });
    expect(e.pagos).toHaveLength(2);
    await como(director).post(`/pedidos/${expediente.pedido.id}/estado`, { estado: 'ENTREGADO' }).expect(201);
    e = (await como(director).get(`/pollitandas/expedientes/${expediente.id}`).expect(200)).body;
    expect(e.estado).toBe('ENTREGADO');
    expect(await existencia(productoId)).toMatchObject({ fisica: 60, reservada: 20 });
  });

  it('la baja de un participante libera su lugar y sus pollitos', async () => {
    const programa = (await como(director).get(`/pollitandas/${pollitandaId}`).expect(200)).body;
    const apartado = programa.expedientes.find((x: { estado: string }) => x.estado === 'APARTADO');
    await como(director).post(`/pollitandas/expedientes/${apartado.id}/baja`, { motivo: 'Ya no pudo participar' }).expect(201);
    const despues = (await como(director).get(`/pollitandas/${pollitandaId}`).expect(200)).body;
    expect(despues).toMatchObject({ participantes: 1, cupoDisponible: 2 });
    expect(await existencia(productoId)).toMatchObject({ fisica: 60, reservada: 0, disponible: 60 });
  });

  it('en preventa se inscribe aunque los pollitos aún no existan', async () => {
    const sinLote = await producto('POL-FUTURO', 0);
    const programa = (
      await como(director)
        .post('/pollitandas', { nombre: 'Preventa de prueba', productoId: sinLote, sucursalId, pollitosPorPaquete: 10, precioPaquete: 320, cupoPaquetes: 10, fechaEntrega: sumarDias(hoy(), 30), preventa: true })
        .expect(201)
    ).body;
    const clienteId = await cliente('Participante preventa');
    const e = (await como(vendedora).post(`/pollitandas/${programa.id}/inscripciones`, { clienteId, paquetes: 2 }).expect(201)).body;
    expect(e).toMatchObject({ cantidadPollitos: 20, pollitosPorSurtir: 20 });
    await como(director).post('/inventario/lotes', { productoId: sinLote, sucursalId, cantidad: 50 }).expect(201);
    const surtido = (await como(director).get(`/pollitandas/expedientes/${e.id}`).expect(200)).body;
    expect(surtido.pollitosPorSurtir).toBe(0);
  });
});

describe('Seguimiento, recordatorios e indicadores', () => {
  it('lleva el seguimiento comercial del prospecto', async () => {
    const clienteId = await cliente('Prospecto con seguimiento', 'PROSPECTO');
    await como(vendedora).post(`/clientes/${clienteId}/seguimientos`, { tipo: 'LLAMADA', nota: 'Pidió precios', proximaAccion: hoy() }).expect(201);
    const c = (await como(vendedora).get(`/clientes/${clienteId}`).expect(200)).body;
    expect(c.etapa).toBe('CONTACTADO');
    const pendientes = (await como(vendedora).get('/seguimientos/pendientes').expect(200)).body;
    expect(pendientes.some((s: { cliente: { id: number } }) => s.cliente.id === clienteId)).toBe(true);
  });

  it('evita duplicar clientes con el mismo teléfono', async () => {
    await como(vendedora).post('/clientes', { nombre: 'Teléfono original', telefono: '55 5010 0199' }).expect(201);
    const r = await como(vendedora).post('/clientes', { nombre: 'Teléfono repetido', whatsapp: '5550100199' }).expect(409);
    expect(r.body.mensaje).toContain('Teléfono original');
  });

  it('genera recordatorios sin repetirlos', async () => {
    const ds = app.get(DataSource);
    const productoId = await producto('RECORDAR', 50);
    const c = (await como(vendedora).post('/clientes', { nombre: 'Cliente moroso', whatsapp: '5550100777' }).expect(201)).body;
    const pedido = (await como(vendedora).post('/pedidos', { clienteId: c.id, items: [{ productoId, cantidad: 2 }], confirmar: true }).expect(201)).body;
    await ds.query(`UPDATE pedidos SET "fechaVencimiento" = $1 WHERE id = $2`, [sumarDias(hoy(), -3), pedido.id]);
    const primera = (await como(vendedora).post('/notificaciones/recordatorios').expect(201)).body;
    expect(primera.saldos).toBeGreaterThanOrEqual(1);
    const segunda = (await como(vendedora).post('/notificaciones/recordatorios').expect(201)).body;
    expect(segunda).toEqual({ cotizaciones: 0, saldos: 0, anticipos: 0, entregas: 0 });
    const bandeja = (await como(vendedora).get(`/notificaciones?clienteId=${c.id}`).expect(200)).body;
    expect(bandeja.datos.map((n: { plantilla: string }) => n.plantilla).sort()).toEqual(['pedido_confirmado', 'recordatorio_saldo']);
  });

  it('el tablero muestra dinero solo a quien tiene permiso', async () => {
    const dir = (await como(director).get('/dashboard').expect(200)).body;
    expect(dir.dinero.ventasMes).toBeGreaterThan(0);
    expect(dir.serie).toHaveLength(14);
    for (const e of dir.entregas) expect(e.fechaEntrega).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dir.entregas.length).toBeGreaterThan(0);
    const usuarios = (await como(director).get('/usuarios').expect(200)).body;
    const v = usuarios.find((u: { email: string }) => u.email === 'ventas@prueba.mx');
    await como(director).patch(`/usuarios/${v.id}`, { permisosDenegados: ['cobranza.ver'] }).expect(200);
    const ven = (await como(vendedora).get('/dashboard').expect(200)).body;
    expect(ven.dinero).toBeNull();
    expect(ven.pedidos).not.toBeNull();
    await como(director).patch(`/usuarios/${v.id}`, { permisosDenegados: [] }).expect(200);
    await como(vendedora).get('/reportes/ventas').expect(403);
  });

  it('el reporte de ventas cuadra con los pedidos del periodo', async () => {
    const r = (await como(director).get('/reportes/ventas').expect(200)).body;
    const sumaProductos = r.porProducto.reduce((s: number, p: { importe: number }) => s + p.importe, 0);
    const sumaDias = r.porDia.reduce((s: number, d: { total: number }) => s + d.total, 0);
    expect(Math.round(sumaDias * 100)).toBe(Math.round(r.totales.total * 100));
    expect(Math.round(sumaProductos * 100)).toBe(Math.round((r.totales.total + r.totales.descuentos) * 100));
    expect(r.totales.porCobrar).toBeCloseTo(r.totales.total - r.totales.cobrado, 2);
  });
});
