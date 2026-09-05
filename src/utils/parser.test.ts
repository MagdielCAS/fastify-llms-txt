import assert from "node:assert";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import {
	MISSING_YAML_MESSAGE,
	parseFromFile,
	parseFromUrl,
	parseSpec,
} from "./parser.js";

const fixtures = path.join(process.cwd(), "src", "fixtures");

const moduleNotFoundLoader = () => {
	const err = new Error("Cannot find package 'js-yaml'") as Error & {
		code: string;
	};
	err.code = "ERR_MODULE_NOT_FOUND";
	return Promise.reject(err);
};

const brokenLoader = () => Promise.reject(new Error("boom"));

test("parseSpec parses JSON", async () => {
	const spec = await parseSpec(
		'{"openapi":"3.0.0","info":{"title":"A","version":"1"}}',
	);
	assert.strictEqual(spec.info.title, "A");
});

test("parseSpec parses JSON arrays as invalid specs", async () => {
	await assert.rejects(() => parseSpec("[1, 2, 3]"), /Invalid JSON\/YAML/);
});

test("parseSpec parses YAML when the content is not JSON", async () => {
	const spec = await parseSpec(
		"openapi: 3.1.0\ninfo:\n  title: B\n  version: '1'\n",
	);
	assert.strictEqual(spec.info.title, "B");
});

test("parseSpec prefers YAML when the source name has a YAML extension", async () => {
	const spec = await parseSpec(
		"info:\n  title: C\n  version: '1'\n",
		"spec.yml?v=2",
	);
	assert.strictEqual(spec.info.title, "C");
});

test("parseSpec falls back to JSON when YAML parsing fails", async () => {
	const spec = await parseSpec(
		'{"openapi":"3.0.0","info":{"title":"D","version":"1"}}',
		"spec.yaml",
		brokenLoader,
	);
	assert.strictEqual(spec.info.title, "D");
});

test("parseSpec rejects content that is neither JSON nor YAML", async () => {
	await assert.rejects(
		() => parseSpec("@nope", "spec.yaml"),
		/Invalid JSON\/YAML/,
	);
	await assert.rejects(() => parseSpec("{ unclosed"), /Invalid JSON\/YAML/);
	// Valid YAML that is not an OpenAPI document.
	await assert.rejects(() => parseSpec("just a string"), /Invalid JSON\/YAML/);
});

test("parseSpec reports a missing js-yaml dependency", async () => {
	await assert.rejects(
		() => parseSpec("info:\n  title: E\n", "spec.yaml", moduleNotFoundLoader),
		new RegExp(MISSING_YAML_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
	);
	// The JSON-first path surfaces the same guidance.
	await assert.rejects(
		() => parseSpec("not json", "spec.json", moduleNotFoundLoader),
		/js-yaml/,
	);
});

test("parseSpec rethrows unexpected loader errors when JSON is unusable", async () => {
	await assert.rejects(
		() => parseSpec("not json at all", "spec.json", brokenLoader),
		/boom/,
	);
	await assert.rejects(
		() => parseSpec("{ unclosed", "spec.json", brokenLoader),
		/boom/,
	);
});

test("parseFromFile reads JSON and YAML fixtures", async () => {
	const json = await parseFromFile(path.join(fixtures, "sample.json"));
	assert.strictEqual(json.info.title, "Sample API");

	const yaml = await parseFromFile("src/fixtures/sample.yaml");
	assert.strictEqual(yaml.info.title, "YAML API");
});

test("parseFromFile rejects paths outside the base directory", async () => {
	await assert.rejects(() => parseFromFile("../escape.json"), /Path Traversal/);
	await assert.rejects(
		() =>
			parseFromFile(
				"fixtures/sample.json",
				path.join(process.cwd(), "src", "utils"),
			),
		/ENOENT/,
	);
});

test("parseFromUrl fetches and parses a spec", async (t) => {
	t.mock.method(globalThis, "fetch", async () => ({
		ok: true,
		text: async () =>
			'{"openapi":"3.0.0","info":{"title":"Remote","version":"1"}}',
	}));

	const spec = await parseFromUrl("https://example.com/openapi.json");
	assert.strictEqual(spec.info.title, "Remote");
});

test("parseFromUrl surfaces HTTP failures", async (t) => {
	t.mock.method(globalThis, "fetch", async () => ({
		ok: false,
		statusText: "Not Found",
	}));

	await assert.rejects(
		() => parseFromUrl("https://example.com/missing"),
		/Failed to fetch spec from https:\/\/example.com\/missing: Not Found/,
	);
});

test("parseFromUrl validates the URL unless told to skip", async (t) => {
	const fetchMock = t.mock.method(globalThis, "fetch", async () => ({
		ok: true,
		text: async () =>
			'{"openapi":"3.0.0","info":{"title":"Local","version":"1"}}',
	}));

	await assert.rejects(
		() => parseFromUrl("http://127.0.0.1/openapi.json"),
		/SSRF Protection/,
	);
	assert.strictEqual(fetchMock.mock.callCount(), 0);

	const spec = await parseFromUrl("http://127.0.0.1/openapi.json", true);
	assert.strictEqual(spec.info.title, "Local");
});
