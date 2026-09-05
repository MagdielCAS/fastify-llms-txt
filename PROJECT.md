# Fastify LLMs TXT – Technical Project Documentation

This document explains what the project does, why it exists, and how it is put together so an experienced developer can recreate or extend it.

## Purpose
- Provide a Fastify plugin that exposes `/llms.txt` (and `/llms-full.txt` as a 301 alias) containing LLM-friendly Markdown derived from an OpenAPI/Swagger specification.
- Automate generation of concise, structured API docs that large language models can ingest for grounding or training.

## High-Level Architecture
- **Registration**: `validateOptions` checks the supplied `LLMsOptions` when the plugin is registered, so a misconfiguration fails at boot instead of on the first request. Both routes are registered with `schema: { hide: true }` so they stay out of the document they generate.
- **Request flow (`GET /llms.txt`)**:
  1) Resolve the cache key from the source (file path, resolved URL, or `swagger`).
  2) Return the cached body if caching is enabled and the entry is still fresh.
  3) Resolve the source: `@fastify/swagger` when no `source` is configured, `parseFromFile` for files, `parseFromUrl` for URLs.
  4) Convert the OpenAPI document to Markdown via `OpenAPIToMarkdownConverter`.
  5) Prepend `header` / append `footer` if provided.
  6) Store the rendered output in the in-memory LRU cache when caching is enabled.
  7) Write `Content-Type` (`text/markdown` default, `text/plain` supported) and return the body.
- **Redirect**: `/llms-full.txt` responds with a 301 redirect to `/llms.txt`.
- **Errors**: any failure returns HTTP 500 with a concise message; the route handler never throws.
- **Distribution**: built ESM output lives in `dist/`; declarations are emitted alongside for consumers.

## Feature Set
- OpenAPI 3.0 and 3.1 support (JSON or YAML; YAML parsed when the optional `js-yaml` peer dependency is present).
- Flexible sources: `@fastify/swagger`, a local file (validated against traversal), or a URL (validated against SSRF).
- Markdown tailored for LLMs: consistent headings, bolding, code formatting, and indented lists for hierarchies.
- Auto-generated sections: API overview, external docs, servers, authentication, tags, endpoints, webhooks, and components (schemas, security schemes, reusable responses and parameters).
- Caching: optional LRU with TTL and max-size controls; adds `X-Cache: HIT|MISS` when enabled.
- Configurable header/footer and response content type.
- Safe defaults: `@fastify/swagger` auto-detection, `text/markdown` output, caching off.

## Inputs and Configuration (`LLMsOptions`)
- `source` (optional): `{ type: 'file'; file: string }` or `{ type: 'url'; url: string; skipValidation?: boolean }`. When omitted, the plugin calls `fastify.swagger()`.
  - `file`: absolute or relative path; validated to stay under `basePath`.
  - `url`: absolute or relative. Relative URLs resolve against the server's own origin (`fastify.listeningOrigin`, falling back to the request's protocol and host) and skip the SSRF check, since they can only address this server. Absolute URLs must be `http:`/`https:` and must not target a blocked host unless `skipValidation` is set.
- `header` / `footer`: arbitrary Markdown placed before/after the generated content.
- `contentType`: `text/markdown` (default) or `text/plain`; suffixed with `; charset=utf-8`.
- `basePath`: directory a `file` source must stay within; defaults to `process.cwd()`.
- `cache`: `{ enabled: boolean; ttl?: number; maxSize?: number }` with defaults `ttl=60000 ms`, `maxSize=100`.

## Conversion Pipeline (`OpenAPIToMarkdownConverter`)
- Defined in `src/converter.ts`, with per-section generators in `src/generators/sections.ts` and formatting primitives in `src/generators/format.ts`.
- The constructor rejects documents that are not objects or that lack `info.title`; `convert()` renders the document and is safe to call repeatedly.
- Sections are emitted in this order, and empty ones are dropped:
  - Title and version, OpenAPI version line, summary, description, terms of service, contact, license.
  - External Documentation.
  - Servers, including templated variables with their defaults, allowed values, and descriptions.
  - Authentication: the top-level `security` requirements, rendered as `AND` within a requirement and `OR` between them.
  - API Groups: `tags` with descriptions and external docs.
  - Endpoints: for each path and HTTP method — summary/title, verb and path, deprecation flag, description, tags, `operationId`, endpoint-level security, external docs, parameters (path-level parameters are inherited by every operation), request body content types and schemas, and responses with status codes, media types and headers.
  - Webhooks (OpenAPI 3.1), rendered like endpoints.
  - Data Models: component schemas (types, formats, constraints, enums, composition keywords, properties expanded up to two levels), security schemes (`http`, `apiKey`, `oauth2` including flows and scopes, `openIdConnect`, `mutualTLS`), reusable responses, and reusable parameters.
- `format.ts` standardises headings, inline code, code blocks, lists, links, `$ref` resolution (including `~0`/`~1` JSON-Pointer escapes) and short schema names such as `User[]` or `string | number`.

## Validation and Safety
- URL validation (`validateUrl`): rejects non-`http(s)` protocols and blocks localhost, loopback, unspecified, link-local (including cloud metadata endpoints), unique-local, carrier-grade-NAT and private-network hosts across IPv4, IPv6 and IPv4-mapped IPv6 (both the dotted and hex spellings the URL parser produces).
- File path validation (`validateFilePath`): resolves the path and ensures it stays inside the base directory, so a sibling directory sharing the base prefix is rejected too.
- Option validation (`validateOptions`): checks types and shapes for `header`, `footer`, `basePath`, `contentType`, `cache` and `source`, and runs the path/URL guards eagerly.
- YAML parsing: attempted when the source name suggests YAML or the content is not JSON. A JSON document served from a `.yaml` URL still parses without `js-yaml`; when YAML really is needed and the module is missing, the error explains how to install it.

## Caching Details
- `LRUCache` (`src/utils/cache.ts`) is backed by `Map` insertion order: reads refresh recency without resetting the TTL, writes evict the least recently used entries beyond `maxSize`, and expired entries are dropped on read.
- The key is derived from the source: `file:<path>`, `url:<resolved absolute url>`, or `swagger`.

## Build, Test, and Lint
- Toolchain: TypeScript 7, the Node.js test runner with c8 for coverage, tsd for type tests, Biome 2 for formatting and linting.
- Key scripts (`package.json`):
  - `"build": "tsc"` — emits ESM plus declarations into `dist/`.
  - `"test": "npm run test:unit && npm run test:typescript"` (a `pretest` hook builds first).
  - `"test:unit": "c8 --100 node --test \"dist/**/*.test.js\""` — 100% statement, branch, function and line coverage is enforced.
  - `"test:typescript": "tsd"` — type-level assertions in `test-d/`.
  - `"lint" / "lint:fix": "biome check ." / "biome check --write ."`.
- Peer dependencies: `fastify` (>=5.0.0) and the optional `js-yaml` (>=4). Runtime engine: Node >=22.12.0.

## Creating a Plugin
- Framework hook: expose a small Fastify plugin that registers HTTP routes and wraps external resources behind validation and conversion utilities.
- Converter design: keep one pure Markdown generator per OpenAPI section and centralise the format helpers so the output stays consistent and diffable.
- Safety first: add SSRF and path-traversal guards, validate options at registration, and keep YAML optional to avoid unnecessary bundle weight.
- Ergonomics: support headers/footers, content-type choice and cache control, and return helpful headers like `X-Cache` to aid debugging.
- Tests: unit tests for the validators, cache, parser and converter output, plus integration tests that spin up an in-memory Fastify server to assert routes, headers and caching behaviour.

## Minimal Usage Example
```typescript
import Fastify from 'fastify';
import llms from 'fastify-llms-txt';

const fastify = Fastify();
await fastify.register(llms, {
  source: { type: 'url', url: '/documentation/json' },
  header: '# API Docs for LLMs',
  cache: { enabled: true, ttl: 60_000 },
});
await fastify.listen({ port: 3000 });
// GET http://localhost:3000/llms.txt returns generated Markdown
```

Use this documentation as the canonical reference for reproducing the project's functionality or adapting it to other frameworks.
