#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { availablePlatforms, loadDotEnv } from './config.ts';
import { loadCatalog, findProduct } from './catalog/index.ts';
import { ShopifyAdapter } from './adapters/shopify.ts';
import { TiendanubeAdapter } from './adapters/tiendanube.ts';
import {
  AR_REGIMES,
  AR_REGIME_NAMES,
  assumptionsFor,
  formatMoney,
  formatPct,
  resolvePricing,
  unitEconomics,
  type ArRegime,
  type CostAssumptions,
} from './pricing.ts';
import { MARKETS, type Adapter, type Market, type Product } from './types.ts';

const PLATFORMS = ['shopify', 'tiendanube'] as const;
type Platform = (typeof PLATFORMS)[number];

/** El proyecto vende en Argentina, así que ese es el mercado por defecto. */
const DEFAULT_MARKET: Market = 'AR';

const USAGE = `
tiendas — publica el catálogo en Shopify y/o Tiendanube

Uso: node src/cli.ts <comando> [opciones]

Comandos
  list                    Lista los productos del catálogo y valida su estructura
  pricing                 Economía unitaria de cada variante (margen, ROAS de equilibrio)
  preview                 Imprime el payload exacto que se enviaría, sin tocar la red
  ping                    Verifica las credenciales contra la API de cada plataforma
  publish                 Crea o actualiza los productos en la tienda

Opciones
  --platform <nombre>     shopify | tiendanube  (por defecto: las que tengan credenciales)
  --product <slug>        Un solo producto     (por defecto: todo el catálogo)
  --market <código>       ${MARKETS.join(' | ')}   (por defecto: ${DEFAULT_MARKET})
  --cac <monto>           Costo de adquisición por cliente, para 'pricing'
  --shipping <monto>      Envío absorbido por pedido, neto de IVA, para 'pricing'
  --payment-fee <tasa>    Comisión de la pasarela, ej. 0.0785, para 'pricing'
  --regimen <nombre>      Sólo para --market AR: monotributo | responsable-inscripto
                          (por defecto: responsable-inscripto)
  --yes                   Publica sin pedir confirmación
  --help                  Muestra esta ayuda

Ejemplos
  node src/cli.ts list
  node src/cli.ts pricing --market AR --regimen monotributo --shipping 3500
  node src/cli.ts preview --platform tiendanube --product noctu-antifaz-blackout-3d
  node src/cli.ts publish --platform tiendanube --yes
`.trim();

function parseMarket(value: string | undefined): Market {
  const market = (value ?? DEFAULT_MARKET).toUpperCase() as Market;
  if (!MARKETS.includes(market)) {
    throw new Error(`Mercado inválido: ${value}. Válidos: ${MARKETS.join(', ')}`);
  }
  return market;
}

function parsePlatforms(value: string | undefined): Platform[] {
  if (value) {
    const platform = value.toLowerCase() as Platform;
    if (!PLATFORMS.includes(platform)) {
      throw new Error(`Plataforma inválida: ${value}. Válidas: ${PLATFORMS.join(', ')}`);
    }
    return [platform];
  }

  const detected = availablePlatforms() as Platform[];
  if (detected.length === 0) {
    throw new Error(
      'No hay credenciales configuradas. Copiá .env.example a .env y completalo, ' +
        'o elegí la plataforma con --platform.',
    );
  }
  return detected;
}

function makeAdapter(platform: Platform): Adapter {
  return platform === 'shopify' ? new ShopifyAdapter() : new TiendanubeAdapter();
}

function selectProducts(slug: string | undefined): Product[] {
  return slug ? [findProduct(slug)] : loadCatalog();
}

/**
 * Resuelve el régimen impositivo argentino.
 *
 * Es específico de Argentina: en otros mercados el flag no aplica, y pasarlo
 * ahí casi siempre significa que el usuario se equivocó de `--market`.
 */
function parseRegime(value: string | undefined, market: Market): Partial<CostAssumptions> {
  if (value === undefined) return {};

  if (market !== 'AR') {
    throw new Error(`--regimen sólo aplica a --market AR, no a ${market}`);
  }
  if (!AR_REGIME_NAMES.includes(value as ArRegime)) {
    throw new Error(`Régimen inválido: ${value}. Válidos: ${AR_REGIME_NAMES.join(', ')}`);
  }
  return AR_REGIMES[value as ArRegime];
}

function parseNumber(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} debe ser un número, recibido: ${value}`);
  return parsed;
}

function commandList(): void {
  const catalog = loadCatalog();
  console.log(`${catalog.length} producto(s) en el catálogo:\n`);

  for (const product of catalog) {
    const stock = product.variants.reduce<number | null>(
      (total, v) => (total === null || v.stock === null ? null : total + v.stock),
      0,
    );
    console.log(`  ${product.slug}`);
    console.log(`    ${product.name}`);
    console.log(
      `    ${product.variants.length} variante(s) · stock ${stock ?? 'ilimitado'} · ` +
        `${formatMoney(product.pricing.price, product.pricing.currency)} · ` +
        `${product.published ? 'publicado' : 'borrador'}`,
    );
    console.log('');
  }
  console.log('Catálogo válido.');
}

function commandPricing(
  market: Market,
  assumptions: CostAssumptions,
  slug?: string,
  regime?: string,
): void {
  // Se resuelve el catálogo antes de imprimir nada, para que un slug inexistente
  // no deje media tabla en pantalla seguida de un error.
  const products = selectProducts(slug);

  const regimeLabel = market === 'AR' ? ` · ${regime ?? 'responsable-inscripto'}` : '';
  console.log(`Economía unitaria — mercado ${market}${regimeLabel}`);
  console.log(
    `Supuestos: IVA ${formatPct(assumptions.salesTaxRate)} incluido en el precio · ` +
      `IIBB ${formatPct(assumptions.grossReceiptsTaxRate)} · ` +
      `pasarela ${formatPct(assumptions.paymentFeeRate)}`,
  );
  console.log(
    `           envío ${assumptions.shippingCost} · CAC ${assumptions.cac} · ` +
      `devoluciones ${formatPct(assumptions.returnRate)}`,
  );
  if (assumptions.irrecoverableInputTaxRate > 0) {
    console.log(
      `           el IVA ${formatPct(assumptions.irrecoverableInputTaxRate)} de las compras ` +
        `no es crédito fiscal, así que va al costo`,
    );
  }
  console.log('');

  for (const product of products) {
    console.log(`  ${product.name}`);

    for (const variant of product.variants) {
      const pricing = resolvePricing(product, variant, market);
      const economics = unitEconomics(pricing, assumptions);
      const label = variant.optionValues.join(' / ') || 'único';

      console.log(`    ${variant.sku}  (${label})`);
      console.log(
        `      precio final ${formatMoney(economics.price, economics.currency)} · ` +
          `ingreso neto ${formatMoney(economics.netRevenue, economics.currency)} · ` +
          `costo ${formatMoney(economics.cost, economics.currency)}`,
      );
      console.log(
        `      markup ${economics.markup.toFixed(1)}x · ` +
          `margen bruto ${formatPct(economics.grossMargin)} · ` +
          `neto ${formatMoney(economics.netProfit, economics.currency)} ` +
          `(${formatPct(economics.netMargin)})`,
      );
      console.log(`      ROAS de equilibrio ${economics.breakEvenRoas.toFixed(2)}x`);
    }
    console.log('');
  }

  console.log(
    'Referencia: markup >= 3x y ROAS de equilibrio <= 2x es el piso para vender con tráfico pago.',
  );
}

async function commandPreview(platforms: Platform[], market: Market, slug?: string): Promise<void> {
  const products = selectProducts(slug);

  for (const platform of platforms) {
    for (const product of products) {
      console.log(`--- ${platform} · ${product.slug} · ${market} ---`);

      // El preview no toca la red, así que se usan valores de ejemplo para los
      // datos que normalmente se consultan a la tienda.
      const payload =
        platform === 'shopify'
          ? new ShopifyAdapter({
              shop: 'preview.myshopify.com',
              accessToken: 'preview',
              apiVersion: 'preview',
            }).buildInput(product, market, 'gid://shopify/Location/0', null)
          : new TiendanubeAdapter({
              storeId: '0',
              accessToken: 'preview',
              userAgent: 'preview',
            }).buildBody(product, market, 'es');

      console.log(JSON.stringify(payload, null, 2));
      console.log('');
    }
  }
}

async function commandPing(platforms: Platform[]): Promise<void> {
  let failed = false;

  for (const platform of platforms) {
    try {
      const description = await makeAdapter(platform).ping();
      console.log(`  ok    ${platform.padEnd(11)} ${description}`);
    } catch (err) {
      failed = true;
      console.error(`  FALLA ${platform.padEnd(11)} ${(err as Error).message}`);
    }
  }

  if (failed) process.exitCode = 1;
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error('publish necesita confirmación interactiva; usá --yes para omitirla');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [s/N] `);
    return /^s(i|í)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function commandPublish(
  platforms: Platform[],
  market: Market,
  slug: string | undefined,
  skipConfirm: boolean,
): Promise<void> {
  const products = selectProducts(slug);

  // Los adaptadores se construyen antes de pedir confirmación: si falta una
  // credencial, conviene saberlo ahora y no después de confirmar la publicación.
  const adapters = platforms.map(makeAdapter);

  console.log(
    `Se van a publicar ${products.length} producto(s) en ${platforms.join(', ')} ` +
      `con precios de ${market}:`,
  );
  for (const product of products) console.log(`  · ${product.slug}`);
  console.log('');

  if (!skipConfirm && !(await confirm('¿Confirmás?'))) {
    console.log('Cancelado. No se publicó nada.');
    return;
  }

  let failed = false;

  for (const adapter of adapters) {
    for (const product of products) {
      try {
        const result = await adapter.publish(product, market);
        const verb = result.created ? 'creado   ' : 'actualizado';
        console.log(
          `  ${verb} ${adapter.name} · ${result.slug} → ${result.adminUrl ?? result.remoteId}`,
        );
      } catch (err) {
        failed = true;
        console.error(`  FALLA     ${adapter.name} · ${product.slug}: ${(err as Error).message}`);
      }
    }
  }

  if (failed) process.exitCode = 1;
}

async function main(): Promise<void> {
  loadDotEnv();

  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      platform: { type: 'string' },
      product: { type: 'string' },
      market: { type: 'string' },
      cac: { type: 'string' },
      shipping: { type: 'string' },
      'payment-fee': { type: 'string' },
      regimen: { type: 'string' },
      yes: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  const command = positionals[0];
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }

  const market = parseMarket(values.market);

  switch (command) {
    case 'list':
      return commandList();

    case 'pricing': {
      // Los impuestos y la comisión salen del mercado; las banderas los pisan.
      const overrides: Partial<CostAssumptions> = {};
      const cac = parseNumber(values.cac, '--cac');
      const shipping = parseNumber(values.shipping, '--shipping');
      const paymentFee = parseNumber(values['payment-fee'], '--payment-fee');

      if (cac !== undefined) overrides.cac = cac;
      if (shipping !== undefined) overrides.shippingCost = shipping;
      if (paymentFee !== undefined) overrides.paymentFeeRate = paymentFee;

      const assumptions = assumptionsFor(market, {
        ...parseRegime(values.regimen, market),
        ...overrides,
      });
      return commandPricing(market, assumptions, values.product, values.regimen);
    }

    case 'preview':
      // preview no usa credenciales, así que acepta --platform sin tener .env.
      return commandPreview(
        values.platform ? parsePlatforms(values.platform) : [...PLATFORMS],
        market,
        values.product,
      );

    case 'ping':
      return commandPing(parsePlatforms(values.platform));

    case 'publish':
      return commandPublish(parsePlatforms(values.platform), market, values.product, values.yes);

    default:
      console.error(`Comando desconocido: ${command}\n`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
