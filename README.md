# tiendas

Catálogo de productos en un único formato, publicable en **Shopify** y en
**Tiendanube / Nuvemshop** con el mismo comando.

El catálogo que viene incluido es el de **Noctu**, una marca de productos para
dormir. Por qué se eligió ese producto y no otro está en
[`docs/PRODUCTO-GANADOR.md`](docs/PRODUCTO-GANADOR.md).

---

## Requisitos

Node 22.18 o superior. Nada más.

El proyecto **no tiene dependencias de runtime**: Node ejecuta los archivos
TypeScript directamente borrando los tipos, y usa `fetch` nativo para hablar con
las APIs. No hace falta `npm install` para usarlo.

```bash
node --version   # v22.18.0 o mayor
node src/cli.ts list
```

`npm install` sólo hace falta para correr `npm run typecheck`, que necesita
TypeScript y `@types/node`.

---

## Empezar

### 1. Mirá el catálogo

```bash
node src/cli.ts list
```

Valida los tres productos y muestra precios, variantes y stock. Si un JSON del
catálogo está mal, este comando te dice exactamente qué campo y en qué archivo.

### 2. Revisá los números

```bash
node src/cli.ts pricing --market AR --cac 6000 --shipping 3500
```

Calcula margen bruto, ganancia neta y **ROAS de equilibrio** por variante, con
tus supuestos de comisión de pasarela, envío y costo de adquisición.

Como referencia: **markup de 3x o más** y **ROAS de equilibrio de 2x o menos**
es el piso para que un producto aguante tráfico pago.

### 3. Mirá qué se va a enviar, sin enviar nada

```bash
node src/cli.ts preview --platform tiendanube --product noctu-antifaz-blackout-3d
```

Imprime el payload exacto. No usa credenciales ni toca la red.

### 4. Conectá la tienda

```bash
cp .env.example .env
```

`.env.example` tiene, paso por paso, cómo sacar las credenciales en cada
plataforma. Completá sólo la que vayas a usar. `.env` está en `.gitignore`.

```bash
node src/cli.ts ping
```

Te confirma contra qué tienda quedó conectado. Si algo está mal, el error dice
qué credencial revisar.

### 5. Publicá

```bash
node src/cli.ts publish --market AR
```

Pide confirmación antes de escribir nada. Con `--yes` la omite.

**Es idempotente**: busca el producto por *handle* y, si ya existe, lo actualiza
en lugar de duplicarlo. Podés correrlo las veces que quieras.

---

## Antes de vender de verdad

Dos cosas del catálogo son deliberadamente provisorias:

1. **Las imágenes son placeholders.** Dicen "REEMPLAZAR" encima. Cambiá el campo
   `images[].src` de cada JSON por URLs `https` de tus fotos reales antes de
   publicar en producción.
2. **Los precios por mercado están anclados a USD** con un tipo de cambio
   aproximado a septiembre de 2026. Verificalos con
   `node src/cli.ts pricing --market <tu mercado>`: si el markup bajó de 3x, el
   tipo de cambio se movió y hay que reajustar.

Los demás supuestos a verificar (costo del proveedor, especificaciones del
producto) están listados al final de
[`docs/PRODUCTO-GANADOR.md`](docs/PRODUCTO-GANADOR.md).

---

## Comandos

| Comando | Qué hace | ¿Red? |
|---|---|---|
| `list` | Lista y valida el catálogo | no |
| `pricing` | Economía unitaria por variante | no |
| `preview` | Imprime el payload que se enviaría | no |
| `ping` | Verifica credenciales contra la API | sí |
| `publish` | Crea o actualiza productos en la tienda | sí |

Opciones comunes:

| Opción | Para qué |
|---|---|
| `--platform shopify\|tiendanube` | Una sola plataforma. Por defecto, todas las que tengan credenciales. |
| `--product <slug>` | Un solo producto. Por defecto, todo el catálogo. |
| `--market AR\|MX\|CO\|CL\|UY\|BR\|US` | Qué precios usar. Por defecto `US`. |
| `--yes` | Publicar sin confirmación interactiva. |

---

## Agregar un producto

Creá un `.json` en `catalog/`. El validador te va a guiar: exige slug en
kebab-case, SKUs únicos, combinaciones de opciones sin repetir, imágenes `https`
y títulos SEO dentro de los límites de los buscadores.

```jsonc
{
  "slug": "mi-producto",
  "name": "Mi producto",
  "descriptionHtml": "<p>...</p>",
  "brand": "Noctu",
  "productType": "Categoría",
  "published": true,
  "seo": { "title": "≤ 70 caracteres", "description": "≤ 160 caracteres" },
  "tags": ["tag"],
  "options": ["Color"],            // [] si no tiene variantes
  "variants": [
    {
      "optionValues": ["Negro"],   // un valor por cada opción
      "sku": "SKU-UNICO",
      "weightKg": 0.085,
      "stock": 100                 // null = stock ilimitado
    }
  ],
  "images": [{ "src": "https://...", "alt": "..." }],
  "pricing": {
    "currency": "USD",
    "price": 24.9,
    "compareAtPrice": 34.9,        // opcional, precio tachado
    "cost": 3.2
  },
  "markets": {
    "AR": { "currency": "ARS", "price": 33900, "cost": 4400 }
  }
}
```

### Cómo se resuelven los precios

La precedencia es **variante → mercado → producto**. Cada nivel pisa sólo los
campos que define.

Con una excepción importante: **si un override cambia de moneda, no hereda
montos del nivel de abajo.** Un `compareAtPrice` de USD 30 sobre un precio de
ARS 30.000 sería un descuento absurdo, así que el override tiene que traer sus
propios `price` y `cost`. Si falta alguno, falla con un mensaje que lo dice.

---

## Cómo está armado

```
catalog/          Un JSON por producto. Formato neutro, no atado a ninguna plataforma.
src/types.ts      El modelo canónico de producto.
src/catalog/      Carga y validación del catálogo.
src/pricing.ts    Resolución de precios por mercado y economía unitaria.
src/adapters/     Un adaptador por plataforma.
src/cli.ts        La línea de comandos.
docs/             Investigación del producto y plan de lanzamiento.
```

El catálogo se escribe **una vez** en un formato propio y cada adaptador lo
traduce al de su plataforma. Agregar una tercera plataforma es implementar la
interfaz `Adapter` de `src/types.ts`; el catálogo no se toca.

### Notas sobre cada plataforma

**Shopify** — usa la **Admin GraphQL API** (versión `2026-07`). Los endpoints
REST de productos están deprecados desde `2024-04`, así que no se usan. La
publicación es una sola mutación `productSet` con opciones, variantes, precios,
stock e imágenes. Reintenta automáticamente ante `429` y ante `THROTTLED`.

Scopes necesarios: `write_products`, `read_products`, `write_inventory`,
`read_inventory`, `read_locations`.

**Tiendanube** — usa la API REST `v1`. Dos particularidades que el adaptador
resuelve por vos:

- Los campos de texto son multi-idioma (`{"es": "..."}`), y el idioma correcto
  se consulta a la tienda en vez de asumirse.
- `PUT /products/{id}` **no** actualiza las variantes anidadas. Al actualizar,
  el adaptador sincroniza las variantes una por una contra
  `/products/{id}/variants`, emparejándolas por SKU. Las variantes remotas que
  no estén en el catálogo se dejan intactas: nunca se borra stock ni historial
  de ventas sin que alguien lo haya pedido.

El header `TIENDANUBE_USER_AGENT` es obligatorio y tiene que incluir un email de
contacto real; la API limita o rechaza las peticiones sin él.

---

## Desarrollo

```bash
node --test          # 22 tests, sin dependencias
npm run typecheck    # requiere npm install
```

Los tests cubren la resolución de precios entre monedas, la economía unitaria,
el mapeo a cada plataforma y una verificación de que el producto principal
mantiene markup ≥ 3x y ROAS de equilibrio ≤ 2x en todos los mercados del
catálogo.
