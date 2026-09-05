import assert from "node:assert";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import Fastify from "fastify";
import fastifyLlmsTxt from "./index.js";
import type { LLMsOptions } from "./types.js";

const fixturePath = path.join(process.cwd(), "src", "fixtures", "sample.json");
const yamlFixturePath = path.join(
	process.cwd(),
	"src",
	"fixtures",
	"sample.yaml",
);

function mockFetch(
	t: { mock: { method: typeof import("node:test").mock.method } },
	body: string,
) {
	return t.mock.method(globalThis, "fetch", async (input: unknown) => ({
		ok: true,
		status: 200,
		statusText: "OK",
		headers: new Headers(),
		text: async () => body,
		url: String(input),
	}));
}

test("fastify-llms-txt plugin", async (t) => {
	await t.test("loads from file and generates markdown", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "file", file: fixturePath },
		});

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });

		assert.strictEqual(res.statusCode, 200);
		assert.match(res.headers["content-type"] as string, /text\/markdown/);
		assert.match(res.headers["content-type"] as string, /charset=utf-8/);
		assert.ok(res.payload.includes("# Sample API v1.0.0"));
		assert.ok(res.payload.includes("Say Hello"));
	});

	await t.test("loads a YAML spec relative to a custom basePath", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			basePath: path.join(process.cwd(), "src", "fixtures"),
			source: { type: "file", file: "sample.yaml" },
		});

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });

		assert.strictEqual(res.statusCode, 200);
		assert.ok(res.payload.includes("# YAML API v2.0.0"));
		assert.ok(res.payload.includes("## Webhooks"));
		assert.ok(res.payload.includes("## Data Models"));
	});

	await t.test("serves text/plain when asked", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "file", file: yamlFixturePath },
			contentType: "text/plain",
		});

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.match(
			res.headers["content-type"] as string,
			/text\/plain; charset=utf-8/,
		);
	});

	await t.test("redirects /llms-full.txt to /llms.txt", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "file", file: fixturePath },
		});

		const res = await fastify.inject({ method: "GET", url: "/llms-full.txt" });

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

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });

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
		assert.strictEqual(res2.payload, res1.payload);
	});

	await t.test("does not set X-Cache when caching is disabled", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "file", file: fixturePath },
			cache: { enabled: false },
		});

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res.headers["x-cache"], undefined);
	});

	await t.test("loads from an absolute URL", async (st) => {
		mockFetch(
			st,
			JSON.stringify({
				openapi: "3.0.0",
				info: { title: "Remote API", version: "1.0.0" },
				paths: {},
			}),
		);

		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "url", url: "https://example.com/openapi.json" },
		});

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res.statusCode, 200);
		assert.ok(res.payload.includes("# Remote API v1.0.0"));
	});

	await t.test(
		"resolves a relative URL against the server itself",
		async (st) => {
			const fetchMock = mockFetch(
				st,
				JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Local API", version: "1.0.0" },
					paths: {},
				}),
			);

			const fastify = Fastify();
			await fastify.register(fastifyLlmsTxt, {
				source: { type: "url", url: "/swagger/json" },
				cache: { enabled: true },
			});
			await fastify.listen({ port: 0, host: "127.0.0.1" });
			t.after(() => fastify.close());

			const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
			assert.strictEqual(res.statusCode, 200);
			assert.ok(res.payload.includes("# Local API v1.0.0"));

			const requested = String(fetchMock.mock.calls[0]?.arguments[0]);
			assert.strictEqual(requested, `${fastify.listeningOrigin}/swagger/json`);
		},
	);

	await t.test(
		"refuses to trust the Host header for a relative URL when not listening",
		async (st) => {
			const fetchMock = mockFetch(st, "{}");

			const fastify = Fastify();
			await fastify.register(fastifyLlmsTxt, {
				source: { type: "url", url: "swagger/json" },
			});

			const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
			assert.strictEqual(res.statusCode, 500);
			assert.ok(res.payload.includes("the server is not listening"));
			assert.strictEqual(fetchMock.mock.callCount(), 0);
		},
	);

	await t.test(
		"resolves against the Host header once skipValidation opts in",
		async (st) => {
			const fetchMock = mockFetch(
				st,
				JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Injected API", version: "1.0.0" },
					paths: {},
				}),
			);

			const fastify = Fastify();
			await fastify.register(fastifyLlmsTxt, {
				source: { type: "url", url: "swagger/json", skipValidation: true },
			});

			const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
			assert.strictEqual(res.statusCode, 200);

			const requested = String(fetchMock.mock.calls[0]?.arguments[0]);
			assert.strictEqual(requested, "http://localhost/swagger/json");
		},
	);

	await t.test(
		"a protocol-relative source URL is not treated as local",
		async () => {
			// '//host/path' looks relative but carries its own authority, so it
			// faces the SSRF guard - at registration, before any request.
			const fastify = Fastify();
			await assert.rejects(async () => {
				await fastify.register(fastifyLlmsTxt, {
					source: { type: "url", url: "//169.254.169.254/latest/meta-data" },
				});
			}, /SSRF Protection: Host 169\.254\.169\.254 is blocked/);
		},
	);

	await t.test(
		"a protocol-relative URL to a public host is fetched off-origin",
		async (st) => {
			// It must resolve to that foreign host, not to a path on ourselves.
			const fetchMock = mockFetch(
				st,
				JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Foreign", version: "1.0.0" },
					paths: {},
				}),
			);

			const fastify = Fastify();
			await fastify.register(fastifyLlmsTxt, {
				source: { type: "url", url: "//example.com/openapi.json" },
			});
			await fastify.listen({ port: 0, host: "127.0.0.1" });
			t.after(() => fastify.close());

			const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
			assert.strictEqual(res.statusCode, 200);

			const requested = String(fetchMock.mock.calls[0]?.arguments[0]);
			assert.strictEqual(requested, "http://example.com/openapi.json");
		},
	);

	await t.test("handles fetch errors", async (st) => {
		st.mock.method(globalThis, "fetch", async () => ({
			ok: false,
			status: 404,
			statusText: "Not Found",
			headers: new Headers(),
		}));

		const fastify = Fastify({ logger: false });
		await fastify.register(fastifyLlmsTxt, {
			source: { type: "url", url: "https://example.com/404" },
		});

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res.statusCode, 500);
		assert.ok(res.payload.includes("Failed to fetch spec"));
	});

	await t.test("auto-detects fastify-swagger", async () => {
		const fastify = Fastify();
		fastify.decorate("swagger", () => ({
			openapi: "3.0.0",
			info: { title: "Swagger API", version: "1.0.0" },
			paths: {},
		}));

		await fastify.register(fastifyLlmsTxt, {});

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res.statusCode, 200);
		assert.ok(res.payload.includes("# Swagger API v1.0.0"));
	});

	await t.test("errors when there is no source and no swagger", async () => {
		const fastify = Fastify();
		await fastify.register(fastifyLlmsTxt);

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res.statusCode, 500);
		assert.ok(res.payload.includes("fastify-swagger not detected"));
	});

	await t.test("reports non-Error failures", async () => {
		const fastify = Fastify();
		fastify.decorate("swagger", () => {
			throw "kaboom";
		});
		await fastify.register(fastifyLlmsTxt, {});

		const res = await fastify.inject({ method: "GET", url: "/llms.txt" });
		assert.strictEqual(res.statusCode, 500);
		assert.ok(res.payload.includes("Error processing request: kaboom"));
	});

	await t.test("rejects invalid options at registration time", async () => {
		const fastify = Fastify();
		await assert.rejects(async () => {
			await fastify.register(fastifyLlmsTxt, {
				contentType: "text/html",
			} as unknown as LLMsOptions);
		}, /'contentType' must be one of/);
	});
});
