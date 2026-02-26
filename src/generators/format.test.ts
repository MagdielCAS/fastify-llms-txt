import assert from "node:assert";
import { test } from "node:test";
import {
	formatBold,
	formatCodeBlock,
	formatHeading,
	formatList,
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

test("formatList", () => {
	assert.strictEqual(formatList(["a", "b"]), "- a\n- b");
	assert.strictEqual(formatList(["a"], 1), "  - a");
});

test("formatBold", () => {
	assert.strictEqual(formatBold("text"), "**text**");
});
