import type { Market, Pricing, Product, Variant } from './types.ts';

/**
 * Resuelve el precio efectivo de una variante en un mercado dado.
 *
 * La precedencia es: variante > mercado > producto. Cada nivel sólo pisa los
 * campos que define, así un override de mercado puede cambiar la moneda y el
 * precio sin tener que repetir el costo.
 */
export function resolvePricing(product: Product, variant: Variant, market: Market): Pricing {
  const base = product.pricing;
  const marketOverride = product.markets?.[market] ?? {};
  const variantOverride = variant.pricing ?? {};
  const where = `${product.slug}/${variant.sku} en ${market}`;

  const currency = variantOverride.currency ?? marketOverride.currency ?? base.currency;

  // Los montos de `pricing` están denominados en su moneda. Si un override
  // cambia la moneda, heredarlos sería mezclar unidades: un compareAtPrice de
  // USD 30 sobre un precio de ARS 30.000 se publicaría como un descuento
  // absurdo. Cuando la moneda cambia, el override tiene que traer sus montos.
  const inheritsBase = currency === base.currency;
  const pick = (field: 'price' | 'compareAtPrice' | 'cost'): number | undefined =>
    variantOverride[field] ?? marketOverride[field] ?? (inheritsBase ? base[field] : undefined);

  const price = pick('price');
  const cost = pick('cost');
  const compareAtPrice = pick('compareAtPrice');

  if (price === undefined || cost === undefined) {
    const missing = [price === undefined && 'price', cost === undefined && 'cost']
      .filter(Boolean)
      .join(' y ');
    throw new Error(
      `${where}: el override cambia la moneda de ${base.currency} a ${currency}, ` +
        `así que tiene que definir ${missing} en ${currency}.`,
    );
  }
  if (!(price > 0)) throw new Error(`${where}: precio inválido (${price})`);
  if (!(cost >= 0)) throw new Error(`${where}: costo inválido (${cost})`);
  if (compareAtPrice !== undefined && compareAtPrice <= price) {
    throw new Error(
      `${where}: compareAtPrice (${compareAtPrice}) debe ser mayor al precio (${price})`,
    );
  }

  return compareAtPrice === undefined
    ? { currency, price, cost }
    : { currency, price, cost, compareAtPrice };
}

/** Supuestos de costos variables, como fracción del precio de venta o monto fijo. */
export interface CostAssumptions {
  /** Comisión de la pasarela de pago (Mercado Pago, Shopify Payments...). */
  paymentFeeRate: number;
  /**
   * IVA ya incluido en el precio mostrado.
   *
   * En LatAm el precio de góndola es final al consumidor, así que esta parte
   * no es ingreso: se le debe al fisco. Ignorarla infla el margen un 17% en
   * Argentina. Poné 0 donde el impuesto se suma recién en el checkout, como
   * en Estados Unidos.
   */
  salesTaxRate: number;
  /**
   * IVA pagado al comprar la mercadería que NO se puede recuperar como crédito
   * fiscal, y que por lo tanto es costo.
   *
   * Un responsable inscripto lo descuenta contra el IVA que cobra, así que acá
   * va 0. Un monotributista no: con Factura C no discrimina IVA en la venta,
   * pero el que pagó en la compra lo pierde. Para él va la alícuota de la
   * jurisdicción.
   */
  irrecoverableInputTaxRate: number;
  /** Impuesto sobre los ingresos brutos (IIBB en Argentina), sobre el precio final. */
  grossReceiptsTaxRate: number;
  /** Costo de envío absorbido por la tienda, por pedido, en la moneda del precio. */
  shippingCost: number;
  /** Costo de adquisición por cliente (publicidad / CPA). */
  cac: number;
  /** Fracción de pedidos que terminan en devolución o no-entrega. */
  returnRate: number;
}

/** Supuestos por defecto: sin impuestos locales, con envío a cargo del comprador. */
export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  paymentFeeRate: 0.064,
  salesTaxRate: 0,
  irrecoverableInputTaxRate: 0,
  grossReceiptsTaxRate: 0,
  shippingCost: 0,
  cac: 0,
  returnRate: 0.03,
};

/**
 * Supuestos por mercado, aplicados automáticamente según `--market`.
 *
 * Las alícuotas de IVA son datos públicos y estables. La comisión de pasarela
 * sólo está calibrada para Argentina (Mercado Pago Checkout Pro con
 * acreditación inmediata, 6,49% + IVA sobre la comisión); en el resto de los
 * mercados queda el valor genérico y conviene reemplazarlo con `--payment-fee`
 * por el que te cobre tu pasarela.
 */
export const MARKET_ASSUMPTIONS: Partial<Record<Market, Partial<CostAssumptions>>> = {
  AR: { salesTaxRate: 0.21, grossReceiptsTaxRate: 0.03, paymentFeeRate: 0.0785 },
  MX: { salesTaxRate: 0.16 },
  CO: { salesTaxRate: 0.19 },
  CL: { salesTaxRate: 0.19 },
  UY: { salesTaxRate: 0.22 },
  BR: { salesTaxRate: 0.18 },
  // En Estados Unidos el sales tax se agrega en el checkout, no viene incluido.
  US: { salesTaxRate: 0 },
};

/**
 * Regímenes impositivos argentinos. Cambian el resultado más que el tipo de
 * cambio, así que conviene elegir el que corresponde antes de mirar el margen.
 *
 * - **Responsable inscripto**: cobra IVA dentro del precio y lo remite, pero el
 *   IVA de las compras es crédito fiscal, así que el costo va neto.
 * - **Monotributo**: con Factura C no discrimina IVA, así que todo el precio es
 *   ingreso. A cambio pierde el IVA de las compras, que pasa a ser costo. Paga
 *   además una cuota mensual fija que no depende de las ventas y que por eso no
 *   se modela acá: es costo de estructura, no costo por unidad.
 */
export const AR_REGIMES = {
  'responsable-inscripto': { salesTaxRate: 0.21, irrecoverableInputTaxRate: 0 },
  monotributo: { salesTaxRate: 0, irrecoverableInputTaxRate: 0.21, grossReceiptsTaxRate: 0 },
} as const satisfies Record<string, Partial<CostAssumptions>>;

export type ArRegime = keyof typeof AR_REGIMES;

export const AR_REGIME_NAMES = Object.keys(AR_REGIMES) as ArRegime[];

/** Combina los valores por defecto, los del mercado y los que pase el usuario. */
export function assumptionsFor(
  market: Market,
  overrides: Partial<CostAssumptions> = {},
): CostAssumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...(MARKET_ASSUMPTIONS[market] ?? {}), ...overrides };
}

export interface UnitEconomics {
  currency: string;
  /** Lo que paga el comprador, con IVA incluido. Es sobre esto que se mide el ROAS. */
  price: number;
  /** Lo que realmente factura la tienda, una vez descontado el IVA. */
  netRevenue: number;
  cost: number;
  salesTax: number;
  grossReceiptsTax: number;
  paymentFee: number;
  shippingCost: number;
  cac: number;
  returnLoss: number;
  /** Ingreso neto menos costo del producto. */
  grossProfit: number;
  /** Margen bruto sobre el ingreso neto de IVA. */
  grossMargin: number;
  /** Lo que queda para comprar tráfico, antes del CAC. */
  contribution: number;
  netProfit: number;
  netMargin: number;
  /** Múltiplo ingreso neto / costo. Regla de oro del sector: >= 3x. */
  markup: number;
  /** ROAS mínimo para no perder plata, dado el margen de contribución. */
  breakEvenRoas: number;
}

/** Calcula la economía unitaria de una venta. */
export function unitEconomics(
  pricing: Pricing,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): UnitEconomics {
  const { price, currency } = pricing;

  // El precio mostrado lleva el IVA adentro: se cobra pero no es ingreso.
  const netRevenue = price / (1 + assumptions.salesTaxRate);
  const salesTax = price - netRevenue;

  // El IVA de la compra que no se puede computar como crédito fiscal engrosa
  // el costo de la mercadería.
  const cost = pricing.cost * (1 + assumptions.irrecoverableInputTaxRate);

  // La pasarela y el impuesto a los ingresos brutos se calculan sobre el total
  // que pasa por la caja, IVA incluido.
  const paymentFee = price * assumptions.paymentFeeRate;
  const grossReceiptsTax = price * assumptions.grossReceiptsTaxRate;

  // Una devolución pierde el costo del producto y el envío; el fee de la
  // pasarela normalmente se reintegra, así que no se cuenta acá.
  const returnLoss = assumptions.returnRate * (cost + assumptions.shippingCost);

  const grossProfit = netRevenue - cost;
  const contribution =
    grossProfit - paymentFee - grossReceiptsTax - assumptions.shippingCost - returnLoss;
  const netProfit = contribution - assumptions.cac;

  return {
    currency,
    price,
    netRevenue,
    cost,
    salesTax,
    grossReceiptsTax,
    paymentFee,
    shippingCost: assumptions.shippingCost,
    cac: assumptions.cac,
    returnLoss,
    grossProfit,
    grossMargin: grossProfit / netRevenue,
    contribution,
    netProfit,
    netMargin: netProfit / netRevenue,
    markup: cost > 0 ? netRevenue / cost : Infinity,
    // El ROAS se mide contra lo que reporta la plataforma de anuncios, que es
    // el total del checkout con IVA, no el ingreso neto.
    breakEvenRoas: contribution > 0 ? price / contribution : Infinity,
  };
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
