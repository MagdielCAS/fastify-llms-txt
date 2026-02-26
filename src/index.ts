import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { convertOpenAPIToMarkdown } from "./converter.js";
import type { LLMsOptions, OpenAPISpec } from "./types.js";
import { validateFilePath, validateUrl } from "./utils/validation.js";

declare module "fastify" {
	interface FastifyInstance {
		swagger?: () => OpenAPISpec;
	}
}

const fastifyLlmsTxt: FastifyPluginAsync<LLMsOptions> = async (
	fastify,
	options,
) => {
	const {
		source,
		header,
		footer,
		cache,
		contentType = "text/markdown",
	} = options;

	// Simple LRU Cache
	const cacheStore = new Map<string, { content: string; timestamp: number }>();
	const CACHE_TTL = cache?.ttl ?? 60_000;
	const CACHE_MAX = cache?.maxSize ?? 100;

	async function fetchSpec(req: FastifyRequest): Promise<OpenAPISpec> {
		if (!source) {
			// Try Fastify Swagger
			const swaggerPlugin = fastify.swagger;
			if (typeof swaggerPlugin === "function") {
				return swaggerPlugin();
			}
			throw new Error("No source provided and fastify-swagger not detected.");
		}

		let content: string;

		if (source.type === "file") {
			const filePath = validateFilePath(source.file);
			content = await fs.readFile(filePath, "utf-8");
		} else {
			// URL Source
			let targetUrl = source.url;
			// Resolve relative URL
			if (!targetUrl.startsWith("http")) {
				const protocol = req.protocol;
				const host = req.hostname;
				targetUrl = `${protocol}://${host}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
			}

			if (!source.skipValidation) {
				// Validate resolved absolute URL
				validateUrl(targetUrl);
			}

			const res = await fetch(targetUrl);
			if (!res.ok) {
				throw new Error(
					`Failed to fetch spec from ${targetUrl}: ${res.statusText}`,
				);
			}
			content = await res.text();
		}

		// Attempt Parse
		try {
			return JSON.parse(content);
		} catch {
			// Try YAML
			try {
				const yaml = await import("js-yaml");
				return yaml.load(content) as OpenAPISpec;
			} catch (e: unknown) {
				if (
					e &&
					typeof e === "object" &&
					"code" in e &&
					(e as { code: string }).code === "ERR_MODULE_NOT_FOUND"
				) {
					throw new Error(
						"Received YAML (or invalid JSON) but 'js-yaml' is not installed.",
					);
				}
				throw new Error("Failed to parse OpenAPI spec (Invalid JSON/YAML)");
			}
		}
	}
	fastify.get("/llms.txt", async (req, reply) => {
		try {
			let key = "";
			if (source) {
				if (source.type === "file") {
					key = `file:${source.file}`;
				} else {
					if (source.url.startsWith("http")) {
						key = `url:${source.url}`;
					} else {
						key = `url:${req.protocol}://${req.hostname}${source.url}`;
					}
				}
			} else {
				key = "swagger";
			}

			if (cache?.enabled) {
				const cached = cacheStore.get(key);
				if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
					reply.header("X-Cache", "HIT");
					reply.type(`${contentType}; charset=utf-8`);
					return cached.content;
				}
			}

			const spec = await fetchSpec(req);
			let markdown = convertOpenAPIToMarkdown(spec);
			if (header) markdown = `${header}\n\n${markdown}`;
			if (footer) markdown = `${markdown}\n\n${footer}`;

			if (cache?.enabled) {
				if (cacheStore.size >= CACHE_MAX) {
					const firstKey = cacheStore.keys().next().value;
					if (firstKey) cacheStore.delete(firstKey);
				}
				cacheStore.set(key, { content: markdown, timestamp: Date.now() });
				reply.header("X-Cache", "MISS");
			}

			reply.type(`${contentType}; charset=utf-8`);
			return markdown;
		} catch (err: unknown) {
			fastify.log.error(err);
			const message = err instanceof Error ? err.message : String(err);
			reply.status(500).send(`Error processing request: ${message}`);
		}
	});

	fastify.get("/llms-full.txt", async (req, reply) => {
		reply.code(301).redirect("/llms.txt");
	});
};

export default fp(fastifyLlmsTxt, {
	name: "fastify-llms-txt",
	fastify: "5.x",
});
