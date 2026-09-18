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
  /** Costo de envío absorbido por la tienda, por pedido, en la moneda del precio. */
  shippingCost: number;
  /** Costo de adquisición por cliente (publicidad / CPA). */
  cac: number;
  /** Fracción de pedidos que terminan en devolución o no-entrega. */
  returnRate: number;
}

/** Supuestos por defecto, calibrados para LatAm con envío propio y tráfico pago. */
export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  paymentFeeRate: 0.064,
  shippingCost: 0,
  cac: 0,
  returnRate: 0.03,
};

export interface UnitEconomics {
  price: number;
  cost: number;
  currency: string;
  grossProfit: number;
  /** Margen bruto: (precio - costo) / precio. */
  grossMargin: number;
  paymentFee: number;
  shippingCost: number;
  cac: number;
  returnLoss: number;
  netProfit: number;
  netMargin: number;
  /** Múltiplo precio/costo. Regla de oro del sector: >= 3x. */
  markup: number;
  /** ROAS mínimo para no perder plata, dado el margen de contribución. */
  breakEvenRoas: number;
}

/** Calcula la economía unitaria de una venta. */
export function unitEconomics(
  pricing: Pricing,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): UnitEconomics {
  const { price, cost, currency } = pricing;
  const grossProfit = price - cost;
  const paymentFee = price * assumptions.paymentFeeRate;

  // Una devolución pierde el costo del producto y el envío; el fee de la
  // pasarela normalmente se reintegra, así que no se cuenta acá.
  const returnLoss = assumptions.returnRate * (cost + assumptions.shippingCost);

  const netProfit =
    grossProfit - paymentFee - assumptions.shippingCost - assumptions.cac - returnLoss;

  // Margen de contribución antes de publicidad: lo que queda para comprar tráfico.
  const contribution = grossProfit - paymentFee - assumptions.shippingCost - returnLoss;

  return {
    price,
    cost,
    currency,
    grossProfit,
    grossMargin: grossProfit / price,
    paymentFee,
    shippingCost: assumptions.shippingCost,
    cac: assumptions.cac,
    returnLoss,
    netProfit,
    netMargin: netProfit / price,
    markup: cost > 0 ? price / cost : Infinity,
    breakEvenRoas: contribution > 0 ? price / contribution : Infinity,
  };
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
