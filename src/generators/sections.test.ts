import assert from "node:assert";
import { test } from "node:test";
import type {
	Components,
	PathItem,
	RequestBody,
	Schema,
	Tag,
} from "../types.js";
import {
	formatSchema,
	formatSchemaInline,
	generateAuthentication,
	generateComponents,
	generateExternalDocs,
	generateInfo,
	generatePaths,
	generateServers,
	generateTags,
	generateWebhooks,
} from "./sections.js";

test("generateInfo", () => {
	const output = generateInfo(
		{
			title: "Test API",
			version: "1.0.0",
			summary: "Short summary",
			description: "Desc",
			termsOfService: "http://terms",
			contact: {
				name: "Support",
				email: "support@example.com",
				url: "http://example.com",
			},
			license: { name: "MIT", url: "http://mit" },
		},
		"3.1.0",
	);
	assert.ok(output.includes("# Test API v1.0.0"));
	assert.ok(output.includes("OpenAPI: 3.1.0"));
	assert.ok(output.includes("Short summary"));
	assert.ok(output.includes("Desc"));
	assert.ok(output.includes("Terms of Service: <http://terms>"));
	assert.ok(
		output.includes(
			"Contact: Support <support@example.com> <http://example.com>",
		),
	);
	assert.ok(output.includes("License: MIT <http://mit>"));
});

test("generateInfo with minimal input", () => {
	const output = generateInfo({ title: "Bare", version: "0.1.0" });
	assert.strictEqual(output, "# Bare v0.1.0");
});

test("generateInfo skips an empty contact object and url-less license", () => {
	const output = generateInfo({
		title: "Bare",
		version: "0.1.0",
		contact: {},
		license: { name: "MIT" },
	});
	assert.ok(!output.includes("Contact:"));
	assert.ok(output.includes("License: MIT"));
	assert.ok(!output.includes("License: MIT <"));
});

test("generateExternalDocs", () => {
	assert.strictEqual(generateExternalDocs(), "");
	assert.ok(
		generateExternalDocs({ description: "Guide", url: "http://docs" }).includes(
			"[Guide](http://docs)",
		),
	);
	assert.ok(
		generateExternalDocs({ url: "http://docs" }).includes(
			"[http://docs](http://docs)",
		),
	);
});

test("generateServers", () => {
	const output = generateServers([{ url: "/api/v1", description: "Main" }]);
	assert.ok(output.includes("## Servers"));
	assert.ok(output.includes("- `/api/v1` - Main"));

	assert.strictEqual(generateServers([]), "");
	assert.strictEqual(generateServers(undefined), "");
});

test("generateServers renders templated variables", () => {
	const output = generateServers([
		{
			url: "https://{region}.example.com",
			variables: {
				region: {
					default: "eu",
					enum: ["eu", "us"],
					description: "Region code",
				},
				stage: { default: "prod" },
			},
		},
	]);
	assert.ok(output.includes("- `https://{region}.example.com`"));
	assert.ok(
		output.includes(
			"  - `region`: default `eu` - one of `eu`, `us` - Region code",
		),
	);
	assert.ok(output.includes("  - `stage`: default `prod`"));
});

test("generateAuthentication", () => {
	assert.strictEqual(generateAuthentication(), "");
	assert.strictEqual(generateAuthentication([]), "");

	const single = generateAuthentication([{ bearerAuth: [] }]);
	assert.ok(single.includes("## Authentication"));
	assert.ok(single.includes("Applies to every endpoint unless overridden:"));
	assert.ok(single.includes("- `bearerAuth`"));
	assert.ok(!single.includes("Data Models > Security Schemes"));

	const multiple = generateAuthentication(
		[{ oauth: ["read", "write"], apiKey: [] }, {}],
		{ oauth: { type: "oauth2" } },
	);
	assert.ok(multiple.includes("One of the following applies"));
	assert.ok(multiple.includes("`oauth` (scopes: read, write) AND `apiKey`"));
	assert.ok(multiple.includes("(none - authentication optional)"));
	assert.ok(multiple.includes("Data Models > Security Schemes"));
});

test("generateTags", () => {
	assert.strictEqual(generateTags(), "");
	assert.strictEqual(generateTags([]), "");

	const tags: Tag[] = [
		{ name: "users", description: "User management" },
		{ name: "admin", externalDocs: { url: "http://admin-docs" } },
		{ name: "bare" },
	];
	const output = generateTags(tags);
	assert.ok(output.includes("## API Groups"));
	assert.ok(output.includes("- **users** - User management"));
	assert.ok(output.includes("- **admin** ([docs](http://admin-docs))"));
	assert.ok(output.includes("- **bare**"));
});

test("formatSchemaInline", () => {
	assert.strictEqual(formatSchemaInline(), "");
	assert.strictEqual(
		formatSchemaInline({ type: ["string", "null"] }),
		"string|null",
	);
	assert.strictEqual(
		formatSchemaInline({ type: "string", enum: ["a"] }),
		"string",
	);
	assert.strictEqual(
		formatSchemaInline({ anyOf: [{ type: "string" }] }),
		"string",
	);
	assert.strictEqual(
		formatSchemaInline({ allOf: [{ type: "string" }] }),
		"string",
	);
	assert.strictEqual(formatSchemaInline({ enum: ["a"] }), '"a"');
	assert.strictEqual(formatSchemaInline({ description: "Bare" }), "- Bare");
	assert.strictEqual(formatSchemaInline({ $ref: "#/c/User" }), "[#/c/User]");
	assert.strictEqual(
		formatSchemaInline({ type: "string", format: "uuid" }),
		"string (uuid)",
	);
	assert.strictEqual(
		formatSchemaInline({ oneOf: [{ type: "string" }, { type: "number" }] }),
		"string | number",
	);
	assert.strictEqual(
		formatSchemaInline({
			type: "array",
			items: { type: "string" },
			description: "Names",
		}),
		"array of string - Names",
	);
});

test("formatSchema renders every documented facet", () => {
	const schema: Schema = {
		title: "User",
		type: "object",
		format: "record",
		description: "A user",
		deprecated: true,
		nullable: true,
		readOnly: true,
		writeOnly: true,
		enum: ["a", "b"],
		const: "a",
		default: "a",
		example: "a",
		pattern: "^a",
		minimum: 1,
		maximum: 10,
		minLength: 1,
		maxLength: 10,
		minItems: 1,
		maxItems: 10,
		oneOf: [{ type: "string" }],
		anyOf: [{ type: "number" }],
		allOf: [{ type: "boolean" }],
		not: { type: "null" },
		additionalProperties: false,
		properties: {
			name: { type: "string", description: "The name" },
			address: {
				type: "object",
				properties: { city: { type: "string" } },
			},
		},
		required: ["name"],
		items: { type: "string" },
	};

	const output = formatSchema(schema);
	assert.ok(output.includes("**User**"));
	assert.ok(output.includes("Type: object"));
	assert.ok(output.includes("Format: record"));
	assert.ok(output.includes("A user"));
	assert.ok(output.includes("**DEPRECATED**"));
	assert.ok(output.includes("Nullable: true"));
	assert.ok(output.includes("Read-only: true"));
	assert.ok(output.includes("Write-only: true"));
	assert.ok(output.includes("Enum: a, b"));
	assert.ok(output.includes('Const: "a"'));
	assert.ok(output.includes('Default: "a"'));
	assert.ok(output.includes('Example: "a"'));
	assert.ok(
		output.includes(
			"Constraints: pattern: `^a`, minimum: 1, maximum: 10, minLength: 1, maxLength: 10, minItems: 1, maxItems: 10",
		),
	);
	assert.ok(output.includes("oneOf: string"));
	assert.ok(output.includes("anyOf: number"));
	assert.ok(output.includes("allOf: boolean"));
	assert.ok(output.includes("not: null"));
	assert.ok(output.includes("Additional properties: false"));
	assert.ok(output.includes("- `name*`: string - The name"));
	assert.ok(output.includes("    Type: object"));
	assert.ok(output.includes("Items: string"));
});

test("formatSchema handles references and typed additionalProperties", () => {
	assert.strictEqual(formatSchema({ $ref: "#/c/User" }), "Reference: #/c/User");
	assert.ok(
		formatSchema({ type: ["string", "null"] }).includes("Type: string|null"),
	);
	assert.ok(
		formatSchema({ additionalProperties: { type: "string" } }).includes(
			"Additional properties: string",
		),
	);
});

test("formatSchema stops expanding nested objects at depth 2", () => {
	const deep: Schema = {
		type: "object",
		properties: {
			a: {
				type: "object",
				properties: {
					b: {
						type: "object",
						properties: {
							c: { type: "object", properties: { d: { type: "string" } } },
						},
					},
				},
			},
		},
	};
	const output = formatSchema(deep);
	assert.ok(output.includes("- `a`: object"));
	assert.ok(output.includes("- `c`: object"));
	assert.ok(!output.includes("- `d`: string"));
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
						in: "query" as const,
						schema: { type: "integer" },
						required: true,
						description: "Page num",
					},
				],
				responses: {
					"200": { description: "OK" },
				},
			},
		},
	} satisfies Record<string, PathItem>;

	const output = generatePaths(paths);
	assert.ok(output.includes("## Endpoints"));
	assert.ok(output.includes("### Get Users"));
	assert.ok(output.includes("`GET /users`"));
	assert.ok(output.includes("`page*` (query): Page num integer"));
	assert.ok(output.includes("- 200: OK"));
});

test("generatePaths returns an empty string when there is nothing to render", () => {
	assert.strictEqual(generatePaths(), "");
	assert.strictEqual(generatePaths({}), "");
	assert.strictEqual(
		generatePaths({ "/users": { description: "no operations" } }),
		"",
	);
});

test("generatePaths renders full operation metadata", () => {
	const paths: Record<string, PathItem> = {
		"/users/{id}": {
			parameters: [
				{ name: "id", in: "path", required: true, schema: { type: "string" } },
				{ $ref: "#/components/parameters/TraceId" },
			],
			patch: {
				operationId: "updateUser",
				description: "Update a user",
				deprecated: true,
				tags: ["users", "admin"],
				security: [{ bearerAuth: [] }, { apiKey: ["write"] }],
				externalDocs: { description: "More", url: "http://docs" },
				parameters: [
					{
						name: "dryRun",
						in: "query",
						deprecated: true,
						schema: { type: "boolean" },
					},
				],
				requestBody: {
					description: "Patch payload",
					required: true,
					content: {
						"application/json": { schema: { type: "object" } },
						"text/plain": {},
					},
				},
				responses: {
					"200": {
						description: "Updated",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/User" },
							},
						},
						headers: {
							"X-Rate-Limit": {
								schema: { type: "integer" },
								description: "Remaining",
							},
							"X-Trace": { $ref: "#/components/headers/Trace" },
						},
					},
					"404": { $ref: "#/components/responses/NotFound" },
					"500": {},
				},
			},
		},
	};

	const output = generatePaths(paths);
	assert.ok(output.includes("### updateUser"));
	assert.ok(output.includes("`PATCH /users/{id}`"));
	assert.ok(output.includes("**DEPRECATED**"));
	assert.ok(output.includes("Tags: `users`, `admin`"));
	assert.ok(output.includes("Operation ID: `updateUser`"));
	assert.ok(
		output.includes("Security: `bearerAuth` OR `apiKey` (scopes: write)"),
	);
	assert.ok(output.includes("Docs: [More](http://docs)"));
	assert.ok(output.includes("#### Parameters"));
	// Path-level parameters are inherited by the operation.
	assert.ok(output.includes("- `id*` (path): string"));
	assert.ok(output.includes("- Ref: #/components/parameters/TraceId"));
	assert.ok(output.includes("- `dryRun` (query): boolean **DEPRECATED**"));
	assert.ok(output.includes("#### Request Body"));
	assert.ok(output.includes("Patch payload"));
	assert.ok(output.includes("Required: yes"));
	assert.ok(output.includes("**Content-Type: application/json**"));
	assert.ok(output.includes("**Content-Type: text/plain**"));
	assert.ok(output.includes("#### Responses"));
	assert.ok(output.includes("- 200: Updated"));
	assert.ok(output.includes("  - `application/json` → User"));
	assert.ok(output.includes("  - Headers:"));
	assert.ok(output.includes("    - `X-Rate-Limit` integer - Remaining"));
	assert.ok(output.includes("    - `X-Trace`: [#/components/headers/Trace]"));
	assert.ok(output.includes("- 404: [#/components/responses/NotFound]"));
	assert.ok(output.includes("- 500: "));
});

test("generatePaths falls back to the method and path as a title", () => {
	const output = generatePaths({ "/ping": { head: { responses: {} } } });
	assert.ok(output.includes("### HEAD /ping"));
	assert.ok(!output.includes("#### Responses"));
});

test("generatePaths renders a request body reference and public endpoints", () => {
	const output = generatePaths({
		"/things": {
			post: {
				security: [],
				requestBody: { $ref: "#/components/requestBodies/Thing" },
				responses: {},
			},
		},
	});
	assert.ok(output.includes("Security: none (public endpoint)"));
	assert.ok(output.includes("Reference: #/components/requestBodies/Thing"));
});

test("generatePaths tolerates a content-less request body and bare external docs", () => {
	const output = generatePaths({
		"/things": {
			put: {
				externalDocs: { url: "http://docs" },
				requestBody: {} as unknown as RequestBody,
				responses: {},
			},
		},
	});
	assert.ok(output.includes("Docs: [http://docs](http://docs)"));
	assert.ok(output.includes("Required: no"));
	assert.ok(!output.includes("**Content-Type"));
});

test("generateWebhooks", () => {
	assert.strictEqual(generateWebhooks(), "");
	assert.strictEqual(generateWebhooks({}), "");
	assert.strictEqual(
		generateWebhooks({ ref: { $ref: "#/components/pathItems/Hook" } }),
		"",
	);

	const output = generateWebhooks({
		newUser: {
			post: {
				summary: "New user created",
				responses: { "200": { description: "Ack" } },
			},
		},
	});
	assert.ok(output.includes("## Webhooks"));
	assert.ok(output.includes("### New user created"));
	assert.ok(output.includes("`POST (webhook: newUser)`"));
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
	} satisfies Components;

	const output = generateComponents(components);
	assert.ok(output.includes("## Data Models"));
	assert.ok(output.includes("### Schemas"));
	assert.ok(output.includes("#### User"));
	assert.ok(output.includes("Type: object"));
	assert.ok(output.includes("Properties:"));
	assert.ok(output.includes("- `name*`: string - The name"));
	assert.ok(output.includes("- `age`: integer"));
});

test("generateComponents returns an empty string when there is nothing to render", () => {
	assert.strictEqual(generateComponents(), "");
	assert.strictEqual(generateComponents({}), "");
	assert.strictEqual(
		generateComponents({ schemas: {}, securitySchemes: {} }),
		"",
	);
});

test("generateComponents renders security schemes", () => {
	const output = generateComponents({
		securitySchemes: {
			apiKey: {
				type: "apiKey",
				name: "X-Api-Key",
				in: "header",
				description: "Key auth",
			},
			bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
			oauth: {
				type: "oauth2",
				flows: {
					authorizationCode: {
						authorizationUrl: "http://auth",
						tokenUrl: "http://token",
						refreshUrl: "http://refresh",
						scopes: { read: "Read access" },
					},
					implicit: {},
				},
			},
			oidc: { type: "openIdConnect", openIdConnectUrl: "http://oidc" },
			mtls: { type: "mutualTLS" },
			flowless: { type: "oauth2" },
			shared: { $ref: "#/components/securitySchemes/apiKey" },
			bare: { type: "apiKey" },
			bareHttp: { type: "http" },
			bareOidc: { type: "openIdConnect" },
		},
	});

	assert.ok(output.includes("### Security Schemes"));
	assert.ok(output.includes("#### apiKey"));
	assert.ok(output.includes("Key auth"));
	assert.ok(output.includes("Parameter: `X-Api-Key`"));
	assert.ok(output.includes("Location: header"));
	assert.ok(output.includes("Scheme: bearer"));
	assert.ok(output.includes("Bearer format: JWT"));
	assert.ok(output.includes("**Flow: authorizationCode**"));
	assert.ok(output.includes("Authorization URL: <http://auth>"));
	assert.ok(output.includes("Token URL: <http://token>"));
	assert.ok(output.includes("Refresh URL: <http://refresh>"));
	assert.ok(output.includes("  - `read`: Read access"));
	assert.ok(output.includes("**Flow: implicit**"));
	assert.ok(output.includes("OpenID Connect URL: <http://oidc>"));
	assert.ok(output.includes("Type: mutualTLS"));
	assert.ok(output.includes("Reference: #/components/securitySchemes/apiKey"));
});

test("generateComponents renders reusable responses and parameters", () => {
	const output = generateComponents({
		responses: {
			NotFound: {
				description: "Not found",
				content: {
					"application/json": {
						schema: { $ref: "#/components/schemas/Error" },
					},
				},
				headers: { "X-Trace": { schema: { type: "string" } } },
			},
			Empty: {},
			Shared: { $ref: "#/components/responses/NotFound" },
		},
		parameters: {
			TraceId: { name: "X-Trace-Id", in: "header", schema: { type: "string" } },
		},
	});

	assert.ok(output.includes("### Reusable Responses"));
	assert.ok(output.includes("#### NotFound"));
	assert.ok(output.includes("Not found"));
	assert.ok(output.includes("Content:"));
	assert.ok(output.includes("  - `application/json` → Error"));
	assert.ok(output.includes("Headers:"));
	assert.ok(output.includes("  - `X-Trace` string"));
	assert.ok(output.includes("Reference: #/components/responses/NotFound"));
	assert.ok(output.includes("### Reusable Parameters"));
	assert.ok(output.includes("- `X-Trace-Id` (header): string"));
});
