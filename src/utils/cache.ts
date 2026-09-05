interface CacheEntry {
	content: string;
	timestamp: number;
}

/**
 * Minimal LRU cache with per-entry TTL, backed by `Map` insertion order.
 * Reading an entry marks it as most recently used.
 */
export class LRUCache {
	readonly #store = new Map<string, CacheEntry>();
	readonly #ttl: number;
	readonly #maxSize: number;

	constructor(ttl: number, maxSize: number) {
		this.#ttl = ttl;
		this.#maxSize = maxSize;
	}

	get size(): number {
		return this.#store.size;
	}

	get(key: string, now: number = Date.now()): string | undefined {
		const entry = this.#store.get(key);
		if (!entry) return undefined;

		if (now - entry.timestamp >= this.#ttl) {
			this.#store.delete(key);
			return undefined;
		}

		// Refresh recency without resetting the TTL.
		this.#store.delete(key);
		this.#store.set(key, entry);
		return entry.content;
	}

	set(key: string, content: string, now: number = Date.now()): void {
		this.#store.delete(key);
		this.#store.set(key, { content, timestamp: now });

		for (const oldest of this.#store.keys()) {
			if (this.#store.size <= this.#maxSize) break;
			this.#store.delete(oldest);
		}
	}

	clear(): void {
		this.#store.clear();
	}
}
