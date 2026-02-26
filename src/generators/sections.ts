import {
	MediaType,
	type OpenAPISpec,
	Operation,
	Parameter,
	type Reference,
	Response,
	type Schema,
} from "../types.js";
import {
	formatBold,
	formatCodeBlock,
	formatHeading,
	formatList,
} from "./format.js";

export function generateInfo(info: OpenAPISpec["info"]): string {
	const lines: string[] = [];
	lines.push(formatHeading(`${info.title} v${info.version}`, 1));

	if (info.description) {
		lines.push(info.description.trim());
	}

	if (info.termsOfService) {
		lines.push(`Terms of Service: <${info.termsOfService}>`);
	}

	if (info.contact) {
		const contactParts = [];
		if (info.contact.name) contactParts.push(info.contact.name);
		if (info.contact.email) contactParts.push(`<${info.contact.email}>`);
		if (info.contact.url) contactParts.push(`<${info.contact.url}>`);
		if (contactParts.length) {
			lines.push(`Contact: ${contactParts.join(" ")}`);
		}
	}

	if (info.license) {
		let license = `License: ${info.license.name}`;
		if (info.license.url) license += ` <${info.license.url}>`;
		lines.push(license);
	}

	return lines.join("\n\n");
}

export function generateServers(servers?: OpenAPISpec["servers"]): string {
	if (!servers || servers.length === 0) return "";

	const lines: string[] = [];
	lines.push(formatHeading("Servers", 2));

	const serverList = servers.map((s) => {
		let text = `\`${s.url}\``;
		if (s.description) text += ` - ${s.description}`;
		return text;
	});

	lines.push(formatList(serverList));
	return lines.join("\n\n");
}

function formatSchema(schema: Schema | Reference, indent = 0): string {
	if ("$ref" in schema) {
		return `Reference: ${schema.$ref}`;
	}

	const lines: string[] = [];
	if (schema.type) {
		const typeStr = Array.isArray(schema.type)
			? schema.type.join("|")
			: schema.type;
		lines.push(`Type: ${typeStr}`);
	}
	if (schema.format) lines.push(`Format: ${schema.format}`);
	if (schema.description) lines.push(schema.description);
	if (schema.enum) lines.push(`Enum: ${schema.enum.join(", ")}`);

	if (schema.properties) {
		lines.push("Properties:");
		for (const [propName, propSchema] of Object.entries(schema.properties)) {
			const required = schema.required?.includes(propName) ? "*" : "";
			const propLine = `- \`${propName}${required}\`: ${formatSchemaInline(propSchema)}`;
			lines.push(`  ${propLine}`);
		}
	}

	if (schema.items) {
		lines.push(`Items: ${formatSchemaInline(schema.items)}`);
	}

	return lines.join("\n");
}

function formatSchemaInline(schema: Schema | Reference): string {
	if ("$ref" in schema) return `[${schema.$ref}]`;
	const parts = [];
	if (schema.type)
		parts.push(
			Array.isArray(schema.type) ? schema.type.join("|") : schema.type,
		);
	if (schema.format) parts.push(`(${schema.format})`);
	if (schema.description) parts.push(`- ${schema.description}`);
	return parts.join(" ");
}

export function generatePaths(paths: OpenAPISpec["paths"]): string {
	const lines: string[] = [];
	lines.push(formatHeading("Endpoints", 2));

	for (const [pathStr, operations] of Object.entries(paths)) {
		for (const [method, op] of Object.entries(operations)) {
			if (
				method === "parameters" ||
				method === "summary" ||
				method === "description"
			)
				continue;

			const operation = op;

			const title =
				operation.summary ||
				operation.operationId ||
				`${method.toUpperCase()} ${pathStr}`;
			lines.push(formatHeading(`${title}`, 3));
			lines.push(`\`${method.toUpperCase()} ${pathStr}\``);

			if (operation.deprecated) lines.push(formatBold("DEPRECATED"));
			if (operation.description) lines.push(operation.description);

			if (operation.parameters && operation.parameters.length > 0) {
				lines.push(formatHeading("Parameters", 4));
				const params = operation.parameters.map((p) => {
					if ("$ref" in p) return `Ref: ${p.$ref}`;
					const required = p.required ? "*" : "";
					return `\`${p.name}${required}\` (${p.in}): ${p.description || ""} ${p.schema ? formatSchemaInline(p.schema) : ""}`;
				});
				lines.push(formatList(params));
			}

			if (operation.requestBody && !("$ref" in operation.requestBody)) {
				lines.push(formatHeading("Request Body", 4));
				if (operation.requestBody.description)
					lines.push(operation.requestBody.description);
				if (operation.requestBody.content) {
					for (const [mediaType, details] of Object.entries(
						operation.requestBody.content,
					)) {
						lines.push(formatBold(`Content-Type: ${mediaType}`));
						if (details.schema) {
							lines.push(
								formatCodeBlock(
									JSON.stringify(details.schema, null, 2),
									"json",
								),
							); // Simplified schema view
						}
					}
				}
			}

			if (operation.responses) {
				lines.push(formatHeading("Responses", 4));
				for (const [status, resp] of Object.entries(operation.responses)) {
					if ("$ref" in resp) {
						lines.push(`- ${status}: [${resp.$ref}]`);
					} else {
						lines.push(`- ${status}: ${resp.description || ""}`);
					}
				}
			}

			lines.push("---");
		}
	}

	return lines.join("\n\n");
}

export function generateComponents(
	components?: OpenAPISpec["components"],
): string {
	if (!components) return "";

	const lines: string[] = [];

	if (components.schemas) {
		lines.push(formatHeading("Schemas", 2));
		for (const [name, schema] of Object.entries(components.schemas)) {
			lines.push(formatHeading(name, 3));
			lines.push(formatSchema(schema));
		}
	}

	return lines.join("\n\n");
}
