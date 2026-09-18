/**
 * Modelo canónico de producto.
 *
 * Es deliberadamente neutro: no se parece ni a Shopify ni a Tiendanube.
 * Cada adaptador traduce desde acá hacia el formato de su plataforma, así el
 * catálogo se escribe una sola vez y se publica en las dos.
 */

/** Códigos de mercado soportados para overrides de precio. */
export type Market = 'AR' | 'MX' | 'CO' | 'CL' | 'UY' | 'BR' | 'US';

export const MARKETS: readonly Market[] = ['AR', 'MX', 'CO', 'CL', 'UY', 'BR', 'US'];

/** Moneda ISO-4217 y precios en unidades mayores (no centavos). */
export interface Pricing {
  currency: string;
  /** Precio de venta. */
  price: number;
  /** Precio "tachado" para mostrar descuento. Opcional. */
  compareAtPrice?: number;
  /** Costo landed (producto + envío a depósito + impuestos de importación). */
  cost: number;
}

export interface Variant {
  /** Valores de opción en el mismo orden que `Product.options`. */
  optionValues: string[];
  sku: string;
  barcode?: string;
  /** Peso en kilogramos. Usado para cotizar envío. */
  weightKg: number;
  /** Stock inicial. `null` = stock ilimitado / sin gestión. */
  stock: number | null;
  /** Override de precio para esta variante. Si falta, hereda el del producto. */
  pricing?: Partial<Pricing>;
}

export interface ProductImage {
  /** URL pública. Ambas plataformas descargan la imagen desde acá. */
  src: string;
  alt: string;
}

export interface Product {
  /** Identificador interno estable. Se usa como handle/URL y para hacer upsert. */
  slug: string;
  name: string;
  /** HTML. Es la descripción que ve el comprador en la ficha. */
  descriptionHtml: string;
  brand: string;
  productType: string;
  tags: string[];
  seo: { title: string; description: string };
  /** Nombres de las opciones, ej. ['Color']. Vacío = producto sin variantes. */
  options: string[];
  variants: Variant[];
  images: ProductImage[];
  pricing: Pricing;
  /** Overrides de precio por mercado. Si falta el mercado, se usa `pricing`. */
  markets?: Partial<Record<Market, Partial<Pricing>>>;
  published: boolean;
}

/** Resultado normalizado de publicar en una plataforma. */
export interface PublishResult {
  platform: string;
  slug: string;
  /** ID del producto en la plataforma destino. */
  remoteId: string;
  /** URL de administración, si la plataforma la expone. */
  adminUrl?: string;
  created: boolean;
}

export interface Adapter {
  readonly name: string;
  /** Verifica credenciales y devuelve una descripción de la tienda conectada. */
  ping(): Promise<string>;
  /** Crea o actualiza el producto. Idempotente por `slug`. */
  publish(product: Product, market: Market): Promise<PublishResult>;
}
