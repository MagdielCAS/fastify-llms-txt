import assert from "node:assert";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import Fastify from "fastify";
import fastifyLlmsTxt from "./index.js";

// Helper to get absolute path to fixture
const fixturePath = path.join(process.cwd(), "src", "fixtures", "sample.json");

test("fastify-llms-txt plugin", async (t) => {
	await t.test("loads from file and generates markdown", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "file", file: fixturePath },
		});

		const res = await fastify.inject({
			method: "GET",
			url: "/llms.txt",
		});

		assert.strictEqual(res.statusCode, 200);
		assert.match(res.headers["content-type"] as string, /text\/markdown/);
		assert.ok(res.payload.includes("# Sample API v1.0.0"));
		assert.ok(res.payload.includes("Say Hello"));
	});

	await t.test("redirects /llms-full.txt to /llms.txt", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "file", file: fixturePath },
		});

		const res = await fastify.inject({
			method: "GET",
			url: "/llms-full.txt",
		});

		assert.strictEqual(res.statusCode, 301);
		assert.strictEqual(res.headers.location, "/llms.txt");
	});

	await t.test("custom header and footer", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "file", file: fixturePath },
			header: "# My Header",
			footer: "My Footer",
		});

		const res = await fastify.inject({
			method: "GET",
			url: "/llms.txt",
		});

		assert.ok(res.payload.startsWith("# My Header"));
		assert.ok(res.payload.endsWith("My Footer"));
	});

	await t.test("caching behavior", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "file", file: fixturePath },
			cache: { enabled: true, ttl: 1000 },
		});

		const res1 = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res1.statusCode, 200);
		assert.strictEqual(res1.headers["x-cache"], "MISS");

		const res2 = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res2.statusCode, 200);
		assert.strictEqual(res2.headers["x-cache"], "HIT");
	});

	await t.test("loads from URL (mocked)", async () => {
		const fastify = Fastify();

		// Mock global fetch
		const originalFetch = global.fetch;
		global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
			return {
				ok: true,
				text: async () =>
					JSON.stringify({
						openapi: "3.0.0",
						info: { title: "Remote API", version: "1.0.0" },
						paths: {},
					}),
			} as Response;
		};

		try {
			await fastify.register(fastifyLlmsTxt, {
				source: { type: "url", url: "https://example.com/openapi.json" },
			});

			const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
			assert.strictEqual(res.statusCode, 200);
			assert.ok(res.payload.includes("# Remote API v1.0.0"));
		} finally {
			global.fetch = originalFetch;
		}
	});

	await t.test("handles fetch errors", async () => {
		const fastify = Fastify();

		const originalFetch = global.fetch;
		global.fetch = async () => {
			return { ok: false, statusText: "Not Found" } as Response;
		};

		try {
			await fastify.register(fastifyLlmsTxt, {
				source: { type: "url", url: "https://example.com/404" },
			});

			const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
			assert.strictEqual(res.statusCode, 500);
			assert.ok(res.payload.includes("Failed to fetch spec"));
		} finally {
			global.fetch = originalFetch;
		}
	});

	await t.test("auto-detects fastify-swagger", async () => {
		const fastify = Fastify();

		// Mock swagger
		fastify.decorate("swagger", () => ({
			openapi: "3.0.0",
			info: { title: "Swagger API", version: "1.0.0" },
			paths: {},
		}));

		await fastify.register(fastifyLlmsTxt, {}); // No source provided

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res.statusCode, 200);
		assert.ok(res.payload.includes("# Swagger API v1.0.0"));
	});
});
