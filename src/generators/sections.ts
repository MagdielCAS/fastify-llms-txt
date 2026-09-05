import {
	type Components,
	type ExternalDocs,
	type Header,
	HTTP_METHODS,
	type Info,
	type MediaType,
	type Operation,
	type Parameter,
	type PathItem,
	type Reference,
	type RequestBody,
	type Response,
	type Schema,
	type SecurityRequirement,
	type SecurityScheme,
	type Server,
	type Tag,
} from "../types.js";
import {
	formatBold,
	formatHeading,
	formatInlineCode,
	formatLink,
	formatList,
	formatSchemaName,
	isReference,
} from "./format.js";

const INDENT = "  ";

function indentLines(text: string, level: number): string {
	const prefix = INDENT.repeat(level);
	return text
		.split("\n")
		.map((line) => prefix + line)
		.join("\n");
}

export function generateInfo(info: Info, openapi?: string): string {
	const lines: string[] = [];
	lines.push(formatHeading(`${info.title} v${info.version}`, 1));

	if (openapi) {
		lines.push(`OpenAPI: ${openapi}`);
	}

	if (info.summary) {
		lines.push(info.summary.trim());
	}

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

export function generateExternalDocs(externalDocs?: ExternalDocs): string {
	if (!externalDocs) return "";
	return [
		formatHeading("External Documentation", 2),
		formatLink(externalDocs.description || externalDocs.url, externalDocs.url),
	].join("\n\n");
}

export function generateServers(servers?: Server[]): string {
	if (!servers || servers.length === 0) return "";

	const lines: string[] = [];
	lines.push(formatHeading("Servers", 2));

	const serverList = servers.map((s) => {
		let text = formatInlineCode(s.url);
		if (s.description) text += ` - ${s.description}`;
		if (s.variables) {
			const variables = Object.entries(s.variables).map(([name, variable]) => {
				const parts = [
					`${formatInlineCode(name)}: default ${formatInlineCode(variable.default)}`,
				];
				if (variable.enum && variable.enum.length > 0) {
					parts.push(
						`one of ${variable.enum.map(formatInlineCode).join(", ")}`,
					);
				}
				if (variable.description) parts.push(variable.description);
				return parts.join(" - ");
			});
			text += `\n${formatList(variables, 1)}`;
		}
		return text;
	});

	lines.push(formatList(serverList));
	return lines.join("\n\n");
}

function formatSecurityRequirements(security: SecurityRequirement[]): string[] {
	if (security.length === 0) return [];
	return security.map((requirement) => {
		const entries = Object.entries(requirement);
		if (entries.length === 0) return "(none - authentication optional)";
		return entries
			.map(([scheme, scopes]) => {
				const name = formatInlineCode(scheme);
				return scopes.length > 0
					? `${name} (scopes: ${scopes.join(", ")})`
					: name;
			})
			.join(" AND ");
	});
}

export function generateAuthentication(
	security?: SecurityRequirement[],
	securitySchemes?: Components["securitySchemes"],
): string {
	if (!security || security.length === 0) return "";

	const lines: string[] = [formatHeading("Authentication", 2)];
	lines.push(
		security.length > 1
			? "One of the following applies to every endpoint unless overridden:"
			: "Applies to every endpoint unless overridden:",
	);
	lines.push(formatList(formatSecurityRequirements(security)));

	if (securitySchemes && Object.keys(securitySchemes).length > 0) {
		lines.push(
			"Scheme details are listed under Data Models > Security Schemes.",
		);
	}

	return lines.join("\n\n");
}

export function generateTags(tags?: Tag[]): string {
	if (!tags || tags.length === 0) return "";

	const lines: string[] = [formatHeading("API Groups", 2)];
	lines.push(
		formatList(
			tags.map((tag) => {
				let text = formatBold(tag.name);
				if (tag.description) text += ` - ${tag.description}`;
				if (tag.externalDocs) {
					text += ` (${formatLink(
						tag.externalDocs.description || "docs",
						tag.externalDocs.url,
					)})`;
				}
				return text;
			}),
		),
	);
	return lines.join("\n\n");
}

function formatConstraints(schema: Schema): string[] {
	const constraints: string[] = [];
	if (schema.pattern)
		constraints.push(`pattern: ${formatInlineCode(schema.pattern)}`);
	if (schema.minimum !== undefined)
		constraints.push(`minimum: ${schema.minimum}`);
	if (schema.maximum !== undefined)
		constraints.push(`maximum: ${schema.maximum}`);
	if (schema.minLength !== undefined)
		constraints.push(`minLength: ${schema.minLength}`);
	if (schema.maxLength !== undefined)
		constraints.push(`maxLength: ${schema.maxLength}`);
	if (schema.minItems !== undefined)
		constraints.push(`minItems: ${schema.minItems}`);
	if (schema.maxItems !== undefined)
		constraints.push(`maxItems: ${schema.maxItems}`);
	return constraints;
}

export function formatSchemaInline(schema?: Schema | Reference): string {
	if (!schema) return "";
	if (isReference(schema)) return `[${schema.$ref}]`;

	const parts: string[] = [];
	if (schema.type) {
		parts.push(
			Array.isArray(schema.type) ? schema.type.join("|") : schema.type,
		);
	}
	if (schema.format) parts.push(`(${schema.format})`);
	if (
		!schema.type &&
		(schema.oneOf || schema.anyOf || schema.allOf || schema.enum)
	) {
		parts.push(formatSchemaName(schema));
	}
	if (schema.items) parts.push(`of ${formatSchemaName(schema.items)}`);
	if (schema.description) parts.push(`- ${schema.description}`);
	return parts.join(" ");
}

/**
 * Renders a schema as an indented block. `depth` guards against schemas that
 * reference themselves through inline (non-`$ref`) definitions.
 */
export function formatSchema(schema: Schema | Reference, depth = 0): string {
	if (isReference(schema)) {
		return `Reference: ${schema.$ref}`;
	}

	const lines: string[] = [];
	if (schema.title) lines.push(formatBold(schema.title));
	if (schema.type) {
		const typeStr = Array.isArray(schema.type)
			? schema.type.join("|")
			: schema.type;
		lines.push(`Type: ${typeStr}`);
	}
	if (schema.format) lines.push(`Format: ${schema.format}`);
	if (schema.description) lines.push(schema.description);
	if (schema.deprecated) lines.push(formatBold("DEPRECATED"));
	if (schema.nullable) lines.push("Nullable: true");
	if (schema.readOnly) lines.push("Read-only: true");
	if (schema.writeOnly) lines.push("Write-only: true");
	if (schema.enum) lines.push(`Enum: ${schema.enum.join(", ")}`);
	if (schema.const !== undefined)
		lines.push(`Const: ${JSON.stringify(schema.const)}`);
	if (schema.default !== undefined)
		lines.push(`Default: ${JSON.stringify(schema.default)}`);
	if (schema.example !== undefined)
		lines.push(`Example: ${JSON.stringify(schema.example)}`);

	const constraints = formatConstraints(schema);
	if (constraints.length > 0)
		lines.push(`Constraints: ${constraints.join(", ")}`);

	for (const keyword of ["oneOf", "anyOf", "allOf"] as const) {
		const variants = schema[keyword];
		if (variants && variants.length > 0) {
			lines.push(
				`${keyword}: ${variants.map((v) => formatSchemaName(v)).join(", ")}`,
			);
		}
	}

	if (schema.not) lines.push(`not: ${formatSchemaName(schema.not)}`);

	if (schema.properties) {
		lines.push("Properties:");
		for (const [propName, propSchema] of Object.entries(schema.properties)) {
			const required = schema.required?.includes(propName) ? "*" : "";
			lines.push(
				`${INDENT}- \`${propName}${required}\`: ${formatSchemaInline(propSchema)}`,
			);

			// Expand inline object/array properties one level at a time.
			if (!isReference(propSchema) && depth < 2 && propSchema.properties) {
				lines.push(indentLines(formatSchema(propSchema, depth + 1), 2));
			}
		}
	}

	if (schema.additionalProperties !== undefined) {
		lines.push(
			typeof schema.additionalProperties === "boolean"
				? `Additional properties: ${schema.additionalProperties}`
				: `Additional properties: ${formatSchemaName(schema.additionalProperties)}`,
		);
	}

	if (schema.items) {
		lines.push(`Items: ${formatSchemaInline(schema.items)}`);
	}

	return lines.join("\n");
}

function formatParameters(parameters: Array<Parameter | Reference>): string {
	return formatList(
		parameters.map((p) => {
			if (isReference(p)) return `Ref: ${p.$ref}`;
			const required = p.required ? "*" : "";
			const details = [
				`\`${p.name}${required}\` (${p.in}):`,
				p.description,
				p.schema && formatSchemaInline(p.schema),
			].filter((part): part is string => Boolean(part));
			if (p.deprecated) details.push(formatBold("DEPRECATED"));
			return details.join(" ");
		}),
	);
}

function formatMediaTypes(
	content: Record<string, MediaType>,
	indentLevel: number,
): string[] {
	return Object.entries(content).map(([mediaType, details]) => {
		const parts = [formatInlineCode(mediaType)];
		if (details.schema) parts.push(`→ ${formatSchemaName(details.schema)}`);
		return indentLines(`- ${parts.join(" ")}`, indentLevel);
	});
}

function formatHeaders(
	headers: Record<string, Header | Reference>,
	indentLevel: number,
): string[] {
	return Object.entries(headers).map(([name, header]) => {
		if (isReference(header)) {
			return indentLines(
				`- ${formatInlineCode(name)}: [${header.$ref}]`,
				indentLevel,
			);
		}
		const parts = [formatInlineCode(name)];
		if (header.schema) parts.push(formatSchemaName(header.schema));
		if (header.description) parts.push(`- ${header.description}`);
		return indentLines(`- ${parts.join(" ")}`, indentLevel);
	});
}

function generateRequestBody(requestBody: RequestBody | Reference): string[] {
	const lines: string[] = [formatHeading("Request Body", 4)];

	if (isReference(requestBody)) {
		lines.push(`Reference: ${requestBody.$ref}`);
		return lines;
	}

	if (requestBody.description) lines.push(requestBody.description);
	lines.push(`Required: ${requestBody.required ? "yes" : "no"}`);

	for (const [mediaType, details] of Object.entries(
		requestBody.content ?? {},
	)) {
		lines.push(formatBold(`Content-Type: ${mediaType}`));
		if (details.schema) {
			lines.push(formatSchema(details.schema));
		}
	}

	return lines;
}

function generateResponses(
	responses: Record<string, Response | Reference>,
): string[] {
	const lines: string[] = [formatHeading("Responses", 4)];
	const entries: string[] = [];

	for (const [status, resp] of Object.entries(responses)) {
		if (isReference(resp)) {
			entries.push(`- ${status}: [${resp.$ref}]`);
			continue;
		}
		entries.push(`- ${status}: ${resp.description || ""}`);
		if (resp.content) entries.push(...formatMediaTypes(resp.content, 1));
		if (resp.headers) {
			entries.push(indentLines("- Headers:", 1));
			entries.push(...formatHeaders(resp.headers, 2));
		}
	}

	lines.push(entries.join("\n"));
	return lines;
}

function generateOperation(
	method: string,
	pathStr: string,
	operation: Operation,
	inheritedParameters: Array<Parameter | Reference> = [],
): string[] {
	const lines: string[] = [];

	const title =
		operation.summary ||
		operation.operationId ||
		`${method.toUpperCase()} ${pathStr}`;
	lines.push(formatHeading(title, 3));
	lines.push(formatInlineCode(`${method.toUpperCase()} ${pathStr}`));

	if (operation.deprecated) lines.push(formatBold("DEPRECATED"));
	if (operation.description) lines.push(operation.description);

	if (operation.tags && operation.tags.length > 0) {
		lines.push(`Tags: ${operation.tags.map(formatInlineCode).join(", ")}`);
	}

	if (operation.operationId) {
		lines.push(`Operation ID: ${formatInlineCode(operation.operationId)}`);
	}

	if (operation.security) {
		const requirements = formatSecurityRequirements(operation.security);
		lines.push(
			requirements.length === 0
				? "Security: none (public endpoint)"
				: `Security: ${requirements.join(" OR ")}`,
		);
	}

	if (operation.externalDocs) {
		lines.push(
			`Docs: ${formatLink(
				operation.externalDocs.description || operation.externalDocs.url,
				operation.externalDocs.url,
			)}`,
		);
	}

	const parameters = [...inheritedParameters, ...(operation.parameters ?? [])];
	if (parameters.length > 0) {
		lines.push(formatHeading("Parameters", 4));
		lines.push(formatParameters(parameters));
	}

	if (operation.requestBody) {
		lines.push(...generateRequestBody(operation.requestBody));
	}

	if (operation.responses && Object.keys(operation.responses).length > 0) {
		lines.push(...generateResponses(operation.responses));
	}

	lines.push("---");
	return lines;
}

function generatePathItems(
	heading: string,
	items: Record<string, PathItem | Reference>,
	label: (key: string, method: string) => string,
): string {
	const lines: string[] = [];

	for (const [key, pathItem] of Object.entries(items)) {
		if (isReference(pathItem)) continue;

		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];
			if (!operation) continue;
			lines.push(
				...generateOperation(
					method,
					label(key, method),
					operation,
					pathItem.parameters,
				),
			);
		}
	}

	if (lines.length === 0) return "";
	return [formatHeading(heading, 2), ...lines].join("\n\n");
}

export function generatePaths(paths?: Record<string, PathItem>): string {
	if (!paths || Object.keys(paths).length === 0) return "";
	return generatePathItems("Endpoints", paths, (pathStr) => pathStr);
}

export function generateWebhooks(
	webhooks?: Record<string, PathItem | Reference>,
): string {
	if (!webhooks || Object.keys(webhooks).length === 0) return "";
	return generatePathItems(
		"Webhooks",
		webhooks,
		(name) => `(webhook: ${name})`,
	);
}

function generateSecurityScheme(scheme: SecurityScheme | Reference): string {
	if (isReference(scheme)) return `Reference: ${scheme.$ref}`;

	const lines: string[] = [`Type: ${scheme.type}`];
	if (scheme.description) lines.push(scheme.description);

	switch (scheme.type) {
		case "apiKey":
			if (scheme.name)
				lines.push(`Parameter: ${formatInlineCode(scheme.name)}`);
			if (scheme.in) lines.push(`Location: ${scheme.in}`);
			break;
		case "http":
			if (scheme.scheme) lines.push(`Scheme: ${scheme.scheme}`);
			if (scheme.bearerFormat)
				lines.push(`Bearer format: ${scheme.bearerFormat}`);
			break;
		case "oauth2":
			for (const [flowName, flow] of Object.entries(scheme.flows ?? {})) {
				lines.push(formatBold(`Flow: ${flowName}`));
				if (flow.authorizationUrl)
					lines.push(`Authorization URL: <${flow.authorizationUrl}>`);
				if (flow.tokenUrl) lines.push(`Token URL: <${flow.tokenUrl}>`);
				if (flow.refreshUrl) lines.push(`Refresh URL: <${flow.refreshUrl}>`);
				if (flow.scopes && Object.keys(flow.scopes).length > 0) {
					lines.push("Scopes:");
					lines.push(
						formatList(
							Object.entries(flow.scopes).map(
								([scope, description]) =>
									`${formatInlineCode(scope)}: ${description}`,
							),
							1,
						),
					);
				}
			}
			break;
		case "openIdConnect":
			if (scheme.openIdConnectUrl) {
				lines.push(`OpenID Connect URL: <${scheme.openIdConnectUrl}>`);
			}
			break;
		default:
			break;
	}

	return lines.join("\n");
}

function generateResponseComponent(response: Response | Reference): string {
	if (isReference(response)) return `Reference: ${response.$ref}`;

	const lines: string[] = [];
	if (response.description) lines.push(response.description);
	if (response.content) {
		lines.push("Content:");
		lines.push(formatMediaTypes(response.content, 1).join("\n"));
	}
	if (response.headers) {
		lines.push("Headers:");
		lines.push(formatHeaders(response.headers, 1).join("\n"));
	}
	return lines.join("\n");
}

export function generateComponents(components?: Components): string {
	if (!components) return "";

	const lines: string[] = [];

	if (components.schemas && Object.keys(components.schemas).length > 0) {
		lines.push(formatHeading("Schemas", 3));
		for (const [name, schema] of Object.entries(components.schemas)) {
			lines.push(formatHeading(name, 4));
			lines.push(formatSchema(schema));
		}
	}

	if (
		components.securitySchemes &&
		Object.keys(components.securitySchemes).length > 0
	) {
		lines.push(formatHeading("Security Schemes", 3));
		for (const [name, scheme] of Object.entries(components.securitySchemes)) {
			lines.push(formatHeading(name, 4));
			lines.push(generateSecurityScheme(scheme));
		}
	}

	if (components.responses && Object.keys(components.responses).length > 0) {
		lines.push(formatHeading("Reusable Responses", 3));
		for (const [name, response] of Object.entries(components.responses)) {
			lines.push(formatHeading(name, 4));
			lines.push(generateResponseComponent(response));
		}
	}

	if (components.parameters && Object.keys(components.parameters).length > 0) {
		lines.push(formatHeading("Reusable Parameters", 3));
		lines.push(formatParameters(Object.values(components.parameters)));
	}

	if (lines.length === 0) return "";

	return [formatHeading("Data Models", 2), ...lines].join("\n\n");
}
