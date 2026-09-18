import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ShopifyAdapter } from './shopify.ts';
import { TiendanubeAdapter } from './tiendanube.ts';
import { unitEconomics, resolvePricing, assumptionsFor, AR_REGIMES } from '../pricing.ts';
import { loadCatalog, findProduct } from '../catalog/index.ts';
import type { Product } from '../types.ts';

const shopify = new ShopifyAdapter({
  shop: 'test.myshopify.com',
  accessToken: 'shpat_test',
  apiVersion: '2026-07',
});

const tiendanube = new TiendanubeAdapter({
  storeId: '1',
  accessToken: 'test',
  userAgent: 'test (test@example.com)',
});

const LOCATION = 'gid://shopify/Location/1';

function product(overrides: Partial<Product> = {}): Product {
  return {
    slug: 'test',
    name: 'Producto de prueba',
    descriptionHtml: '<p>Descripción</p>',
    brand: 'Marca',
    productType: 'Tipo',
    tags: ['a', 'b'],
    seo: { title: 'Título SEO', description: 'Descripción SEO' },
    options: ['Color'],
    variants: [
      { optionValues: ['Negro'], sku: 'SKU-NEG', weightKg: 0.1, stock: 10 },
      { optionValues: ['Gris'], sku: 'SKU-GRI', weightKg: 0.1, stock: 5 },
    ],
    images: [{ src: 'https://example.com/a.png', alt: 'alt' }],
    pricing: { currency: 'USD', price: 20, compareAtPrice: 30, cost: 4 },
    published: true,
    ...overrides,
  };
}

describe('resolvePricing', () => {
  test('la variante pisa al mercado y el mercado pisa al producto', () => {
    const p = product({
      markets: { AR: { currency: 'ARS', price: 30000, cost: 4000 } },
      variants: [
        { optionValues: ['Negro'], sku: 'A', weightKg: 0.1, stock: 1 },
        { optionValues: ['Gris'], sku: 'B', weightKg: 0.1, stock: 1, pricing: { price: 35000 } },
      ],
    });

    // El compareAtPrice de USD no se hereda: cambió la moneda.
    assert.deepEqual(resolvePricing(p, p.variants[0], 'AR'), {
      currency: 'ARS',
      price: 30000,
      cost: 4000,
    });
    assert.equal(resolvePricing(p, p.variants[1], 'AR').price, 35000);
  });

  test('un override que cambia de moneda debe traer sus propios montos', () => {
    const p = product({ markets: { AR: { currency: 'ARS', price: 30000 } } });
    assert.throws(() => resolvePricing(p, p.variants[0], 'AR'), /definir cost en ARS/);
  });

  test('un override en la misma moneda sí hereda lo que no define', () => {
    const p = product({ markets: { US: { price: 25 } } });
    assert.deepEqual(resolvePricing(p, p.variants[0], 'US'), {
      currency: 'USD',
      price: 25,
      compareAtPrice: 30,
      cost: 4,
    });
  });

  test('un mercado sin override cae al precio base del producto', () => {
    const p = product({ markets: { AR: { currency: 'ARS', price: 30000, cost: 4000 } } });
    assert.deepEqual(resolvePricing(p, p.variants[0], 'MX'), p.pricing);
  });

  test('rechaza un compareAtPrice que no sea mayor al precio', () => {
    const p = product({ pricing: { currency: 'USD', price: 20, compareAtPrice: 15, cost: 4 } });
    assert.throws(() => resolvePricing(p, p.variants[0], 'US'), /compareAtPrice/);
  });

  test('rechaza un precio no positivo', () => {
    const p = product({ pricing: { currency: 'USD', price: 0, cost: 4 } });
    assert.throws(() => resolvePricing(p, p.variants[0], 'US'), /precio inválido/);
  });
});

describe('unitEconomics', () => {
  const sinImpuestos = {
    paymentFeeRate: 0,
    salesTaxRate: 0,
    irrecoverableInputTaxRate: 0,
    grossReceiptsTaxRate: 0,
    shippingCost: 0,
    cac: 0,
    returnRate: 0,
  };

  test('descuenta pasarela, envío, CAC y devoluciones del margen bruto', () => {
    const e = unitEconomics(
      { currency: 'USD', price: 100, cost: 20 },
      { ...sinImpuestos, paymentFeeRate: 0.05, shippingCost: 10, cac: 15, returnRate: 0.1 },
    );

    assert.equal(e.grossProfit, 80);
    assert.equal(e.grossMargin, 0.8);
    assert.equal(e.paymentFee, 5);
    // 10% de las ventas pierde el producto (20) más el envío (10).
    assert.equal(e.returnLoss, 3);
    assert.equal(e.netProfit, 80 - 5 - 10 - 15 - 3);
    assert.equal(e.markup, 5);
  });

  test('el IVA incluido en el precio no cuenta como ingreso', () => {
    const e = unitEconomics(
      { currency: 'ARS', price: 121, cost: 21 },
      { ...sinImpuestos, salesTaxRate: 0.21 },
    );

    assert.equal(e.netRevenue, 100);
    assert.equal(e.salesTax, 21);
    // El margen se mide contra los 100 de ingreso real, no contra los 121.
    assert.equal(e.grossProfit, 79);
    assert.equal(e.grossMargin, 0.79);
  });

  test('ignorar el IVA sobreestima el margen', () => {
    const precio = { currency: 'ARS', price: 121, cost: 21 };
    const conIva = unitEconomics(precio, { ...sinImpuestos, salesTaxRate: 0.21 });
    const sinIva = unitEconomics(precio, sinImpuestos);

    assert.ok(sinIva.grossMargin > conIva.grossMargin);
    assert.ok(sinIva.markup > conIva.markup);
  });

  test('pasarela e ingresos brutos se cobran sobre el total con IVA', () => {
    const e = unitEconomics(
      { currency: 'ARS', price: 1000, cost: 100 },
      { ...sinImpuestos, salesTaxRate: 0.21, paymentFeeRate: 0.0785, grossReceiptsTaxRate: 0.03 },
    );

    assert.equal(e.paymentFee, 78.5);
    assert.equal(e.grossReceiptsTax, 30);
  });

  test('el ROAS de equilibrio ignora el CAC porque es lo que el CAC debe cubrir', () => {
    const sinCac = unitEconomics({ currency: 'USD', price: 100, cost: 25 }, sinImpuestos);
    const conCac = unitEconomics({ currency: 'USD', price: 100, cost: 25 }, { ...sinImpuestos, cac: 40 });

    assert.equal(sinCac.breakEvenRoas, conCac.breakEvenRoas);
    // Con 75% de margen de contribución hace falta facturar 1,33x lo invertido.
    assert.equal(Math.round(conCac.breakEvenRoas * 100) / 100, 1.33);
  });

  test('el ROAS de equilibrio se mide contra el total que reporta la plataforma', () => {
    // Con IVA, la contribución baja pero el ROAS sigue midiéndose sobre el
    // precio final, que es lo que ve el pixel de la plataforma de anuncios.
    const e = unitEconomics(
      { currency: 'ARS', price: 121, cost: 21 },
      { ...sinImpuestos, salesTaxRate: 0.21 },
    );

    assert.equal(e.contribution, 79);
    assert.equal(Math.round((121 / 79) * 100) / 100, Math.round(e.breakEvenRoas * 100) / 100);
  });
});

describe('regímenes impositivos argentinos', () => {
  const precio = { currency: 'ARS', price: 38900, cost: 4960 };

  test('responsable inscripto: cobra IVA y recupera el de las compras', () => {
    const e = unitEconomics(precio, assumptionsFor('AR', AR_REGIMES['responsable-inscripto']));

    assert.equal(Math.round(e.netRevenue), 32149);
    assert.equal(e.cost, 4960);
  });

  test('monotributo: todo el precio es ingreso, pero el IVA de la compra es costo', () => {
    const e = unitEconomics(precio, assumptionsFor('AR', AR_REGIMES.monotributo));

    // Factura C no discrimina IVA: no hay nada que remitir.
    assert.equal(e.netRevenue, 38900);
    assert.equal(e.salesTax, 0);
    // El IVA pagado al comprar se pierde y engrosa el costo.
    assert.equal(Math.round(e.cost), Math.round(4960 * 1.21));
  });

  test('monotributo deja más margen que responsable inscripto al mismo precio', () => {
    const inscripto = unitEconomics(precio, assumptionsFor('AR', AR_REGIMES['responsable-inscripto']));
    const mono = unitEconomics(precio, assumptionsFor('AR', AR_REGIMES.monotributo));

    assert.ok(mono.contribution > inscripto.contribution);
    assert.ok(mono.breakEvenRoas < inscripto.breakEvenRoas);
  });

  test('el IVA sobre la comisión es crédito fiscal para el inscripto', () => {
    const base = { ...assumptionsFor('AR'), shippingCost: 0 };
    const ri = unitEconomics(precio, { ...base, ...AR_REGIMES['responsable-inscripto'] });
    const mono = unitEconomics(precio, { ...base, ...AR_REGIMES.monotributo });

    // El inscripto paga la comisión neta; el monotributista, con IVA encima.
    assert.equal(Math.round(ri.paymentFee), Math.round(38900 * 0.0649));
    assert.equal(Math.round(mono.paymentFee), Math.round(38900 * 0.0649 * 1.21));
  });

  test('el envío también carga el IVA que no se recupera', () => {
    const base = { ...assumptionsFor('AR'), shippingCost: 3500, returnRate: 0 };
    const ri = unitEconomics(precio, { ...base, ...AR_REGIMES['responsable-inscripto'] });
    const mono = unitEconomics(precio, { ...base, ...AR_REGIMES.monotributo });

    assert.equal(ri.shippingCost, 3500);
    assert.equal(Math.round(mono.shippingCost), Math.round(3500 * 1.21));
  });

  test('el régimen se puede combinar con otros supuestos', () => {
    const a = assumptionsFor('AR', { ...AR_REGIMES.monotributo, shippingCost: 3500 });
    assert.equal(a.salesTaxRate, 0);
    assert.equal(a.shippingCost, 3500);
  });
});

describe('assumptionsFor', () => {
  test('aplica el IVA del mercado', () => {
    assert.equal(assumptionsFor('AR').salesTaxRate, 0.21);
    assert.equal(assumptionsFor('MX').salesTaxRate, 0.16);
    assert.equal(assumptionsFor('US').salesTaxRate, 0);
  });

  test('Argentina trae además IIBB y la comisión neta de Mercado Pago', () => {
    const ar = assumptionsFor('AR');
    assert.equal(ar.grossReceiptsTaxRate, 0.03);
    // 6,49% neto: el IVA sobre la comisión lo agrega el régimen, no esta tabla.
    assert.equal(ar.paymentFeeRate, 0.0649);
  });

  test('lo que pasa el usuario pisa al mercado', () => {
    assert.equal(assumptionsFor('AR', { paymentFeeRate: 0.04 }).paymentFeeRate, 0.04);
  });
});

describe('ShopifyAdapter.buildInput', () => {
  test('deduplica los valores de opción tomándolos de las variantes', () => {
    const input = shopify.buildInput(product(), 'US', LOCATION, null);
    assert.deepEqual(input.productOptions, [
      { name: 'Color', position: 1, values: [{ name: 'Negro' }, { name: 'Gris' }] },
    ]);
  });

  test('manda los precios como strings con dos decimales', () => {
    const input = shopify.buildInput(product(), 'US', LOCATION, null);
    assert.equal(input.variants[0].price, '20.00');
    assert.equal(input.variants[0].compareAtPrice, '30.00');
    assert.equal(input.variants[0].inventoryItem.cost, '4.00');
  });

  test('carga el stock inicial en la ubicación indicada', () => {
    const input = shopify.buildInput(product(), 'US', LOCATION, null);
    assert.deepEqual(input.variants[0].inventoryQuantities, [
      { locationId: LOCATION, name: 'available', quantity: 10 },
    ]);
  });

  test('stock null publica el item sin rastrear y sin cantidades', () => {
    const p = product({
      variants: [{ optionValues: ['Negro'], sku: 'A', weightKg: 0.1, stock: null }],
    });
    const input = shopify.buildInput(p, 'US', LOCATION, null);

    assert.equal(input.variants[0].inventoryItem.tracked, false);
    assert.equal(input.variants[0].inventoryQuantities, undefined);
  });

  test('incluye el id sólo cuando el producto ya existe, para actualizarlo', () => {
    const nuevo = shopify.buildInput(product(), 'US', LOCATION, null);
    const existente = shopify.buildInput(product(), 'US', LOCATION, 'gid://shopify/Product/9');

    assert.equal('id' in nuevo, false);
    assert.equal((existente as { id: string }).id, 'gid://shopify/Product/9');
  });

  test('un producto no publicado se crea como borrador', () => {
    const input = shopify.buildInput(product({ published: false }), 'US', LOCATION, null);
    assert.equal(input.status, 'DRAFT');
  });
});

describe('TiendanubeAdapter.buildBody', () => {
  test('envuelve los campos de texto en el idioma de la tienda', () => {
    const body = tiendanube.buildBody(product(), 'US', 'pt');
    assert.deepEqual(body.name, { pt: 'Producto de prueba' });
    assert.deepEqual(body.handle, { pt: 'test' });
    assert.deepEqual(body.attributes, [{ pt: 'Color' }]);
  });

  test('serializa los tags como string separado por comas', () => {
    assert.equal(tiendanube.buildBody(product(), 'US', 'es').tags, 'a, b');
  });

  test('mapea compareAtPrice a price y el precio real a promotional_price', () => {
    const [variant] = tiendanube.buildBody(product(), 'US', 'es').variants;
    assert.equal(variant.price, '30.00');
    assert.equal(variant.promotional_price, '20.00');
  });

  test('sin compareAtPrice el precio va derecho y la promoción queda en null', () => {
    const p = product({ pricing: { currency: 'USD', price: 20, cost: 4 } });
    const [variant] = tiendanube.buildBody(p, 'US', 'es').variants;

    assert.equal(variant.price, '20.00');
    assert.equal(variant.promotional_price, null);
  });

  test('stock null desactiva la gestión de stock', () => {
    const p = product({
      variants: [{ optionValues: ['Negro'], sku: 'A', weightKg: 0.1, stock: null }],
    });
    const [variant] = tiendanube.buildBody(p, 'US', 'es').variants;

    assert.equal(variant.stock_management, false);
    assert.equal(variant.stock, null);
  });
});

describe('catálogo del repositorio', () => {
  test('todos los productos pasan la validación', () => {
    assert.ok(loadCatalog().length >= 1);
  });

  test('cada producto genera payloads válidos en las dos plataformas y en todo mercado', () => {
    for (const p of loadCatalog()) {
      for (const market of ['US', 'AR', 'MX', 'CO', 'CL'] as const) {
        const shopifyInput = shopify.buildInput(p, market, LOCATION, null);
        const tiendanubeBody = tiendanube.buildBody(p, market, 'es');

        assert.equal(shopifyInput.variants.length, p.variants.length);
        assert.equal(tiendanubeBody.variants.length, p.variants.length);

        for (const variant of shopifyInput.variants) {
          assert.match(variant.price, /^\d+\.\d{2}$/, `${p.slug} ${market}: precio mal formado`);
        }
      }
    }
  });

  test('el producto principal deja margen bruto suficiente para tráfico pago', () => {
    const hero = findProduct('noctu-antifaz-blackout-3d');

    for (const market of ['US', 'AR', 'MX', 'CO', 'CL'] as const) {
      const economics = unitEconomics(resolvePricing(hero, hero.variants[0], market), assumptionsFor(market));
      assert.ok(economics.markup >= 3, `${market}: markup ${economics.markup.toFixed(1)}x < 3x`);
      assert.ok(
        economics.breakEvenRoas <= 2,
        `${market}: ROAS de equilibrio ${economics.breakEvenRoas.toFixed(2)}x > 2x`,
      );
    }
  });
});
