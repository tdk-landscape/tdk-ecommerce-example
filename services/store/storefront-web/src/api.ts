export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
}

export interface Order {
  id: string;
  totalCents: number;
  lines: Array<{ productId: string; quantity: number; name: string; unitPriceCents: number }>;
}

// catalog-api publishes this fixed port (see services/store/catalog-api/service.json).
export const CATALOG_API_URL = import.meta.env.VITE_CATALOG_API_URL ?? 'http://localhost:4300';

type Fetch = typeof fetch;

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `catalog-api responded ${res.status}`);
  return body.data as T;
}

export function createCatalogApi(baseUrl = CATALOG_API_URL, doFetch: Fetch = fetch) {
  return {
    async products(query = ''): Promise<Product[]> {
      const q = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      return unwrap<Product[]>(await doFetch(`${baseUrl}/api/products${q}`));
    },
    async checkout(lines: Array<{ productId: string; quantity: number }>): Promise<Order> {
      return unwrap<Order>(
        await doFetch(`${baseUrl}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines }),
        }),
      );
    },
  };
}
