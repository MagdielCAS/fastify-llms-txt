import assert from "node:assert";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { validateFilePath, validateUrl } from "./validation.js";

test("validateUrl", async (t) => {
	await t.test("allows valid http/https urls", () => {
		assert.doesNotThrow(() => validateUrl("https://example.com/spec.json"));
		assert.doesNotThrow(() => validateUrl("http://example.com/spec.json"));
	});

	await t.test("rejects non-http protocols", () => {
		assert.throws(() => validateUrl("ftp://example.com"), /Invalid protocol/);
	});

	await t.test("rejects private/blocked hosts (SSRF)", () => {
		assert.throws(() => validateUrl("http://localhost/foo"));
		assert.throws(() => validateUrl("http://127.0.0.1/foo"));
		assert.throws(() => validateUrl("http://192.168.1.1/foo"));
		assert.throws(() => validateUrl("http://172.16.0.1/foo"));
		assert.throws(() => validateUrl("http://10.0.0.1/foo"));
		assert.throws(() => validateUrl("http://169.254.0.1/foo"));
		assert.throws(() => validateUrl("http://[::1]/foo"));
	});

	await t.test("handles relative URL strings (allows them)", () => {
		assert.doesNotThrow(() => validateUrl("/foo/bar"));
	});

	await t.test("rejects bad urls that parse but are private", () => {
		// already covered above
	});
});

test("validateFilePath", async (t) => {
	const cwd = process.cwd();

	await t.test("allows file within base path", () => {
		const p = validateFilePath("src/index.ts", cwd);
		assert.strictEqual(p, path.join(cwd, "src/index.ts"));
	});

	await t.test("rejects traversal out of base", () => {
		assert.throws(
			() => validateFilePath("../outside.txt", cwd),
			/Path Traversal/,
		);
		assert.throws(() => validateFilePath("/etc/passwd", cwd), /Path Traversal/);
	});
});
