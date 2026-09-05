import path from "node:path";
import { URL } from "node:url";
import type { LLMsOptions } from "../types.js";

const CONTENT_TYPES = new Set(["text/markdown", "text/plain"]);

/** Strips the brackets the WHATWG URL parser keeps around IPv6 hosts. */
function normalizeHostname(hostname: string): string {
	const lower = hostname.toLowerCase();
	return lower.startsWith("[") && lower.endsWith("]")
		? lower.slice(1, -1)
		: lower;
}

function isPrivateIPv4(hostname: string): boolean {
	const parts = hostname.split(".");
	if (parts.length !== 4) return false;

	const octets = parts.map((part) => Number.parseInt(part, 10));
	if (
		octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
	) {
		return false;
	}

	const [a, b] = octets as [number, number, number, number];

	// 0.0.0.0/8 (this host), 127.0.0.0/8 (loopback), 10.0.0.0/8 (private)
	if (a === 0 || a === 127 || a === 10) return true;
	// 172.16.0.0/12
	if (a === 172 && b >= 16 && b <= 31) return true;
	// 192.168.0.0/16
	if (a === 192 && b === 168) return true;
	// 169.254.0.0/16 - link-local, includes cloud metadata endpoints
	if (a === 169 && b === 254) return true;
	// 100.64.0.0/10 - carrier-grade NAT
	if (a === 100 && b >= 64 && b <= 127) return true;

	return false;
}

/** Checks whether a hostname points at the local machine or a private network. */
export function isPrivateHost(hostname: string): boolean {
	const host = normalizeHostname(hostname);

	if (host === "localhost" || host.endsWith(".localhost")) return true;
	if (isPrivateIPv4(host)) return true;

	// IPv6 unspecified and loopback
	if (host === "::" || host === "::1") return true;
	// IPv4-mapped/compatible IPv6. The URL parser rewrites `::ffff:127.0.0.1`
	// as `::ffff:7f00:1`, so both spellings have to be recognised.
	const dotted = host.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
	if (dotted) return isPrivateIPv4(dotted[1]);
	const hextets = host.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (hextets) {
		const high = Number.parseInt(hextets[1], 16);
		const low = Number.parseInt(hextets[2], 16);
		return isPrivateIPv4(
			[high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
		);
	}
	// fe80::/10 link-local
	if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
	// fc00::/7 unique local
	if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;

	return false;
}

/**
 * Rejects URLs that could be used to reach internal services (SSRF).
 * Relative URLs are allowed: they are resolved against the running server.
 */
export function validateUrl(inputUrl: string): void {
	let parsed: URL;
	try {
		parsed = new URL(inputUrl);
	} catch {
		// Not an absolute URL - it resolves against the local server, nothing to check.
		return;
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(
			`Invalid URL: Invalid protocol: ${parsed.protocol}. Only http and https are allowed.`,
		);
	}

	if (isPrivateHost(parsed.hostname)) {
		throw new Error(
			`Invalid URL: SSRF Protection: Host ${parsed.hostname} is blocked.`,
		);
	}
}

/** Resolves `inputPath` and guarantees it stays inside `basePath`. */
export function validateFilePath(
	inputPath: string,
	basePath: string = process.cwd(),
): string {
	const normalizedBase = path.resolve(basePath);
	const resolved = path.resolve(normalizedBase, inputPath);

	if (
		resolved !== normalizedBase &&
		!resolved.startsWith(normalizedBase + path.sep)
	) {
		throw new Error(
			`Path Traversal detected: ${inputPath} is outside base directory ${basePath}`,
		);
	}
	return resolved;
}

function assertString(value: unknown, name: string): void {
	if (value !== undefined && typeof value !== "string") {
		throw new Error(`Invalid options: '${name}' must be a string.`);
	}
}

function assertPositiveNumber(value: unknown, name: string): void {
	if (value === undefined) return;
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`Invalid options: '${name}' must be a positive number.`);
	}
}

/** Validates the plugin options at registration time so misconfiguration fails fast. */
export function validateOptions(options: LLMsOptions): void {
	if (!options || typeof options !== "object") {
		throw new Error("Invalid options: expected an object.");
	}

	assertString(options.header, "header");
	assertString(options.footer, "footer");
	assertString(options.basePath, "basePath");

	if (
		options.contentType !== undefined &&
		!CONTENT_TYPES.has(options.contentType)
	) {
		throw new Error(
			`Invalid options: 'contentType' must be one of ${[...CONTENT_TYPES].join(", ")}.`,
		);
	}

	if (options.cache !== undefined) {
		if (typeof options.cache !== "object" || options.cache === null) {
			throw new Error("Invalid options: 'cache' must be an object.");
		}
		if (typeof options.cache.enabled !== "boolean") {
			throw new Error("Invalid options: 'cache.enabled' must be a boolean.");
		}
		assertPositiveNumber(options.cache.ttl, "cache.ttl");
		assertPositiveNumber(options.cache.maxSize, "cache.maxSize");
	}

	const { source } = options;
	if (source === undefined) return;

	if (typeof source !== "object" || source === null) {
		throw new Error("Invalid options: 'source' must be an object.");
	}

	if (source.type === "file") {
		if (typeof source.file !== "string" || source.file.length === 0) {
			throw new Error(
				"Invalid options: 'source.file' must be a non-empty string.",
			);
		}
		validateFilePath(source.file, options.basePath);
		return;
	}

	if (source.type === "url") {
		if (typeof source.url !== "string" || source.url.length === 0) {
			throw new Error(
				"Invalid options: 'source.url' must be a non-empty string.",
			);
		}
		if (!source.skipValidation) {
			validateUrl(source.url);
		}
		return;
	}

	throw new Error(
		"Invalid options: 'source.type' must be either 'file' or 'url'.",
	);
}
