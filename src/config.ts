import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carga variables de entorno desde `.env` sin dependencias externas.
 *
 * Las variables ya presentes en `process.env` ganan, para que un secreto de CI
 * nunca sea pisado por un `.env` que quedó olvidado en el working copy.
 */
export function loadDotEnv(dir: string = process.cwd()): void {
  const path = resolve(dir, '.env');
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export interface ShopifyConfig {
  /** Dominio `.myshopify.com` de la tienda. */
  shop: string;
  /** Admin API access token de una app personalizada (empieza con `shpat_`). */
  accessToken: string;
  apiVersion: string;
}

export interface TiendanubeConfig {
  /** ID numérico de la tienda (el `user_id` que devuelve OAuth). */
  storeId: string;
  accessToken: string;
  /**
   * Tiendanube exige un User-Agent identificable con un email de contacto.
   * Las peticiones sin él son rechazadas o limitadas.
   */
  userAgent: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} (ver .env.example)`);
  return value;
}

/** Shopify versiona la Admin API por fecha; 2026-07 es la estable actual. */
export const SHOPIFY_DEFAULT_API_VERSION = '2026-07';

export function shopifyConfig(): ShopifyConfig {
  const shop = required('SHOPIFY_SHOP')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  if (!shop.endsWith('.myshopify.com')) {
    throw new Error(`SHOPIFY_SHOP debe ser el dominio .myshopify.com, recibido: ${shop}`);
  }
  return {
    shop,
    accessToken: required('SHOPIFY_ACCESS_TOKEN'),
    apiVersion: process.env.SHOPIFY_API_VERSION || SHOPIFY_DEFAULT_API_VERSION,
  };
}

export function tiendanubeConfig(): TiendanubeConfig {
  return {
    storeId: required('TIENDANUBE_STORE_ID'),
    accessToken: required('TIENDANUBE_ACCESS_TOKEN'),
    userAgent: process.env.TIENDANUBE_USER_AGENT || required('TIENDANUBE_USER_AGENT'),
  };
}

/** Qué plataformas tienen credenciales completas en el entorno actual. */
export function availablePlatforms(): string[] {
  const available: string[] = [];
  if (process.env.SHOPIFY_SHOP && process.env.SHOPIFY_ACCESS_TOKEN) available.push('shopify');
  if (process.env.TIENDANUBE_STORE_ID && process.env.TIENDANUBE_ACCESS_TOKEN) {
    available.push('tiendanube');
  }
  return available;
}
