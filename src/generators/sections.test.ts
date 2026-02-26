import assert from "node:assert";
import { test } from "node:test";
import { OpenAPISpec } from "../types.js";
import {
	generateComponents,
	generateInfo,
	generatePaths,
	generateServers,
} from "./sections.js";

test("generateInfo", () => {
	const info = {
		title: "Test API",
		version: "1.0.0",
		description: "Desc",
		termsOfService: "http://terms",
		contact: {
			name: "Support",
			email: "support@example.com",
			url: "http://example.com",
		},
		license: { name: "MIT", url: "http://mit" },
	};
	const output = generateInfo(info);
	assert.ok(output.includes("# Test API v1.0.0"));
	assert.ok(output.includes("Desc"));
	assert.ok(output.includes("Terms of Service: <http://terms>"));
	assert.ok(
		output.includes(
			"Contact: Support <support@example.com> <http://example.com>",
		),
	);
	assert.ok(output.includes("License: MIT <http://mit>"));
});

test("generateServers", () => {
	const output = generateServers([{ url: "/api/v1", description: "Main" }]);
	assert.ok(output.includes("## Servers"));
	assert.ok(output.includes("- `/api/v1` - Main"));

	assert.strictEqual(generateServers([]), "");
	assert.strictEqual(generateServers(undefined), "");
});

test("generatePaths", () => {
	const paths = {
		"/users": {
			get: {
				summary: "Get Users",
				description: "List users",
				parameters: [
					{
						name: "page",
						in: "query",
						schema: { type: "integer" },
						required: true,
						description: "Page num",
						// biome-ignore lint/suspicious/noExplicitAny: test
					} as any,
				],
				responses: {
					"200": { description: "OK" },
				},
			},
		},
	};
	// Casting to any for simplified test object structure matching the type
	// biome-ignore lint/suspicious/noExplicitAny: testing simplified object
	const output = generatePaths(paths as any);
	assert.ok(output.includes("### Get Users"));
	assert.ok(output.includes("`GET /users`"));
	assert.ok(output.includes("`page*` (query): Page num integer"));
	// note: formatting might differ slightly "integer" vs "type: integer" depending on helper
	// formatSchemaInline: parts.push(type) -> "integer"
	assert.ok(output.includes("- 200: OK"));
});

test("generateComponents", () => {
	const components = {
		schemas: {
			User: {
				type: "object",
				properties: {
					name: { type: "string", description: "The name" },
					age: { type: "integer" },
				},
				required: ["name"],
			},
		},
	};
	// biome-ignore lint/suspicious/noExplicitAny: testing simplified object
	const output = generateComponents(components as any);
	assert.ok(output.includes("## Schemas"));
	assert.ok(output.includes("### User"));
	assert.ok(output.includes("Type: object"));
	assert.ok(output.includes("Properties:"));
	assert.ok(output.includes("- `name*`: string - The name"));
	assert.ok(output.includes("- `age`: integer"));
});
