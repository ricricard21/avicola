# Avícola San Ángel · Sistema de gestión (Etapa 1)

Administración comercial: usuarios y permisos, clientes (CRM), ventas, Pollitandas, catálogo, inventario por lotes y cobranza. Todo sobre una sola base de datos: un dato se captura una vez y aparece en los módulos que lo necesitan.

```
avicola-san-angel/
├── api/     API (NestJS 11 + TypeORM + PostgreSQL)   → servicio "api" en Railway
├── web/     Panel (Next.js 16 + React 19 + Tailwind) → servicio "web" en Railway
├── docker-compose.yml   PostgreSQL local para desarrollo
└── README.md
```

Las dos carpetas van **tal cual en la raíz del repositorio**. Cada una es un servicio independiente con su propio `package.json`.

## Arrancar en local

Requisitos: Node 20.12 o superior y PostgreSQL 14+ (o Docker).

```bash
docker compose up -d                 # base de datos en localhost:5432

cd api
cp .env.example .env                 # revisar DATABASE_URL y JWT_SECRET
npm install
npm run db:seed                      # datos de demostración (crea las tablas al vuelo)
npm run start:dev                    # API en http://localhost:4000/api

cd ../web
cp .env.example .env.local
npm install
npm run dev                          # panel en http://localhost:3000
```

Las tablas se crean solas: la API aplica las migraciones pendientes cada vez que arranca.

### Usuarios de la demostración

Contraseña para todos: `Avicola2026`

| Rol | Correo |
| --- | --- |
| Director general | direccion@avicolasanangel.com |
| Ventas | ventas@avicolasanangel.com |
| Almacén e inventario | almacen@avicolasanangel.com |
| Cobranza | cobranza@avicolasanangel.com |
| Logística | logistica@avicolasanangel.com |
| Encargado de granja | granja@avicolasanangel.com |

Clientes, teléfonos, precios y existencias de la demostración son ficticios.

## Publicar en Railway

1. Crear un proyecto y agregar **PostgreSQL**.
2. Servicio **api** — Root Directory `api` · Build `npm ci && npm run build` · Start `npm run start`. Variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` = cadena aleatoria de 48+ caracteres (`openssl rand -base64 48`)
   - `CORS_ORIGIN` = URL pública del panel (varias separadas por coma)
   - `NODE_ENV` = `production` · `TZ` = `America/Mexico_City`
3. Servicio **web** — Root Directory `web` · Build `npm ci && npm run build` · Start `npm run start`. Variable:
   - `NEXT_PUBLIC_API_URL` = URL pública de la API terminada en `/api`. Se lee **al compilar**: si cambia hay que volver a desplegar.
4. Crear el primer usuario (una sola vez), desde la carpeta `api` con las variables del servicio:
   ```bash
   ADMIN_EMAIL=direccion@avicolasanangel.com npm run db:seed:prod -- --minimo
   ```
   Imprime la contraseña generada del director. Para cargar la demostración en lugar del arranque limpio: `npm run db:seed:prod`.

`npm run db:seed -- --forzar` borra **toda** la base antes de sembrar. Nunca usarlo con datos reales.

## Qué hace cada módulo

| Pantalla | Qué resuelve |
| --- | --- |
| Inicio | Ventas del mes, cobranza, flujo de pedidos, entregas, alertas y contactos pendientes, según los permisos de quien entra |
| Clientes | Clientes, distribuidores y prospectos con su expediente: compras, pagos, Pollitandas y seguimiento comercial |
| Ventas | Cotización → pedido → preparado → en ruta → entregado, con incidencias y cancelaciones |
| Pollitandas | Programas por paquetes con cupo y anticipo; expediente por participante |
| Productos | Catálogo, precios de lista y existencias mínimas |
| Inventario | Existencia física, apartada y disponible por lote; entradas, ajustes y movimientos |
| Cobranza | Cuentas por cobrar con antigüedad, registro y cancelación de pagos, comprobante imprimible |
| Mensajes | Bandeja de avisos de WhatsApp generados por el sistema y recordatorios diarios |
| Reportes | Ventas por día, producto, vendedor y cliente; descarga para Excel |
| Configuración | Usuarios, permisos por rol y por persona, sucursales y bitácora |

## Reglas de negocio que conviene conocer

- **Disponible = física − apartada.** Confirmar un pedido *aparta* inventario; la existencia física baja hasta que se entrega. Todo queda en movimientos.
- **Lotes.** Se toma primero el lote que vence antes; nunca uno vencido ni uno que venza antes de la fecha de entrega del pedido.
- **Preventa.** Se puede vender sin existencia; al registrar la entrada del lote se aparta sola para los pedidos que esperaban, del más antiguo al más reciente.
- **Folios** consecutivos sin huecos ni repetidos, aun con ventas simultáneas: `COT` cotizaciones, `PSA` pedidos, `REC` recibos, `PT` expedientes de Pollitanda, `LOT` lotes.
- **Pollitanda = pedido.** Inscribir genera el pedido, aparta las aves y registra el anticipo en una sola operación. El estado del expediente se deduce del pedido y sus pagos, así que no puede contradecirlos.
- **Nada se borra.** Pagos y pedidos se cancelan con motivo; un pedido con pagos exige cancelar primero el pago. Cada operación queda en la bitácora.
- **Permisos.** El rol da la base (`api/src/common/permisos.ts`); por persona se conceden o retiran permisos y se puede limitar a una sucursal. Los cambios aplican de inmediato.

## Pendientes por decisión del cliente

Quedaron preparados para conectarse sin rediseñar nada:

| Tema | Estado actual | Dónde se conecta |
| --- | --- | --- |
| WhatsApp oficial | Los mensajes se generan y se envían con un clic (abre WhatsApp con el texto escrito) | `ProveedorOficial` en `api/src/notificaciones/notificaciones.service.ts` + `WHATSAPP_PROVEEDOR=oficial` |
| Pasarela de pagos | Los pagos se registran a mano con forma de pago y referencia | `PagosService.registrar` desde el webhook de la pasarela |
| Facturación CFDI | Se emite comprobante interno, no fiscal | Nuevo módulo sobre `pedidos` y `pagos` |
| Dominio | Se usa el dominio temporal del hosting | `CORS_ORIGIN` y `NEXT_PUBLIC_API_URL` |

Granja y Distribución aparecen en el menú como Etapa 2, sin acceso.

## Desarrollo

```bash
cd api
npm run test:e2e                                     # 34 pruebas de punta a punta contra PostgreSQL (<base>_test)
npm run db:generar -- src/db/migrations/MiCambio     # nueva migración tras editar src/db/entities.ts
```

La migración generada se agrega a `api/src/db/migrations/index.ts`.

Estructura de la API: una carpeta por módulo con `*.controller.ts` (rutas y permisos), `*.service.ts` (reglas) y `*.dto.ts` (validación). Estructura del panel: `web/src/app/(panel)/<pantalla>/page.tsx`, componentes compartidos en `web/src/components`, llamadas a la API y formatos en `web/src/lib`.
