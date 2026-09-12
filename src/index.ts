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

/** The origin this server answers on, or "" when it is not listening yet. */
function trustedOrigin(fastify: FastifyInstance): string {
	try {
		return fastify.listeningOrigin;
	} catch {
		// `listeningOrigin` throws while there is no bound address.
		return "";
	}
}

/**
 * Resolves a source URL and reports the origin that may skip the SSRF guard.
 *
 * Only the listening origin establishes that trust, and it is handed down so
 * it can be applied per redirect hop rather than to the whole chain. Locality
 * cannot be inferred from the shape of the configured URL: a protocol-relative
 * `//169.254.169.254/` looks relative but resolves to a foreign host. Nor can
 * the request's Host header stand in for the server's own origin, since a
 * client controls it.
 */
function resolveSourceUrl(
	url: string,
	fastify: FastifyInstance,
	req: FastifyRequest,
	skipValidation: boolean,
): { target: string; trustedOrigin: string } {
	const origin = trustedOrigin(fastify);

	if (!origin) {
		// No bound address (fastify.inject, serverless adaptors). The Host
		// header is the only candidate left, so require an explicit opt-in.
		if (!skipValidation) {
			try {
				return { target: new URL(url).toString(), trustedOrigin: "" };
			} catch {
				throw new Error(
					`Cannot resolve the relative source URL '${url}': the server is not listening, so its own origin is unknown. Use an absolute URL, or set 'source.skipValidation' to resolve it against the request's Host header.`,
				);
			}
		}
		const base = `${req.protocol}://${req.host}`;
		return { target: new URL(url, base).toString(), trustedOrigin: "" };
	}

	return {
		target: new URL(url, origin).toString(),
		trustedOrigin: new URL(origin).origin,
	};
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

	async function fetchSpec(
		resolvedUrl: string,
		originToTrust: string,
	): Promise<OpenAPISpec> {
		if (!source) {
			if (typeof fastify.swagger === "function") {
				return fastify.swagger();
			}
			throw new Error("No source provided and fastify-swagger not detected.");
		}

		if (source.type === "file") {
			return parseFromFile(source.file, basePath);
		}

		// A hop on this server's own origin cannot be an SSRF vector, so the
		// guard (which blocks private hosts) would reject it for no benefit.
		// Every other hop, redirects included, is still checked.
		return parseFromUrl(resolvedUrl, {
			skipValidation: source.skipValidation === true,
			trustedOrigin: originToTrust,
		});
	}

	// Keeps the plugin's own routes out of the spec it documents. `hide` is
	// read by @fastify/swagger; plain Fastify ignores it.
	const routeOptions = { schema: { hide: true } } as RouteShorthandOptions;

	fastify.get("/llms.txt", routeOptions, async (req, reply) => {
		try {
			const resolved =
				source?.type === "url"
					? resolveSourceUrl(
							source.url,
							fastify,
							req,
							source.skipValidation === true,
						)
					: { target: "", trustedOrigin: "" };
			const key = cacheKey(source, resolved.target);

			if (cache?.enabled) {
				const cached = cacheStore.get(key);
				if (cached !== undefined) {
					reply.header("X-Cache", "HIT");
					reply.type(`${contentType}; charset=utf-8`);
					return cached;
				}
			}

			const spec = await fetchSpec(resolved.target, resolved.trustedOrigin);
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
