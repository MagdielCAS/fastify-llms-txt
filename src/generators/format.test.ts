import assert from "node:assert";
import { test } from "node:test";
import {
	formatBold,
	formatCodeBlock,
	formatHeading,
	formatInlineCode,
	formatLink,
	formatList,
	formatSchemaName,
	isReference,
	schemaNameFromRef,
} from "./format.js";

test("formatHeading", () => {
	assert.strictEqual(formatHeading("Title"), "# Title");
	assert.strictEqual(formatHeading("Sub", 2), "## Sub");
});

test("formatCodeBlock", () => {
	assert.strictEqual(formatCodeBlock("code"), "```\ncode\n```");
	assert.strictEqual(
		formatCodeBlock("const a = 1;", "ts"),
		"```ts\nconst a = 1;\n```",
	);
});

test("formatInlineCode", () => {
	assert.strictEqual(formatInlineCode("GET /users"), "`GET /users`");
});

test("formatList", () => {
	assert.strictEqual(formatList(["a", "b"]), "- a\n- b");
	assert.strictEqual(formatList(["a"], 1), "  - a");
});

test("formatBold", () => {
	assert.strictEqual(formatBold("text"), "**text**");
});

test("formatLink", () => {
	assert.strictEqual(
		formatLink("Docs", "https://example.com"),
		"[Docs](https://example.com)",
	);
});

test("isReference", () => {
	assert.strictEqual(isReference({ $ref: "#/components/schemas/User" }), true);
	assert.strictEqual(isReference({ type: "string" }), false);
	assert.strictEqual(isReference(null), false);
	assert.strictEqual(isReference("string"), false);
});

test("schemaNameFromRef", () => {
	assert.strictEqual(schemaNameFromRef("#/components/schemas/User"), "User");
	assert.strictEqual(schemaNameFromRef("User"), "User");
	assert.strictEqual(schemaNameFromRef("#/paths/~1users/get"), "get");
	assert.strictEqual(schemaNameFromRef("#/components/schemas/A~1B"), "A/B");
	assert.strictEqual(schemaNameFromRef("#/components/schemas/A~0B"), "A~B");
	assert.strictEqual(schemaNameFromRef(""), "");
});

test("formatSchemaName", () => {
	assert.strictEqual(formatSchemaName(), "any");
	assert.strictEqual(formatSchemaName({}), "any");
	assert.strictEqual(
		formatSchemaName({ $ref: "#/components/schemas/User" }),
		"User",
	);
	assert.strictEqual(formatSchemaName({ type: "string" }), "string");
	assert.strictEqual(
		formatSchemaName({ type: "string", format: "date-time" }),
		"string (date-time)",
	);
	assert.strictEqual(
		formatSchemaName({ type: ["string", "null"] }),
		"string|null",
	);
	assert.strictEqual(
		formatSchemaName({
			type: "array",
			items: { $ref: "#/components/schemas/User" },
		}),
		"User[]",
	);
	assert.strictEqual(
		formatSchemaName({ type: ["array", "null"], items: { type: "string" } }),
		"null|string[]",
	);
	assert.strictEqual(
		formatSchemaName({ oneOf: [{ type: "string" }, { type: "number" }] }),
		"string | number",
	);
	assert.strictEqual(
		formatSchemaName({ anyOf: [{ type: "string" }, { type: "boolean" }] }),
		"string | boolean",
	);
	assert.strictEqual(
		formatSchemaName({
			allOf: [{ $ref: "#/components/schemas/A" }, { type: "object" }],
		}),
		"A & object",
	);
	assert.strictEqual(formatSchemaName({ oneOf: [] }), "any");
	assert.strictEqual(formatSchemaName({ enum: ["a", "b"] }), '"a" | "b"');
	assert.strictEqual(formatSchemaName({ enum: [] }), "any");
});
