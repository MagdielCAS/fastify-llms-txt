import {
	generateComponents,
	generateInfo,
	generatePaths,
	generateServers,
} from "./generators/sections.js";
import type { OpenAPISpec } from "./types.js";

export function convertOpenAPIToMarkdown(spec: OpenAPISpec): string {
	const sections: string[] = [];

	// Info Section
	sections.push(generateInfo(spec.info));

	// Servers
	const servers = generateServers(spec.servers);
	if (servers) sections.push(servers);

	// Paths/Endpoints
	sections.push(generatePaths(spec.paths));

	// Components (Schemas)
	const components = generateComponents(spec.components);
	if (components) sections.push(components);

	return sections.join("\n\n");
}
