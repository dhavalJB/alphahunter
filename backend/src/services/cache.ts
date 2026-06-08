import { CACHE_TTL_MS } from "../config";
import { logger } from "./logger";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs: number = CACHE_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const inflightRequests = new Map<string, Promise<unknown>>();

export async function dedupeRequest<T>(
  key: string,
  factory: () => Promise<T>
): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    // silent dedupe — expected under concurrent requests
    return existing as Promise<T>;
  }

  const promise = factory().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}
