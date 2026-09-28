import type { Product } from './api';

export type Cart = Record<string, number>;

/** Adds one unit, never beyond what is in stock. */
export function addToCart(cart: Cart, product: Product): Cart {
  const current = cart[product.id] ?? 0;
  if (current >= product.stock) return cart;
  return { ...cart, [product.id]: current + 1 };
}

/** Removes one unit; the line disappears at zero. */
export function removeFromCart(cart: Cart, productId: string): Cart {
  const current = cart[productId] ?? 0;
  if (current <= 1) {
    const { [productId]: _removed, ...rest } = cart;
    return rest;
  }
  return { ...cart, [productId]: current - 1 };
}

export function cartCount(cart: Cart): number {
  return Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
}

export function cartTotalCents(cart: Cart, products: Product[]): number {
  return products.reduce((sum, product) => sum + product.priceCents * (cart[product.id] ?? 0), 0);
}

export function toOrderLines(cart: Cart): Array<{ productId: string; quantity: number }> {
  return Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }));
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
