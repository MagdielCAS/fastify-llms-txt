import Fastify from "fastify";
import { expectAssignable, expectError, expectType } from "tsd";
import type { LLMsOptions, LLMsSource, OpenAPISpec } from "../dist/index.js";
import fastifyLlmsTxt, {
	convertOpenAPIToMarkdown,
	OpenAPIToMarkdownConverter,
} from "../dist/index.js";

const app = Fastify();

// Registering with no options is allowed: the plugin falls back to @fastify/swagger.
app.register(fastifyLlmsTxt);

app.register(fastifyLlmsTxt, {
	source: { type: "file", file: "./openapi.json" },
	header: "# Header",
	footer: "Footer",
	contentType: "text/markdown",
	basePath: process.cwd(),
	cache: { enabled: true, ttl: 60_000, maxSize: 100 },
});

app.register(fastifyLlmsTxt, {
	source: {
		type: "url",
		url: "https://example.com/openapi.json",
		skipValidation: true,
	},
	contentType: "text/plain",
});

// A file source must not carry a url, and vice versa.
expectError(
	app.register(fastifyLlmsTxt, { source: { type: "file", url: "/spec" } }),
);
expectError(
	app.register(fastifyLlmsTxt, {
		source: { type: "url", file: "./spec.json" },
	}),
);
expectError(app.register(fastifyLlmsTxt, { contentType: "text/html" }));
expectError(app.register(fastifyLlmsTxt, { cache: { ttl: 1000 } }));
expectError(app.register(fastifyLlmsTxt, { header: 1 }));

expectAssignable<LLMsSource>({ type: "file", file: "./openapi.json" });
expectAssignable<LLMsSource>({ type: "url", url: "/swagger/json" });
expectAssignable<LLMsOptions>({});

const spec: OpenAPISpec = {
	openapi: "3.1.0",
	info: { title: "API", version: "1.0.0" },
	paths: {
		"/users": {
			get: { responses: { "200": { description: "OK" } } },
		},
	},
};

expectType<string>(convertOpenAPIToMarkdown(spec));
expectType<string>(new OpenAPIToMarkdownConverter(spec).convert());

// `swagger` is declared on the Fastify instance by this plugin.
expectType<(() => OpenAPISpec) | undefined>(app.swagger);
