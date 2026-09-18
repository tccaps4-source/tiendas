import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { MARKETS, type Market, type Product, type Variant } from '../types.ts';

const CATALOG_DIR = resolve(import.meta.dirname, '../../catalog');

function fail(file: string, message: string): never {
  throw new Error(`catalog/${file}: ${message}`);
}

function assertString(file: string, value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(file, `\`${field}\` debe ser un string no vacío`);
  }
  return value;
}

function assertNumber(file: string, value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(file, `\`${field}\` debe ser un número finito`);
  }
  return value;
}

/**
 * Valida la forma de un producto leído de disco.
 *
 * Se valida acá y no en cada adaptador: un catálogo inválido debe romper antes
 * de tocar la red, nunca a mitad de una publicación.
 */
function validateProduct(raw: unknown, file: string): Product {
  if (typeof raw !== 'object' || raw === null) fail(file, 'el archivo debe contener un objeto JSON');
  const p = raw as Record<string, unknown>;

  const slug = assertString(file, p.slug, 'slug');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    fail(file, `\`slug\` debe ser kebab-case en minúsculas, recibido: ${slug}`);
  }

  assertString(file, p.name, 'name');
  assertString(file, p.descriptionHtml, 'descriptionHtml');
  assertString(file, p.brand, 'brand');
  assertString(file, p.productType, 'productType');

  if (!Array.isArray(p.tags) || p.tags.some((t) => typeof t !== 'string')) {
    fail(file, '`tags` debe ser un array de strings');
  }

  const seo = p.seo as Record<string, unknown> | undefined;
  if (!seo) fail(file, 'falta `seo`');
  const seoTitle = assertString(file, seo.title, 'seo.title');
  const seoDescription = assertString(file, seo.description, 'seo.description');

  // Límites de los buscadores: más largo se trunca con "..." en el resultado.
  if (seoTitle.length > 70) fail(file, `\`seo.title\` supera 70 caracteres (${seoTitle.length})`);
  if (seoDescription.length > 160) {
    fail(file, `\`seo.description\` supera 160 caracteres (${seoDescription.length})`);
  }

  if (!Array.isArray(p.options) || p.options.some((o) => typeof o !== 'string')) {
    fail(file, '`options` debe ser un array de strings');
  }
  const options = p.options as string[];

  if (!Array.isArray(p.variants) || p.variants.length === 0) {
    fail(file, '`variants` debe tener al menos una variante');
  }

  const seenSkus = new Set<string>();
  const variants: Variant[] = (p.variants as unknown[]).map((rawVariant, i) => {
    if (typeof rawVariant !== 'object' || rawVariant === null) {
      fail(file, `variants[${i}] debe ser un objeto`);
    }
    const v = rawVariant as Record<string, unknown>;
    const sku = assertString(file, v.sku, `variants[${i}].sku`);

    if (seenSkus.has(sku)) fail(file, `SKU duplicado: ${sku}`);
    seenSkus.add(sku);

    if (!Array.isArray(v.optionValues) || v.optionValues.length !== options.length) {
      fail(
        file,
        `variants[${i}].optionValues debe tener ${options.length} valor(es) para las opciones [${options.join(', ')}]`,
      );
    }

    const stock = v.stock === null ? null : assertNumber(file, v.stock, `variants[${i}].stock`);
    if (stock !== null && (stock < 0 || !Number.isInteger(stock))) {
      fail(file, `variants[${i}].stock debe ser un entero >= 0 o null`);
    }

    // Las claves opcionales se agregan sólo si vienen: con
    // `exactOptionalPropertyTypes`, un `barcode: undefined` explícito no es lo
    // mismo que un producto sin código de barras.
    const parsed: Variant = {
      optionValues: v.optionValues as string[],
      sku,
      weightKg: assertNumber(file, v.weightKg, `variants[${i}].weightKg`),
      stock,
    };
    if (typeof v.barcode === 'string') parsed.barcode = v.barcode;
    if (v.pricing) parsed.pricing = v.pricing as NonNullable<Variant['pricing']>;

    return parsed;
  });

  // Dos variantes con la misma combinación de opciones son rechazadas por ambas
  // plataformas; detectarlo acá da un error mucho más claro.
  const combos = new Set<string>();
  for (const v of variants) {
    const key = v.optionValues.join(' // ');
    if (combos.has(key)) {
      fail(file, `combinación de opciones duplicada: [${v.optionValues.join(', ')}]`);
    }
    combos.add(key);
  }

  if (!Array.isArray(p.images) || p.images.length === 0) {
    fail(file, '`images` debe tener al menos una imagen');
  }
  for (const [i, img] of (p.images as Record<string, unknown>[]).entries()) {
    const src = assertString(file, img.src, `images[${i}].src`);
    if (!/^https:\/\//.test(src)) {
      fail(file, `images[${i}].src debe ser una URL https pública, recibido: ${src}`);
    }
    assertString(file, img.alt, `images[${i}].alt`);
  }

  const pricing = p.pricing as Record<string, unknown> | undefined;
  if (!pricing) fail(file, 'falta `pricing`');
  assertString(file, pricing.currency, 'pricing.currency');
  assertNumber(file, pricing.price, 'pricing.price');
  assertNumber(file, pricing.cost, 'pricing.cost');

  for (const market of Object.keys(p.markets ?? {})) {
    if (!MARKETS.includes(market as Market)) {
      fail(file, `mercado desconocido en \`markets\`: ${market} (válidos: ${MARKETS.join(', ')})`);
    }
  }

  const product: Product = {
    slug,
    name: p.name as string,
    descriptionHtml: p.descriptionHtml as string,
    brand: p.brand as string,
    productType: p.productType as string,
    tags: p.tags as string[],
    seo: { title: seoTitle, description: seoDescription },
    options,
    variants,
    images: p.images as Product['images'],
    pricing: pricing as unknown as Product['pricing'],
    published: p.published !== false,
  };
  if (p.markets) product.markets = p.markets as NonNullable<Product['markets']>;

  return product;
}

/** Lee y valida todo el catálogo. Ordenado por slug para que la salida sea estable. */
export function loadCatalog(): Product[] {
  const files = readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) throw new Error(`No hay productos en ${CATALOG_DIR}`);

  const products = files.map((file) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(CATALOG_DIR, file), 'utf8'));
    } catch (err) {
      fail(file, `JSON inválido: ${(err as Error).message}`);
    }
    return validateProduct(parsed, file);
  });

  const slugs = new Set<string>();
  for (const product of products) {
    if (slugs.has(product.slug)) throw new Error(`Slug duplicado en el catálogo: ${product.slug}`);
    slugs.add(product.slug);
  }
  return products.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function findProduct(slug: string): Product {
  const catalog = loadCatalog();
  const product = catalog.find((p) => p.slug === slug);
  if (!product) {
    throw new Error(
      `No existe el producto "${slug}". Disponibles: ${catalog.map((p) => p.slug).join(', ')}`,
    );
  }
  return product;
}
