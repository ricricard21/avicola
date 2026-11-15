/**
 * Pruebas del motor de la demostración (npm test). Verifican las mismas reglas que las
 * pruebas de la API y, si la API real está corriendo con la demo recién sembrada
 * (API_REAL=http://localhost:4000/api), comparan que ambos den exactamente los mismos números.
 */
import assert from 'node:assert/strict';
import { bd } from './bd';
import { hoy, sumarDias } from './servidor';
import { enviar } from '../transporte';

let ok = 0;
async function prueba(nombre: string, f: () => Promise<void>) {
  try {
    await f();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    console.log(`  ✗ ${nombre}\n    ${(e as Error).message.split('\n').join('\n    ')}`);
    process.exitCode = 1;
  }
}

const tokens: Record<string, string> = {};
async function como(rol: string) {
  if (!tokens[rol]) tokens[rol] = (await enviar('POST', '/auth/login', { email: `${rol}@avicolasanangel.com`, password: 'Avicola2026' }, null)).datos.token as string;
  const t = tokens[rol];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pedir = async (metodo: string, ruta: string, cuerpo: unknown, espera: number): Promise<any> => {
    const r = await enviar(metodo, ruta, cuerpo, t);
    assert.equal(r.estado, espera, `${metodo} ${ruta} → ${r.estado}: ${r.datos.mensaje ?? ''}`);
    return r.datos;
  };
  return {
    get: (ruta: string, espera = 200) => pedir('GET', ruta, undefined, espera),
    post: (ruta: string, cuerpo: unknown = {}, espera = 201) => pedir('POST', ruta, cuerpo, espera),
    patch: (ruta: string, cuerpo: unknown = {}, espera = 200) => pedir('PATCH', ruta, cuerpo, espera),
  };
}
const existencia = async (id: number) => (await (await como('direccion')).get('/inventario/existencias')).find((e: any) => e.id === id);

async function main() {
  const dir = await como('direccion');
  const ven = await como('ventas');
  const b = bd();

  console.log('Datos de ejemplo');
  await prueba('lo apartado en cada lote coincide con las reservas de los pedidos', async () => {
    for (const l of b.lotes) {
      const reservas = b.reservas.filter((r) => r.loteId === l.id && !r.surtida).reduce((s, r) => s + r.cantidad, 0);
      assert.equal(l.cantidadReservada, reservas, `lote ${l.codigo}`);
    }
  });
  await prueba('lo pagado en cada pedido coincide con sus recibos', async () => {
    for (const p of b.pedidos) assert.equal(p.pagado, b.pagos.filter((g) => g.pedidoId === p.id && !g.cancelado).reduce((s, g) => s + g.monto, 0), p.folio);
  });

  if (process.env.API_REAL) {
    const real = async (ruta: string) => {
      const login = await (await fetch(`${process.env.API_REAL}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'direccion@avicolasanangel.com', password: 'Avicola2026' }) })).json();
      return (await fetch(`${process.env.API_REAL}${ruta}`, { headers: { authorization: `Bearer ${login.token}` } })).json();
    };
    console.log('Comparación contra la API real (misma demo recién sembrada)');
    await prueba('tablero: dinero, flujo de pedidos, serie de 14 días, entregas y alertas', async () => {
      const [a, r] = [await dir.get('/dashboard'), await real('/dashboard')];
      assert.deepEqual(a.dinero, r.dinero);
      assert.deepEqual(a.pedidos, r.pedidos);
      assert.deepEqual(a.serie, r.serie);
      assert.deepEqual(a.topProductos, r.topProductos);
      assert.deepEqual(a.entregas.map((e: any) => [e.folio, e.fechaEntrega, e.saldo, e.atrasada]), r.entregas.map((e: any) => [e.folio, e.fechaEntrega, e.saldo, e.atrasada]));
      assert.deepEqual(a.alertas.map((x: any) => `${x.titulo} | ${x.detalle}`).sort(), r.alertas.map((x: any) => `${x.titulo} | ${x.detalle}`).sort());
      assert.deepEqual(a.pollitandas, r.pollitandas);
    });
    await prueba('inventario: existencias por producto', async () => {
      const quitar = (lista: any[]) => lista.map(({ id: _id, ...e }) => e);
      assert.deepEqual(quitar(await dir.get('/inventario/existencias')), quitar(await real('/inventario/existencias')));
    });
    await prueba('cobranza: cuentas por cobrar, antigüedad y resumen', async () => {
      const [a, r] = [await dir.get('/cobranza/por-cobrar'), await real('/cobranza/por-cobrar')];
      assert.deepEqual(a.antiguedad, r.antiguedad);
      assert.deepEqual([a.total, a.vencido], [r.total, r.vencido]);
      assert.deepEqual(a.cuentas.map((c: any) => [c.folio, c.saldo, c.diasVencido]), r.cuentas.map((c: any) => [c.folio, c.saldo, c.diasVencido]));
      const [ra, rr] = [await dir.get('/cobranza/resumen'), await real('/cobranza/resumen')];
      assert.deepEqual([ra.cobradoHoy, ra.cobradoMes, ra.pagosMes], [rr.cobradoHoy, rr.cobradoMes, rr.pagosMes]);
    });
    await prueba('reporte de ventas del mes', async () => {
      const [a, r] = [await dir.get('/reportes/ventas'), await real('/reportes/ventas')];
      assert.deepEqual(a.totales, r.totales);
      assert.deepEqual(a.porDia, r.porDia);
      assert.deepEqual(a.porProducto, r.porProducto);
      assert.deepEqual(a.cobranza, r.cobranza);
    });
    await prueba('Pollitandas: cupo, cobrado y expedientes', async () => {
      const [a, r] = [await dir.get('/pollitandas/1'), await real('/pollitandas/1')];
      for (const k of ['participantes', 'paquetesVendidos', 'cupoDisponible', 'pollitos', 'pollitosPorSurtir', 'vendido', 'cobrado', 'porCobrar']) assert.equal(a[k], r[k], k);
      assert.deepEqual(a.expedientes.map((e: any) => [e.folio, e.estado, e.saldo, e.pedido.folio]), r.expedientes.map((e: any) => [e.folio, e.estado, e.saldo, e.pedido.folio]));
    });
    await prueba('bandeja de mensajes: mismos textos', async () => {
      const [a, r] = [await dir.get('/notificaciones'), await real('/notificaciones')];
      assert.deepEqual(a.conteo, r.conteo);
      assert.deepEqual(a.datos.map((n: any) => n.mensaje).sort(), r.datos.map((n: any) => n.mensaje).sort());
    });
  }

  console.log('Acceso y permisos');
  await prueba('rechaza contraseña incorrecta y exige sesión', async () => {
    assert.equal((await enviar('POST', '/auth/login', { email: 'direccion@avicolasanangel.com', password: 'mala' }, null)).estado, 401);
    assert.equal((await enviar('GET', '/clientes', undefined, null)).estado, 401);
  });
  await prueba('Ventas no entra a configuración, reportes ni logística', async () => {
    await ven.get('/usuarios', 403);
    await ven.get('/reportes/ventas', 403);
    await ven.post('/productos', { sku: 'X1', nombre: 'No debería', precio: 1 }, 403);
  });

  console.log('Flujo del documento');
  let pedido: any;
  const pollito = b.productos.find((p) => p.sku === 'POL-ENG-01')!.id;
  await prueba('el siguiente pedido es el PSA-000125 y aparta 20 pollitos', async () => {
    const antes = await existencia(pollito);
    pedido = await ven.post('/pedidos', { clienteId: 1, items: [{ productoId: pollito, cantidad: 20 }], confirmar: true, fechaEntrega: sumarDias(hoy(), 3) });
    assert.equal(pedido.folio, 'PSA-000125');
    assert.equal(pedido.total, 350);
    const despues = await existencia(pollito);
    assert.deepEqual([despues.fisica, despues.reservada, despues.disponible], [antes.fisica, antes.reservada + 20, antes.disponible - 20]);
  });
  await prueba('anticipo, tope de saldo y recibo', async () => {
    const pago = await ven.post('/pagos', { pedidoId: pedido.id, monto: 150, metodo: 'EFECTIVO' });
    assert.equal(pago.saldoPedido, 200);
    await ven.post('/pagos', { pedidoId: pedido.id, monto: 200.01, metodo: 'EFECTIVO' }, 409);
    assert.equal((await dir.get(`/pagos/${pago.id}`)).saldoDespues, 200);
  });
  await prueba('entrega: baja la existencia física y queda la cuenta por cobrar', async () => {
    const antes = await existencia(pollito);
    await ven.post(`/pedidos/${pedido.id}/estado`, { estado: 'PREPARADO' }, 403);
    await dir.post(`/pedidos/${pedido.id}/estado`, { estado: 'PREPARADO' });
    await dir.post(`/pedidos/${pedido.id}/estado`, { estado: 'EN_RUTA' });
    const r = await dir.post(`/pedidos/${pedido.id}/estado`, { estado: 'ENTREGADO', recibidoPor: 'Cliente' });
    assert.deepEqual([r.estado, r.saldo], ['ENTREGADO', 200]);
    const despues = await existencia(pollito);
    assert.deepEqual([despues.fisica, despues.reservada], [antes.fisica - 20, antes.reservada - 20]);
    assert.ok((await dir.get('/cobranza/por-cobrar')).cuentas.some((c: any) => c.id === pedido.id && c.saldo === 200));
  });

  console.log('Inventario');
  await prueba('sin existencia: se rechaza, no aparta nada y no consume folio', async () => {
    const rojo = b.productos.find((p) => p.sku === 'HUE-ROJ-360')!.id;
    const antes = await existencia(rojo);
    const r = await enviar('POST', '/pedidos', { clienteId: 1, items: [{ productoId: rojo, cantidad: 9999 }], confirmar: true }, tokens.ventas);
    assert.deepEqual([r.estado, r.datos.codigo], [409, 'SIN_EXISTENCIA']);
    assert.deepEqual(await existencia(rojo), antes);
    const siguiente = await ven.post('/pedidos', { clienteId: 1, items: [{ productoId: rojo, cantidad: 1 }], confirmar: true });
    assert.equal(siguiente.folio, 'PSA-000126');
  });
  await prueba('toma primero el lote que vence antes y nunca uno que venza antes de la entrega', async () => {
    const p = await dir.post('/productos', { sku: 'LOTES', nombre: 'Producto lotes', categoria: 'HUEVO', unidad: 'caja', precio: 10 });
    const dia = hoy();
    await dir.post('/inventario/lotes', { productoId: p.id, sucursalId: 1, cantidad: 5, fechaLimiteVenta: sumarDias(dia, 10) });
    await dir.post('/inventario/lotes', { productoId: p.id, sucursalId: 1, cantidad: 5, fechaLimiteVenta: sumarDias(dia, 2) });
    await dir.post('/inventario/lotes', { productoId: p.id, sucursalId: 1, cantidad: 50, fechaIngreso: sumarDias(dia, -8), fechaLimiteVenta: sumarDias(dia, -1) });
    assert.equal((await existencia(p.id)).disponible, 10);
    const r = await ven.post('/pedidos', { clienteId: 2, items: [{ productoId: p.id, cantidad: 7 }], confirmar: true });
    assert.deepEqual(r.items[0].lotes.map((l: any) => l.cantidad), [5, 2]);
    await ven.post('/pedidos', { clienteId: 2, items: [{ productoId: p.id, cantidad: 2 }], confirmar: true, fechaEntrega: sumarDias(dia, 20) }, 409);
  });
  await prueba('un ajuste no puede dejar la existencia por debajo de lo apartado', async () => {
    const lote = (await dir.get(`/inventario/lotes?productoId=${pollito}`))[0];
    await dir.post(`/inventario/lotes/${lote.id}/ajuste`, { cantidadFisica: lote.cantidadReservada - 1, motivo: 'Conteo físico' }, 409);
    await ven.post(`/inventario/lotes/${lote.id}/ajuste`, { cantidadFisica: 1, motivo: 'Sin permiso' }, 403);
  });
  await prueba('preventa: al entrar el lote se aparta sola para los pedidos que esperaban', async () => {
    const pollita = b.productos.find((p) => p.sku === 'POL-PON-01')!.id;
    assert.equal((await existencia(pollita)).porSurtir, 30);
    const r = await dir.post('/inventario/lotes', { productoId: pollita, sucursalId: 1, cantidad: 200 });
    assert.deepEqual(r.pedidosSurtidos, ['PSA-000123', 'PSA-000124']);
    const e = await existencia(pollita);
    assert.deepEqual([e.fisica, e.reservada, e.disponible, e.porSurtir], [200, 30, 170, 0]);
  });

  console.log('Cotizaciones y cancelaciones');
  await prueba('la cotización no aparta; al confirmarla recibe folio PSA y el prospecto pasa a cliente', async () => {
    const prospecto = b.clientes.find((c) => c.nombre === 'Panadería San José')!;
    const cot = await ven.post('/pedidos', { clienteId: prospecto.id, items: [{ productoId: pollito, cantidad: 10 }], confirmar: false });
    assert.match(cot.folio, /^COT-/);
    await ven.post('/pagos', { pedidoId: cot.id, monto: 10, metodo: 'EFECTIVO' }, 400);
    const firme = await ven.post(`/pedidos/${cot.id}/confirmar`);
    assert.match(firme.folio, /^PSA-/);
    assert.equal(firme.folioCotizacion, cot.folio);
    assert.equal((await dir.get(`/clientes/${prospecto.id}`)).tipo, 'CLIENTE');
  });
  await prueba('vender bajo precio de lista o con descuento requiere permiso', async () => {
    await ven.post('/pedidos', { clienteId: 1, items: [{ productoId: pollito, cantidad: 1, precioUnitario: 10 }], confirmar: false }, 403);
    await ven.post('/pedidos', { clienteId: 1, items: [{ productoId: pollito, cantidad: 1 }], descuento: 5, confirmar: false }, 403);
    const r = await dir.post('/pedidos', { clienteId: 1, items: [{ productoId: pollito, cantidad: 10, precioUnitario: 15 }], descuento: 30, confirmar: false });
    assert.deepEqual([r.subtotal, r.descuento, r.total], [150, 30, 120]);
  });
  await prueba('cancelar libera lo apartado; con pagos exige cancelar primero el pago', async () => {
    const antes = await existencia(pollito);
    const p = await ven.post('/pedidos', { clienteId: 3, items: [{ productoId: pollito, cantidad: 6 }], confirmar: true });
    const pago = await ven.post('/pagos', { pedidoId: p.id, monto: 50, metodo: 'EFECTIVO' });
    await ven.post(`/pedidos/${p.id}/cancelar`, { motivo: 'El cliente desistió' }, 403);
    await dir.post(`/pedidos/${p.id}/cancelar`, { motivo: 'El cliente desistió' }, 409);
    await dir.post(`/pagos/${pago.id}/cancelar`, { motivo: 'Devolución en efectivo' });
    const c = await dir.post(`/pedidos/${p.id}/cancelar`, { motivo: 'El cliente desistió' });
    assert.deepEqual([c.estado, c.pagado, c.saldo], ['CANCELADO', 0, 0]);
    assert.deepEqual(await existencia(pollito), antes);
  });
  await prueba('una incidencia detiene el pedido y al resolverse regresa a donde estaba', async () => {
    const p = await ven.post('/pedidos', { clienteId: 3, items: [{ productoId: pollito, cantidad: 2 }], confirmar: true });
    await dir.post(`/pedidos/${p.id}/estado`, { estado: 'PREPARADO' });
    await dir.post(`/pedidos/${p.id}/estado`, { estado: 'INCIDENCIA' }, 400);
    const inc = await dir.post(`/pedidos/${p.id}/estado`, { estado: 'INCIDENCIA', nota: 'Caja dañada' });
    assert.deepEqual([inc.estado, inc.incidencia, inc.siguientes], ['INCIDENCIA', 'Caja dañada', ['PREPARADO']]);
    assert.equal((await dir.post(`/pedidos/${p.id}/estado`, { estado: 'PREPARADO' })).estado, 'PREPARADO');
  });

  console.log('Pollitandas');
  await prueba('inscribir genera el pedido, aparta las aves y cobra el anticipo', async () => {
    const antes = await dir.get('/pollitandas/1');
    await ven.post('/pollitandas/1/inscripciones', { clienteId: 3, paquetes: 2, anticipo: { monto: 150, metodo: 'EFECTIVO' } }, 400);
    const e = await ven.post('/pollitandas/1/inscripciones', { clienteId: 3, paquetes: 2, anticipo: { monto: 200, metodo: 'EFECTIVO' } });
    assert.deepEqual([e.cantidadPollitos, e.total, e.pagado, e.saldo, e.estado, e.pollitosPorSurtir], [40, 700, 200, 500, 'EN_PAGOS', 0]);
    const despues = await dir.get('/pollitandas/1');
    assert.deepEqual([despues.paquetesVendidos, despues.cupoDisponible, despues.cobrado], [antes.paquetesVendidos + 2, antes.cupoDisponible - 2, antes.cobrado + 200]);
    await ven.post('/pollitandas/1/inscripciones', { clienteId: 4, paquetes: despues.cupoDisponible + 1 }, 409);
    await ven.post('/pagos', { pedidoId: e.pedido.id, monto: 500, metodo: 'TRANSFERENCIA' });
    assert.equal((await dir.get(`/pollitandas/expedientes/${e.id}`)).estado, 'LIQUIDADO');
  });
  await prueba('la baja de un participante libera su lugar', async () => {
    const antes = await dir.get('/pollitandas/1');
    const apartado = antes.expedientes.find((x: any) => x.estado === 'APARTADO');
    await dir.post(`/pollitandas/expedientes/${apartado.id}/baja`, { motivo: 'Ya no pudo participar' });
    assert.equal((await dir.get('/pollitandas/1')).cupoDisponible, antes.cupoDisponible + apartado.paquetes);
  });

  console.log('Indicadores');
  await prueba('el reporte de ventas cuadra y el tablero oculta el dinero a Logística', async () => {
    const r = await dir.get('/reportes/ventas');
    assert.equal(Math.round(r.porDia.reduce((s: number, d: any) => s + d.total, 0) * 100), Math.round(r.totales.total * 100));
    assert.equal(Math.round(r.porProducto.reduce((s: number, p: any) => s + p.importe, 0) * 100), Math.round((r.totales.total + r.totales.descuentos) * 100));
    const log = await (await como('logistica')).get('/dashboard');
    assert.equal(log.dinero, null);
    assert.ok(log.pedidos && log.entregas.length > 0);
  });
  await prueba('los recordatorios no se repiten', async () => {
    assert.deepEqual(await ven.post('/notificaciones/recordatorios'), { cotizaciones: 0, saldos: 0, anticipos: 0, entregas: 0 });
  });

  console.log(process.exitCode ? '\nHay pruebas que fallaron.' : `\n${ok} pruebas correctas.`);
}

void main();
