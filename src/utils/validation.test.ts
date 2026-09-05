import assert from "node:assert";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import type { LLMsOptions } from "../types.js";
import {
	isInside,
	isPrivateHost,
	validateFilePath,
	validateOptions,
	validateUrl,
} from "./validation.js";

test("validateUrl", async (t) => {
	await t.test("allows valid http/https urls", () => {
		assert.doesNotThrow(() => validateUrl("https://example.com/spec.json"));
		assert.doesNotThrow(() => validateUrl("http://example.com/spec.json"));
	});

	await t.test("rejects non-http protocols", () => {
		assert.throws(() => validateUrl("ftp://example.com"), /Invalid protocol/);
		assert.throws(() => validateUrl("file:///etc/passwd"), /Invalid protocol/);
	});

	await t.test("rejects private/blocked hosts (SSRF)", () => {
		for (const url of [
			"http://localhost/foo",
			"http://api.localhost/foo",
			"http://127.0.0.1/foo",
			"http://192.168.1.1/foo",
			"http://172.16.0.1/foo",
			"http://172.31.255.255/foo",
			"http://10.0.0.1/foo",
			"http://169.254.169.254/latest/meta-data",
			"http://100.64.0.1/foo",
			"http://0.0.0.0/foo",
			"http://[::1]/foo",
			"http://[::]/foo",
			"http://[::ffff:127.0.0.1]/foo",
			"http://[fe80::1]/foo",
			"http://[fd00::1]/foo",
		]) {
			assert.throws(() => validateUrl(url), /SSRF Protection/, url);
		}
	});

	await t.test("allows public hosts that look similar to private ones", () => {
		assert.doesNotThrow(() => validateUrl("http://172.32.0.1/foo"));
		assert.doesNotThrow(() => validateUrl("http://172.15.0.1/foo"));
		assert.doesNotThrow(() => validateUrl("http://192.169.0.1/foo"));
		assert.doesNotThrow(() => validateUrl("http://100.128.0.1/foo"));
		assert.doesNotThrow(() => validateUrl("http://[2001:db8::1]/foo"));
		assert.doesNotThrow(() => validateUrl("http://[::ffff:8.8.8.8]/foo"));
	});

	await t.test("handles relative URL strings (allows them)", () => {
		assert.doesNotThrow(() => validateUrl("/foo/bar"));
		assert.doesNotThrow(() => validateUrl("swagger/json"));
	});
});

test("isPrivateHost understands IPv4-mapped IPv6 in dotted form", () => {
	assert.strictEqual(isPrivateHost("::ffff:127.0.0.1"), true);
	assert.strictEqual(isPrivateHost("::ffff:8.8.8.8"), false);
	assert.strictEqual(isPrivateHost("[::ffff:10.0.0.1]"), true);
});

test("isPrivateHost ignores malformed dotted hosts", () => {
	assert.strictEqual(isPrivateHost("example.com"), false);
	assert.strictEqual(isPrivateHost("10.0.0"), false);
	assert.strictEqual(isPrivateHost("10.0.0.999"), false);
	assert.strictEqual(isPrivateHost("10.a.0.1"), false);
});

test("validateFilePath", async (t) => {
	const cwd = process.cwd();

	await t.test("allows file within base path", () => {
		const p = validateFilePath("src/index.ts", cwd);
		assert.strictEqual(p, path.join(cwd, "src/index.ts"));
	});

	await t.test("allows the base path itself", () => {
		assert.strictEqual(validateFilePath(".", cwd), cwd);
	});

	await t.test("defaults the base path to the working directory", () => {
		assert.strictEqual(validateFilePath("src"), path.join(cwd, "src"));
	});

	await t.test("rejects traversal out of base", () => {
		assert.throws(
			() => validateFilePath("../outside.txt", cwd),
			/Path Traversal/,
		);
		assert.throws(() => validateFilePath("/etc/passwd", cwd), /Path Traversal/);
	});

	await t.test("rejects a sibling directory sharing the base prefix", () => {
		assert.throws(
			() => validateFilePath(`${cwd}-evil/spec.json`, cwd),
			/Path Traversal/,
		);
	});
});

test("validateOptions", async (t) => {
	await t.test("accepts an empty object and a full configuration", () => {
		assert.doesNotThrow(() => validateOptions({}));
		assert.doesNotThrow(() =>
			validateOptions({
				source: { type: "url", url: "https://example.com/openapi.json" },
				header: "# Header",
				footer: "Footer",
				contentType: "text/plain",
				cache: { enabled: true, ttl: 1000, maxSize: 10 },
			}),
		);
		assert.doesNotThrow(() =>
			validateOptions({
				source: { type: "file", file: "src/fixtures/sample.json" },
			}),
		);
	});

	await t.test("rejects a non-object", () => {
		assert.throws(
			() => validateOptions(undefined as unknown as LLMsOptions),
			/expected an object/,
		);
		assert.throws(
			() => validateOptions("nope" as unknown as LLMsOptions),
			/expected an object/,
		);
	});

	await t.test("rejects bad header/footer/basePath", () => {
		assert.throws(
			() => validateOptions({ header: 1 } as unknown as LLMsOptions),
			/'header' must be a string/,
		);
		assert.throws(
			() => validateOptions({ footer: 1 } as unknown as LLMsOptions),
			/'footer' must be a string/,
		);
		assert.throws(
			() => validateOptions({ basePath: 1 } as unknown as LLMsOptions),
			/'basePath' must be a string/,
		);
	});

	await t.test("rejects an unsupported contentType", () => {
		assert.throws(
			() =>
				validateOptions({ contentType: "text/html" } as unknown as LLMsOptions),
			/'contentType' must be one of/,
		);
	});

	await t.test("rejects a malformed cache configuration", () => {
		assert.throws(
			() => validateOptions({ cache: null } as unknown as LLMsOptions),
			/'cache' must be an object/,
		);
		assert.throws(
			() => validateOptions({ cache: "yes" } as unknown as LLMsOptions),
			/'cache' must be an object/,
		);
		assert.throws(
			() => validateOptions({ cache: {} } as unknown as LLMsOptions),
			/'cache.enabled' must be a boolean/,
		);
		assert.throws(
			() => validateOptions({ cache: { enabled: true, ttl: 0 } }),
			/'cache.ttl' must be a positive number/,
		);
		assert.throws(
			() =>
				validateOptions({
					cache: { enabled: true, maxSize: "10" },
				} as unknown as LLMsOptions),
			/'cache.maxSize' must be a positive number/,
		);
		assert.throws(
			() => validateOptions({ cache: { enabled: true, ttl: Number.NaN } }),
			/'cache.ttl' must be a positive number/,
		);
	});

	await t.test("rejects a malformed source", () => {
		assert.throws(
			() => validateOptions({ source: null } as unknown as LLMsOptions),
			/'source' must be an object/,
		);
		assert.throws(
			() =>
				validateOptions({ source: { type: "ftp" } } as unknown as LLMsOptions),
			/'source.type' must be either/,
		);
		assert.throws(
			() =>
				validateOptions({
					source: { type: "file", file: "" },
				} as unknown as LLMsOptions),
			/'source.file' must be a non-empty string/,
		);
		assert.throws(
			() =>
				validateOptions({
					source: { type: "url", url: 42 },
				} as unknown as LLMsOptions),
			/'source.url' must be a non-empty string/,
		);
	});

	await t.test("propagates source validation failures", () => {
		assert.throws(
			() =>
				validateOptions({ source: { type: "file", file: "../escape.json" } }),
			/Path Traversal/,
		);
		assert.throws(
			() =>
				validateOptions({
					source: { type: "url", url: "http://localhost/spec" },
				}),
			/SSRF Protection/,
		);
	});

	await t.test("honours skipValidation for url sources", () => {
		assert.doesNotThrow(() =>
			validateOptions({
				source: {
					type: "url",
					url: "http://localhost/spec",
					skipValidation: true,
				},
			}),
		);
	});
});

test("validateFilePath works with a filesystem root as the base", () => {
	// A prefix comparison would build "//" here and reject every descendant.
	assert.strictEqual(validateFilePath("tmp/spec.json", "/"), "/tmp/spec.json");
	assert.strictEqual(validateFilePath("/tmp/spec.json", "/"), "/tmp/spec.json");
});

test("isInside", () => {
	assert.strictEqual(isInside("/base", "/base"), true);
	assert.strictEqual(isInside("/base", "/base/child.json"), true);
	assert.strictEqual(isInside("/base", "/base-evil/child.json"), false);
	assert.strictEqual(isInside("/base", "/elsewhere"), false);
	assert.strictEqual(isInside("/", "/tmp/spec.json"), true);
});

test("validateOptions rejects arrays posing as objects", () => {
	assert.throws(
		() => validateOptions([] as unknown as LLMsOptions),
		/expected an object/,
	);
	assert.throws(
		() => validateOptions({ source: [] } as unknown as LLMsOptions),
		/'source' must be an object/,
	);
});

test("validateOptions requires skipValidation to be a boolean", () => {
	// A truthy string would otherwise silently disable the SSRF guard.
	assert.throws(
		() =>
			validateOptions({
				source: {
					type: "url",
					url: "http://127.0.0.1/spec",
					skipValidation: "false",
				},
			} as unknown as LLMsOptions),
		/'source.skipValidation' must be a boolean/,
	);
});
