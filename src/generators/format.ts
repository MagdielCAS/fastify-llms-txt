import type { Reference, Schema } from "../types.js";

export function formatHeading(text: string, level = 1): string {
	return `${"#".repeat(level)} ${text}`;
}

export function formatCodeBlock(code: string, language = ""): string {
	return `\`\`\`${language}\n${code}\n\`\`\``;
}

export function formatInlineCode(text: string): string {
	return `\`${text}\``;
}

export function formatList(items: string[], indentLevel = 0): string {
	const indent = "  ".repeat(indentLevel);
	return items.map((item) => `${indent}- ${item}`).join("\n");
}

export function formatBold(text: string): string {
	return `**${text}**`;
}

export function formatLink(text: string, url: string): string {
	return `[${text}](${url})`;
}

export function isReference(value: unknown): value is Reference {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as Reference).$ref === "string"
	);
}

/**
 * Resolves the local name of a `$ref` pointer.
 * `#/components/schemas/User` becomes `User`.
 */
export function schemaNameFromRef(ref: string): string {
	const name = ref.split("/").pop();
	return name
		? decodeURIComponent(name.replace(/~1/g, "/").replace(/~0/g, "~"))
		: ref;
}

/**
 * Renders a schema as a short, single-line type name suitable for inline use.
 */
export function formatSchemaName(schema?: Schema | Reference): string {
	if (!schema) return "any";
	if (isReference(schema)) return schemaNameFromRef(schema.$ref);

	const composed = schema.oneOf ?? schema.anyOf ?? schema.allOf;
	if (composed && composed.length > 0) {
		const separator = schema.allOf ? " & " : " | ";
		return composed.map((s) => formatSchemaName(s)).join(separator);
	}

	if (schema.enum && schema.enum.length > 0) {
		return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
	}

	const types = Array.isArray(schema.type)
		? schema.type
		: schema.type
			? [schema.type]
			: [];
	if (types.includes("array")) {
		const rest = types.filter((t) => t !== "array");
		const items = `${formatSchemaName(schema.items)}[]`;
		return rest.length > 0 ? [...rest, items].join("|") : items;
	}
	if (types.length === 0) return "any";

	const base = types.join("|");
	return schema.format ? `${base} (${schema.format})` : base;
}
