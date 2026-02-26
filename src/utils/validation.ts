import path from "node:path";
import { URL } from "node:url";

// Helper to check if an IP is private or loopback
function isPrivateIP(hostname: string): boolean {
	if (hostname === "localhost") return true;

	// Basic check for IPv4 private ranges
	// 127.0.0.0/8
	if (hostname.startsWith("127.")) return true;
	// 10.0.0.0/8
	if (hostname.startsWith("10.")) return true;
	// 192.168.0.0/16
	if (hostname.startsWith("192.168.")) return true;
	// 172.16.0.0 - 172.31.255.255
	if (hostname.startsWith("172.")) {
		const parts = hostname.split(".");
		if (parts.length === 4) {
			const second = Number.parseInt(parts[1], 10);
			if (second >= 16 && second <= 31) return true;
		}
	}
	// 169.254.0.0/16 (Link-local)
	if (hostname.startsWith("169.254.")) return true;

	// IPv6 loopback
	if (hostname === "::1" || hostname === "[::1]") return true;

	return false;
}

export function validateUrl(inputUrl: string): void {
	try {
		const parsed = new URL(inputUrl, "http://dummybase.com"); // Handle relative URLs if base isn't needed by check
		// However, the spec says "relative URLs resolve against the running Fastify server URL"
		// But for SSRF check, we usually care about the resolved "hostname".
		// If it's relative, we might need the base. But typically for configuration `source.url` is expected to be reachable.
		// If relative, it means "local", which implies "localhost" effectively in terms of trust?
		// Wait, the spec says: "url: absolute or relative. Relative URLs resolve against the running Fastify server URL; non-HTTP(S) or internal/blocked hosts are rejected."

		// If it is really a full URL, we parse it.
		let urlToCheck: URL;
		try {
			urlToCheck = new URL(inputUrl);
		} catch {
			// Relative URL, skip protocol/SSRF checks as it resolves to local
			return;
		}

		if (urlToCheck.protocol !== "http:" && urlToCheck.protocol !== "https:") {
			throw new Error(
				`Invalid protocol: ${urlToCheck.protocol}. Only http and https are allowed.`,
			);
		}

		if (isPrivateIP(urlToCheck.hostname)) {
			throw new Error(
				`SSRF Protection: Host ${urlToCheck.hostname} is blocked.`,
			);
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid URL: ${message}`);
	}
}

export function validateFilePath(
	inputPath: string,
	basePath: string = process.cwd(),
): string {
	const resolved = path.resolve(basePath, inputPath);
	const normalizedBase = path.resolve(basePath);

	if (!resolved.startsWith(normalizedBase)) {
		throw new Error(
			`Path Traversal detected: ${inputPath} is outside base directory ${basePath}`,
		);
	}
	return resolved;
}
