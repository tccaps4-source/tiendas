import { shopifyConfig, type ShopifyConfig } from '../config.ts';
import { resolvePricing } from '../pricing.ts';
import type { Adapter, Market, Product, PublishResult } from '../types.ts';

/**
 * Adaptador de Shopify sobre la **Admin GraphQL API**.
 *
 * Los endpoints REST de productos están deprecados desde 2024-04 y las apps
 * nuevas deben usar GraphQL, así que acá no se usa REST en ningún momento.
 *
 * La publicación usa la mutación `productSet`, que crea el producto con sus
 * opciones, variantes, precios, stock e imágenes en una sola llamada. Cuando el
 * producto ya existe se le pasa su `id`, con lo cual `publish()` es idempotente:
 * correrlo dos veces actualiza en lugar de duplicar.
 */
export class ShopifyAdapter implements Adapter {
  readonly name = 'shopify';
  #config: ShopifyConfig;
  #locationId: string | null = null;

  constructor(config: ShopifyConfig = shopifyConfig()) {
    this.#config = config;
  }

  get endpoint(): string {
    return `https://${this.#config.shop}/admin/api/${this.#config.apiVersion}/graphql.json`;
  }

  /**
   * Ejecuta una operación GraphQL.
   *
   * Shopify responde 200 incluso para errores de negocio, así que hay que mirar
   * tanto `errors` (nivel GraphQL) como los `userErrors` de cada mutación.
   * Un 429 o un `THROTTLED` se reintentan con backoff porque la API tiene un
   * presupuesto de costo que se recupera con el tiempo.
   */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const maxAttempts = 5;

    for (let attempt = 1; ; attempt++) {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.#config.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (response.status === 429 && attempt < maxAttempts) {
        const retryAfter = Number(response.headers.get('Retry-After')) || 2 ** attempt;
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `Shopify rechazó las credenciales (HTTP ${response.status}). Revisá SHOPIFY_ACCESS_TOKEN ` +
              `y que la app tenga los scopes write_products y write_inventory.`,
          );
        }
        throw new Error(`Shopify HTTP ${response.status}: ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as {
        data?: T;
        errors?: { message: string; extensions?: { code?: string } }[];
      };

      const throttled = payload.errors?.some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled && attempt < maxAttempts) {
        await sleep(2 ** attempt * 1000);
        continue;
      }

      if (payload.errors?.length) {
        throw new Error(`Shopify GraphQL: ${payload.errors.map((e) => e.message).join('; ')}`);
      }
      if (!payload.data) throw new Error('Shopify GraphQL devolvió una respuesta sin datos');

      return payload.data;
    }
  }

  async ping(): Promise<string> {
    const data = await this.graphql<{
      shop: { name: string; myshopifyDomain: string; currencyCode: string };
    }>(`query { shop { name myshopifyDomain currencyCode } }`);

    return `${data.shop.name} (${data.shop.myshopifyDomain}, moneda ${data.shop.currencyCode})`;
  }

  /** La ubicación donde se carga el stock inicial. Se cachea por instancia. */
  async primaryLocationId(): Promise<string> {
    if (this.#locationId) return this.#locationId;

    const data = await this.graphql<{ locations: { nodes: { id: string; name: string }[] } }>(
      `query { locations(first: 1, includeInactive: false) { nodes { id name } } }`,
    );

    const location = data.locations.nodes[0];
    if (!location) throw new Error('La tienda de Shopify no tiene ninguna ubicación activa');

    this.#locationId = location.id;
    return location.id;
  }

  /** Busca un producto por handle. Devuelve `null` si todavía no existe. */
  async findByHandle(handle: string): Promise<string | null> {
    const data = await this.graphql<{ products: { nodes: { id: string }[] } }>(
      `query FindByHandle($query: String!) {
         products(first: 1, query: $query) { nodes { id } }
       }`,
      { query: `handle:${handle}` },
    );
    return data.products.nodes[0]?.id ?? null;
  }

  buildInput(product: Product, market: Market, locationId: string, existingId: string | null) {
    const options = product.options.map((name, index) => ({
      name,
      position: index + 1,
      values: [...new Set(product.variants.map((v) => v.optionValues[index]))].map((value) => ({
        name: value,
      })),
    }));

    const variants = product.variants.map((variant) => {
      const pricing = resolvePricing(product, variant, market);

      return {
        optionValues: product.options.map((name, index) => ({
          optionName: name,
          name: variant.optionValues[index],
        })),
        price: pricing.price.toFixed(2),
        compareAtPrice: pricing.compareAtPrice?.toFixed(2),
        sku: variant.sku,
        barcode: variant.barcode,
        inventoryItem: {
          cost: pricing.cost.toFixed(2),
          tracked: variant.stock !== null,
          measurement: { weight: { value: variant.weightKg, unit: 'KILOGRAMS' } },
        },
        // Shopify rechaza cantidades en un item no rastreado, así que las
        // variantes con stock ilimitado se publican sin `inventoryQuantities`.
        inventoryQuantities:
          variant.stock === null
            ? undefined
            : [{ locationId, name: 'available', quantity: variant.stock }],
      };
    });

    return {
      ...(existingId ? { id: existingId } : {}),
      title: product.name,
      handle: product.slug,
      descriptionHtml: product.descriptionHtml,
      vendor: product.brand,
      productType: product.productType,
      tags: product.tags,
      status: product.published ? 'ACTIVE' : 'DRAFT',
      seo: { title: product.seo.title, description: product.seo.description },
      productOptions: options,
      variants,
      files: product.images.map((image) => ({
        originalSource: image.src,
        alt: image.alt,
        contentType: 'IMAGE',
      })),
    };
  }

  async publish(product: Product, market: Market): Promise<PublishResult> {
    const [locationId, existingId] = await Promise.all([
      this.primaryLocationId(),
      this.findByHandle(product.slug),
    ]);

    const input = this.buildInput(product, market, locationId, existingId);

    const data = await this.graphql<{
      productSet: {
        product: { id: string; handle: string } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      `mutation Publish($input: ProductSetInput!) {
         productSet(input: $input, synchronous: true) {
           product { id handle }
           userErrors { field message }
         }
       }`,
      { input },
    );

    const { product: created, userErrors } = data.productSet;
    if (userErrors.length) {
      const detail = userErrors
        .map((e) => `${e.field?.join('.') ?? 'input'}: ${e.message}`)
        .join('; ');
      throw new Error(`Shopify rechazó "${product.slug}": ${detail}`);
    }
    if (!created) throw new Error(`Shopify no devolvió el producto para "${product.slug}"`);

    const numericId = created.id.split('/').pop();
    return {
      platform: this.name,
      slug: product.slug,
      remoteId: created.id,
      adminUrl: `https://${this.#config.shop}/admin/products/${numericId}`,
      created: existingId === null,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
