import fs from "node:fs/promises";
import path from "node:path";
import type { OpenAPISpec } from "../types.js";
import { validateFilePath, validateUrl } from "./validation.js";

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

export const MISSING_YAML_MESSAGE =
	"Received YAML (or invalid JSON) but 'js-yaml' is not installed. Run `npm install js-yaml` to enable YAML support.";

const PARSE_ERROR_MESSAGE = "Failed to parse OpenAPI spec (Invalid JSON/YAML)";

/** Loads the optional `js-yaml` dependency. Overridable so tests can simulate its absence. */
export type YamlLoader = () => Promise<{ load: (input: string) => unknown }>;

const defaultYamlLoader: YamlLoader = () => import("js-yaml");

function isModuleNotFound(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND"
	);
}

function looksLikeJson(content: string): boolean {
	const trimmed = content.trimStart();
	return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function asSpec(parsed: unknown): OpenAPISpec {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(PARSE_ERROR_MESSAGE);
	}
	return parsed as OpenAPISpec;
}

function tryJson(content: string): OpenAPISpec | undefined {
	try {
		return asSpec(JSON.parse(content));
	} catch {
		return undefined;
	}
}

/**
 * Parses an OpenAPI document from raw text.
 *
 * YAML is attempted only when the source name suggests YAML or the content is
 * not JSON, so `js-yaml` stays an optional dependency: a JSON document served
 * from a `.yaml` URL still parses without it.
 */
export async function parseSpec(
	content: string,
	sourceName = "",
	yamlLoader: YamlLoader = defaultYamlLoader,
): Promise<OpenAPISpec> {
	const extension = path.extname(sourceName.split("?")[0]).toLowerCase();
	const preferYaml = YAML_EXTENSIONS.has(extension) || !looksLikeJson(content);

	if (!preferYaml) {
		const json = tryJson(content);
		if (json) return json;
	}

	let yaml: Awaited<ReturnType<YamlLoader>> | undefined;
	let loadError: unknown;
	try {
		yaml = await yamlLoader();
	} catch (err: unknown) {
		loadError = err;
	}

	if (yaml) {
		try {
			return asSpec(yaml.load(content));
		} catch {
			// Not YAML either; fall through to the remaining attempt.
		}
	}

	if (preferYaml) {
		const json = tryJson(content);
		if (json) return json;
	}

	if (loadError !== undefined) {
		throw isModuleNotFound(loadError)
			? new Error(MISSING_YAML_MESSAGE)
			: loadError;
	}
	throw new Error(PARSE_ERROR_MESSAGE);
}

export async function parseFromFile(
	file: string,
	basePath?: string,
): Promise<OpenAPISpec> {
	const filePath = validateFilePath(file, basePath);
	const content = await fs.readFile(filePath, "utf-8");
	return parseSpec(content, filePath);
}

export async function parseFromUrl(
	url: string,
	skipValidation = false,
): Promise<OpenAPISpec> {
	if (!skipValidation) {
		validateUrl(url);
	}

	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch spec from ${url}: ${res.statusText}`);
	}
	return parseSpec(await res.text(), url);
}
