import { tiendanubeConfig, type TiendanubeConfig } from '../config.ts';
import { resolvePricing } from '../pricing.ts';
import type { Adapter, Market, Product, PublishResult, Variant } from '../types.ts';

const API_BASE = 'https://api.tiendanube.com/v1';

/** Los campos de texto de Tiendanube son objetos indexados por idioma. */
type I18n = Record<string, string>;

interface RemoteVariant {
  id: number;
  sku: string | null;
}

interface RemoteProduct {
  id: number;
  variants: RemoteVariant[];
}

/**
 * Adaptador de Tiendanube / Nuvemshop sobre la API REST v1.
 *
 * Dos particularidades de esta API condicionan todo el adaptador:
 *
 * 1. Los campos de texto son multi-idioma (`{"es": "..."}`), y las claves
 *    válidas dependen de los idiomas habilitados en la tienda. Por eso se
 *    consulta `GET /store` antes de publicar, en vez de asumir "es".
 * 2. `PUT /products/{id}` no actualiza las variantes anidadas. Para modificar
 *    precios o stock hay que ir al recurso `/products/{id}/variants`, que es
 *    justamente lo que hace `#syncVariants`.
 */
export class TiendanubeAdapter implements Adapter {
  readonly name = 'tiendanube';
  #config: TiendanubeConfig;
  #language: string | null = null;

  constructor(config: TiendanubeConfig = tiendanubeConfig()) {
    this.#config = config;
  }

  get baseUrl(): string {
    return `${API_BASE}/${this.#config.storeId}`;
  }

  /**
   * Llama a la API y devuelve el JSON parseado.
   *
   * El token va en dos headers a propósito: la documentación histórica usa
   * `Authentication: bearer` y la actual `Authorization: bearer`. Mandar ambos
   * funciona con cualquiera de las dos y evita un 401 según qué doc se siguió.
   */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const maxAttempts = 5;

    for (let attempt = 1; ; attempt++) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authentication: `bearer ${this.#config.accessToken}`,
          Authorization: `bearer ${this.#config.accessToken}`,
          'User-Agent': this.#config.userAgent,
          ...init.headers,
        },
      });

      // La API usa un leaky bucket: al agotarlo responde 429 y hay que esperar
      // a que se recargue antes de reintentar.
      if (response.status === 429 && attempt < maxAttempts) {
        const retryAfter = Number(response.headers.get('Retry-After')) || 2 ** attempt;
        await sleep(retryAfter * 1000);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Tiendanube rechazó las credenciales (HTTP ${response.status}). Revisá ` +
            `TIENDANUBE_ACCESS_TOKEN, TIENDANUBE_STORE_ID y que TIENDANUBE_USER_AGENT ` +
            `incluya un email de contacto.`,
        );
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Tiendanube HTTP ${response.status} en ${path}: ${body.slice(0, 500)}`);
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
  }

  async ping(): Promise<string> {
    const store = await this.request<{ name?: I18n | string; main_language?: string; url?: string }>(
      '/store',
    );
    const name = typeof store.name === 'string' ? store.name : Object.values(store.name ?? {})[0];
    return `${name ?? `tienda ${this.#config.storeId}`} (${store.url ?? 'sin URL'}, idioma ${store.main_language ?? 'desconocido'})`;
  }

  /** Idioma principal de la tienda; es la clave de todos los campos de texto. */
  async mainLanguage(): Promise<string> {
    if (this.#language) return this.#language;

    const store = await this.request<{ main_language?: string }>('/store');
    this.#language = store.main_language || 'es';
    return this.#language;
  }

  #i18n(language: string, value: string): I18n {
    return { [language]: value };
  }

  /** Busca un producto por handle. Devuelve `null` si todavía no existe. */
  async findByHandle(handle: string): Promise<RemoteProduct | null> {
    const found = await this.request<RemoteProduct[]>(
      `/products?handle=${encodeURIComponent(handle)}&fields=id,variants`,
    );
    return found[0] ?? null;
  }

  #variantBody(product: Product, variant: Variant, market: Market, language: string) {
    const pricing = resolvePricing(product, variant, market);

    // Tiendanube invierte la convención de Shopify: `price` es el precio de
    // lista (el tachado) y `promotional_price` el que realmente se cobra. Con
    // `compareAtPrice` definido hay que mapear cruzado; sin él, `null` limpia
    // cualquier promoción anterior.
    const onSale = pricing.compareAtPrice !== undefined;

    return {
      values: variant.optionValues.map((value) => this.#i18n(language, value)),
      price: (onSale ? pricing.compareAtPrice! : pricing.price).toFixed(2),
      promotional_price: onSale ? pricing.price.toFixed(2) : null,
      cost: pricing.cost.toFixed(2),
      sku: variant.sku,
      barcode: variant.barcode ?? null,
      weight: variant.weightKg.toFixed(3),
      stock_management: variant.stock !== null,
      stock: variant.stock,
    };
  }

  buildBody(product: Product, market: Market, language: string) {
    return {
      name: this.#i18n(language, product.name),
      description: this.#i18n(language, product.descriptionHtml),
      handle: this.#i18n(language, product.slug),
      seo_title: this.#i18n(language, product.seo.title),
      seo_description: this.#i18n(language, product.seo.description),
      brand: product.brand,
      // Tiendanube espera los tags como un string separado por comas.
      tags: product.tags.join(', '),
      published: product.published,
      free_shipping: false,
      attributes: product.options.map((option) => this.#i18n(language, option)),
      variants: product.variants.map((v) => this.#variantBody(product, v, market, language)),
      images: product.images.map((image) => ({ src: image.src, alt: [image.alt] })),
    };
  }

  /**
   * Alinea las variantes remotas con las del catálogo, emparejando por SKU.
   *
   * Las variantes que ya existen se actualizan y las nuevas se crean. No se
   * borra nada: una variante remota que no está en el catálogo se deja intacta
   * para no destruir stock o historial de ventas sin que nadie lo haya pedido.
   */
  async #syncVariants(
    remote: RemoteProduct,
    product: Product,
    market: Market,
    language: string,
  ): Promise<void> {
    const bySku = new Map(
      remote.variants.filter((v) => v.sku).map((v) => [v.sku as string, v.id] as const),
    );

    for (const variant of product.variants) {
      const body = this.#variantBody(product, variant, market, language);
      const existingId = bySku.get(variant.sku);

      if (existingId) {
        await this.request(`/products/${remote.id}/variants/${existingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await this.request(`/products/${remote.id}/variants`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
    }
  }

  async publish(product: Product, market: Market): Promise<PublishResult> {
    const language = await this.mainLanguage();
    const existing = await this.findByHandle(product.slug);
    const body = this.buildBody(product, market, language);

    if (!existing) {
      const created = await this.request<RemoteProduct>('/products', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      return {
        platform: this.name,
        slug: product.slug,
        remoteId: String(created.id),
        adminUrl: `https://${this.#config.storeId}.mitiendanube.com/admin/products/${created.id}`,
        created: true,
      };
    }

    // En una actualización se omiten `variants` e `images`: el PUT del producto
    // ignora las variantes anidadas y volver a mandar las imágenes las
    // duplicaría en la ficha.
    const { variants: _variants, images: _images, ...productFields } = body;

    await this.request(`/products/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(productFields),
    });
    await this.#syncVariants(existing, product, market, language);

    return {
      platform: this.name,
      slug: product.slug,
      remoteId: String(existing.id),
      adminUrl: `https://${this.#config.storeId}.mitiendanube.com/admin/products/${existing.id}`,
      created: false,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
