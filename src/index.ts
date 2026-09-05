import type {
	FastifyInstance,
	FastifyPluginAsync,
	FastifyRequest,
	RouteShorthandOptions,
} from "fastify";
import fp from "fastify-plugin";
import { convertOpenAPIToMarkdown } from "./converter.js";
import type { LLMsOptions, LLMsSource, OpenAPISpec } from "./types.js";
import { LRUCache } from "./utils/cache.js";
import { parseFromFile, parseFromUrl } from "./utils/parser.js";
import { validateOptions } from "./utils/validation.js";

declare module "fastify" {
	interface FastifyInstance {
		swagger?: () => OpenAPISpec;
	}
}

const DEFAULT_TTL = 60_000;
const DEFAULT_MAX_SIZE = 100;

function isAbsoluteUrl(url: string): boolean {
	return /^https?:\/\//i.test(url);
}

/**
 * Resolves a relative source URL against the server's own origin.
 *
 * The listening origin is preferred over the request's Host header, which a
 * client controls and could otherwise point the fetch at an arbitrary host.
 */
function resolveSourceUrl(
	url: string,
	fastify: FastifyInstance,
	req: FastifyRequest,
): string {
	if (isAbsoluteUrl(url)) return url;

	let origin: string;
	try {
		origin = fastify.listeningOrigin;
	} catch {
		origin = "";
	}
	if (!origin) {
		origin = `${req.protocol}://${req.hostname}`;
	}

	return new URL(url, origin).toString();
}

function cacheKey(source: LLMsSource | undefined, resolvedUrl: string): string {
	if (!source) return "swagger";
	return source.type === "file" ? `file:${source.file}` : `url:${resolvedUrl}`;
}

const fastifyLlmsTxt: FastifyPluginAsync<LLMsOptions> = async (
	fastify,
	options,
) => {
	validateOptions(options);

	const {
		source,
		header,
		footer,
		cache,
		basePath,
		contentType = "text/markdown",
	} = options;

	const cacheStore = new LRUCache(
		cache?.ttl ?? DEFAULT_TTL,
		cache?.maxSize ?? DEFAULT_MAX_SIZE,
	);

	async function fetchSpec(resolvedUrl: string): Promise<OpenAPISpec> {
		if (!source) {
			if (typeof fastify.swagger === "function") {
				return fastify.swagger();
			}
			throw new Error("No source provided and fastify-swagger not detected.");
		}

		if (source.type === "file") {
			return parseFromFile(source.file, basePath);
		}

		// A relative URL always resolves to this server, so the SSRF guard (which
		// blocks private hosts) would reject it for no benefit.
		const skipValidation = source.skipValidation || !isAbsoluteUrl(source.url);
		return parseFromUrl(resolvedUrl, skipValidation);
	}

	// Keeps the plugin's own routes out of the spec it documents. `hide` is
	// read by @fastify/swagger; plain Fastify ignores it.
	const routeOptions = { schema: { hide: true } } as RouteShorthandOptions;

	fastify.get("/llms.txt", routeOptions, async (req, reply) => {
		try {
			const resolvedUrl =
				source?.type === "url"
					? resolveSourceUrl(source.url, fastify, req)
					: "";
			const key = cacheKey(source, resolvedUrl);

			if (cache?.enabled) {
				const cached = cacheStore.get(key);
				if (cached !== undefined) {
					reply.header("X-Cache", "HIT");
					reply.type(`${contentType}; charset=utf-8`);
					return cached;
				}
			}

			const spec = await fetchSpec(resolvedUrl);
			let markdown = convertOpenAPIToMarkdown(spec);
			if (header) markdown = `${header}\n\n${markdown}`;
			if (footer) markdown = `${markdown}\n\n${footer}`;

			if (cache?.enabled) {
				cacheStore.set(key, markdown);
				reply.header("X-Cache", "MISS");
			}

			reply.type(`${contentType}; charset=utf-8`);
			return markdown;
		} catch (err: unknown) {
			fastify.log.error(err);
			const message = err instanceof Error ? err.message : String(err);
			return reply.status(500).send(`Error processing request: ${message}`);
		}
	});

	fastify.get("/llms-full.txt", routeOptions, async (_req, reply) => {
		return reply.redirect("/llms.txt", 301);
	});
};

export default fp(fastifyLlmsTxt, {
	name: "fastify-llms-txt",
	fastify: "5.x",
});

export {
	convertOpenAPIToMarkdown,
	OpenAPIToMarkdownConverter,
} from "./converter.js";
export type {
	Info,
	LLMsCacheOptions,
	LLMsOptions,
	LLMsSource,
	OpenAPISpec,
	Operation,
	Parameter,
	PathItem,
	Reference,
	RequestBody,
	Response,
	Schema,
	SecurityScheme,
} from "./types.js";
