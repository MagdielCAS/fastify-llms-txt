import {
	generateAuthentication,
	generateComponents,
	generateExternalDocs,
	generateInfo,
	generatePaths,
	generateServers,
	generateTags,
	generateWebhooks,
} from "./generators/sections.js";
import type { OpenAPISpec } from "./types.js";

/**
 * Renders an OpenAPI 3.x document as LLM-friendly Markdown.
 *
 * Sections are emitted in a fixed order so the output stays stable and
 * diffable across regenerations.
 */
export class OpenAPIToMarkdownConverter {
	readonly #spec: OpenAPISpec;

	constructor(spec: OpenAPISpec) {
		if (!spec || typeof spec !== "object") {
			throw new Error("Invalid OpenAPI spec: expected an object");
		}
		if (!spec.info || typeof spec.info.title !== "string") {
			throw new Error("Invalid OpenAPI spec: missing 'info.title'");
		}
		if (typeof spec.info.version !== "string") {
			throw new Error("Invalid OpenAPI spec: missing 'info.version'");
		}
		this.#spec = spec;
	}

	convert(): string {
		const spec = this.#spec;

		const sections = [
			generateInfo(spec.info, spec.openapi),
			generateExternalDocs(spec.externalDocs),
			generateServers(spec.servers),
			generateAuthentication(spec.security, spec.components?.securitySchemes),
			generateTags(spec.tags),
			generatePaths(spec.paths),
			generateWebhooks(spec.webhooks),
			generateComponents(spec.components),
		];

		return sections.filter((section) => section.length > 0).join("\n\n");
	}
}

export function convertOpenAPIToMarkdown(spec: OpenAPISpec): string {
	return new OpenAPIToMarkdownConverter(spec).convert();
}
