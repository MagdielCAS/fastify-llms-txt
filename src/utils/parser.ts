import fs from "node:fs/promises";
import path from "node:path";
import type { OpenAPISpec } from "../types.js";
import { isInside, validateFilePath, validateUrl } from "./validation.js";

/** Redirect hops followed before giving up, matching the fetch spec's limit. */
const MAX_REDIRECTS = 20;

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

	// The lexical check above cannot see through symlinks, so re-check the
	// canonical path: a link inside basePath may still point outside it.
	const base = path.resolve(basePath ?? process.cwd());
	const [realBase, realPath] = await Promise.all([
		fs.realpath(base),
		fs.realpath(filePath),
	]);
	if (!isInside(realBase, realPath)) {
		throw new Error(
			`Path Traversal detected: ${file} resolves outside base directory ${base}`,
		);
	}

	const content = await fs.readFile(realPath, "utf-8");
	return parseSpec(content, realPath);
}

/**
 * Fetches a URL, following redirects one hop at a time.
 *
 * `fetch` follows redirects itself, but only the first URL would ever be
 * validated: a permitted host could bounce the request to an internal address.
 * Every hop is checked instead.
 */
async function fetchFollowingRedirects(
	url: string,
	skipValidation: boolean,
): Promise<Response> {
	let target = url;

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!skipValidation) {
			validateUrl(target);
		}

		const res = await fetch(target, { redirect: "manual" });
		if (res.status < 300 || res.status > 399) {
			return res;
		}

		const location = res.headers.get("location");
		if (!location) {
			return res;
		}
		target = new URL(location, target).toString();
	}

	throw new Error(`Too many redirects while fetching spec from ${url}`);
}

export async function parseFromUrl(
	url: string,
	skipValidation = false,
): Promise<OpenAPISpec> {
	const res = await fetchFollowingRedirects(url, skipValidation);
	if (!res.ok) {
		throw new Error(`Failed to fetch spec from ${url}: ${res.statusText}`);
	}
	return parseSpec(await res.text(), url);
}
