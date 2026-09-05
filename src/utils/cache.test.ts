import assert from "node:assert";
import { test } from "node:test";
import { LRUCache } from "./cache.js";

test("LRUCache stores and returns entries", () => {
	const cache = new LRUCache(1000, 2);
	assert.strictEqual(cache.get("a"), undefined);

	cache.set("a", "A");
	assert.strictEqual(cache.get("a"), "A");
	assert.strictEqual(cache.size, 1);
});

test("LRUCache expires entries once the TTL elapses", () => {
	const cache = new LRUCache(100, 2);
	cache.set("a", "A", 1_000);

	assert.strictEqual(cache.get("a", 1_099), "A");
	assert.strictEqual(cache.get("a", 1_100), undefined);
	assert.strictEqual(cache.size, 0);
});

test("LRUCache evicts the least recently used entry", () => {
	const cache = new LRUCache(1000, 2);
	cache.set("a", "A");
	cache.set("b", "B");

	// Reading "a" makes "b" the least recently used entry.
	assert.strictEqual(cache.get("a"), "A");
	cache.set("c", "C");

	assert.strictEqual(cache.size, 2);
	assert.strictEqual(cache.get("b"), undefined);
	assert.strictEqual(cache.get("a"), "A");
	assert.strictEqual(cache.get("c"), "C");
});

test("LRUCache overwrites an existing key without growing", () => {
	const cache = new LRUCache(1000, 2);
	cache.set("a", "A");
	cache.set("a", "A2");

	assert.strictEqual(cache.size, 1);
	assert.strictEqual(cache.get("a"), "A2");
});

test("LRUCache refreshing recency does not reset the TTL", () => {
	const cache = new LRUCache(100, 2);
	cache.set("a", "A", 0);

	assert.strictEqual(cache.get("a", 50), "A");
	assert.strictEqual(cache.get("a", 100), undefined);
});

test("LRUCache can be cleared", () => {
	const cache = new LRUCache(1000, 2);
	cache.set("a", "A");
	cache.clear();

	assert.strictEqual(cache.size, 0);
	assert.strictEqual(cache.get("a"), undefined);
});

test("LRUCache tolerates a zero max size", () => {
	const cache = new LRUCache(1000, 0);
	cache.set("a", "A");

	assert.strictEqual(cache.size, 0);
	assert.strictEqual(cache.get("a"), undefined);
});
