import assert from "node:assert";
import { test } from "node:test";
import {
	convertOpenAPIToMarkdown,
	OpenAPIToMarkdownConverter,
} from "./converter.js";
import type { OpenAPISpec } from "./types.js";

const spec: OpenAPISpec = {
	openapi: "3.1.0",
	info: { title: "Full API", version: "2.0.0", description: "Everything" },
	externalDocs: { description: "Guide", url: "http://docs" },
	servers: [{ url: "https://api.example.com" }],
	security: [{ bearerAuth: [] }],
	tags: [{ name: "users" }],
	paths: {
		"/users": {
			get: {
				summary: "List users",
				responses: { "200": { description: "OK" } },
			},
		},
	},
	webhooks: {
		created: {
			post: {
				summary: "User created",
				responses: { "200": { description: "Ack" } },
			},
		},
	},
	components: {
		schemas: { User: { type: "object" } },
		securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
	},
};

test("convertOpenAPIToMarkdown emits every section in order", () => {
	const output = convertOpenAPIToMarkdown(spec);
	const order = [
		"# Full API v2.0.0",
		"## External Documentation",
		"## Servers",
		"## Authentication",
		"## API Groups",
		"## Endpoints",
		"## Webhooks",
		"## Data Models",
	];

	let cursor = -1;
	for (const heading of order) {
		const index = output.indexOf(heading);
		assert.ok(index > cursor, `${heading} is missing or out of order`);
		cursor = index;
	}
});

test("convertOpenAPIToMarkdown omits empty sections", () => {
	const output = convertOpenAPIToMarkdown({
		openapi: "3.0.0",
		info: { title: "Tiny", version: "1.0.0" },
		paths: {},
	});
	assert.strictEqual(output, "# Tiny v1.0.0\n\nOpenAPI: 3.0.0");
});

test("OpenAPIToMarkdownConverter rejects invalid specs", () => {
	assert.throws(
		() => new OpenAPIToMarkdownConverter(null as unknown as OpenAPISpec),
		/expected an object/,
	);
	assert.throws(
		() => new OpenAPIToMarkdownConverter("nope" as unknown as OpenAPISpec),
		/expected an object/,
	);
	assert.throws(
		() => new OpenAPIToMarkdownConverter({} as unknown as OpenAPISpec),
		/missing 'info.title'/,
	);
	assert.throws(
		() =>
			new OpenAPIToMarkdownConverter({
				info: { version: "1" },
			} as unknown as OpenAPISpec),
		/missing 'info.title'/,
	);
});

test("OpenAPIToMarkdownConverter is reusable", () => {
	const converter = new OpenAPIToMarkdownConverter(spec);
	assert.strictEqual(converter.convert(), converter.convert());
});
