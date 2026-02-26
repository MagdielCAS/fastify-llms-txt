# Fastify LLMs TXT – Technical Project Documentation

This document explains what the project does, why it exists, and how it is put together so an experienced developer can recreate or extend it.

## Purpose
- Provide an Fastify plugin that exposes `/llms.txt` (and `/llms-full.txt` as a 301 alias) containing LLM‑friendly Markdown derived from an OpenAPI/Swagger specification.
- Automate generation of concise, structured API docs that large language models can ingest for grounding or training.

## High-Level Architecture
- **Request flow (`GET /llms.txt`)**:
  1) Validate supplied `LLMsOptions` (`validateOptions`).
  2) Resolve source: load spec from file (`parseFromFile`) or fetch URL (`parseFromUrl`, with SSRF checks unless `skipValidation` is set for same-server URLs).
  3) Convert the OpenAPI document to Markdown via `OpenAPIToMarkdownConverter`.
  4) Prepend `header`/append `footer` if provided.
  5) Optionally cache the rendered output in an in‑memory LRU cache (TTL and size configurable).
  6) Write `Content-Type` header (`text/markdown` default, `text/plain` supported) and return the body.
- **Redirect**: `/llms-full.txt` responds with a 301 redirect to `/llms.txt`.
- **Distribution**: built ESM output lives in `dist/`; types are emitted alongside for consumers.

## Feature Set
- OpenAPI 3.0 and 3.1 support (JSON or YAML; YAML parsed when `js-yaml` peer dep is present).
- Flexible sources: local file (path validated against traversal) or URL (blocked host list to prevent SSRF).
- Markdown tailored for LLMs: consistent headings, bolding, code formatting, and indented lists for hierarchies.
- Auto-generated sections: API overview, metadata, servers, auth, tags, endpoints, webhooks, and components (schemas, security schemes, response and parameter definitions).
- Caching: optional LRU with TTL and max size controls; adds `X-Cache: HIT|MISS` header when enabled.
- Configurable headers/footers and response content type.
- Safe defaults: default source `/swagger/json`, `text/markdown` output, caching off.

## Inputs and Configuration (`LLMsOptions`)
- `source` (required): `{ type: 'file' | 'url'; file?: string; url?: string }`
  - `file`: absolute or relative path; validated to stay under `basePath` (defaults to `process.cwd()` in validation helper).
  - `url`: absolute or relative. Relative URLs resolve against the running Fastify server URL; non-HTTP(S) or internal/blocked hosts are rejected.
- `header` / `footer`: arbitrary Markdown appended before/after generated content.
- `contentType`: `text/markdown` (default) or `text/plain`; suffixed with `; charset=utf-8`.
- `cache`: `{ enabled: boolean; ttl?: number; maxSize?: number }` with defaults `ttl=60000 ms`, `maxSize=100` when omitted.

## Conversion Pipeline (`OpenAPIToMarkdownConverter`)
- Defined in `/Users/magdielcampelo/Development/fastify-llms-txt/src/converter.ts` and helpers under `/Users/magdielcampelo/Development/fastify-llms-txt/src/generators`.
- Sections produced (in order):
  - Title and version, OpenAPI version line.
  - Description.
  - Contact, License, Terms of Service, External Docs.
  - Servers (including templated variables), Authentication (global security), API Groups (tags).
  - Endpoints: for each path+method, includes summary/title, HTTP verb + path, deprecation flag, description, tags, operationId, endpoint-level security, parameters (name/location/type/required/description), request body content types and schemas, response status codes and media types. Webhooks (OpenAPI 3.1) are rendered similarly.
  - Data Models (components): schemas with descriptions/properties/enums/arrays, security schemes (http/apiKey/oauth2/openIdConnect), response and parameter component references.
- Formatting utilities in `/Users/magdielcampelo/Development/fastify-llms-txt/src/generators/format.ts` standardize headings, inline code, lists, links, and schema name rendering (including `$ref` resolution).

## Validation and Safety
- URL validation (`validateUrl`): rejects non-http(s) protocols and blocks localhost, loopback, link-local, and private-network ranges to mitigate SSRF.
- File path validation (`validateFilePath`): normalizes and ensures resolved path stays within a base directory to prevent traversal.
- YAML parsing: attempted only when extension suggests YAML or content is non-JSON. If `js-yaml` is missing, an explicit error guides installation.
- Error handling: failures return HTTP 500 with a concise error message string; plugin does not throw uncaught errors in route handler.

## Caching Details
- LRU cache implemented in `/Users/magdielcampelo/Development/fastify-llms-txt/src/index.ts` using `Map` insertion order; key is derived from `source` (file path or URL).
- Cache entry stores rendered output and timestamp. Expired entries based on TTL cause regeneration. Cache size evicts least-recently-used entries when exceeding `maxSize`.

## Build, Test, and Lint
- Toolchain: TypeScript, Node (c8, tsd) runtime for tests and scripts, biome for formatting and linting.
- Key scripts (`package.json`):
  - `"test": "npm run test:unit && npm run test:typescript"`
  - `"test:typescript": "tsd"`
  - `"test:unit": "c8 --100 node --test"`
  - `"test:unit:report": "npm run test:unit -- --coverage-report=html"`
  - `"test:unit:verbose": "npm run test:unit -- -Rspec"`
  - `biome check --write src` for lint/format.
- Peer dependencies: `fastify` (>=5.0.0) and optional `js-yaml` for YAML support. Runtime engines: Node >=20, TypeScript >=5.0.

## Creating a Plugin
- Framework hook: expose a small Fastify plugin that registers HTTP routes and wraps external resources behind validation and conversion utilities.
- Converter design: separate pure Markdown generators per OpenAPI section; keep format helpers centralized for consistent output.
- Safety first: add SSRF and path traversal guards; keep YAML optional to avoid unnecessary bundle weight.
- Ergonomics: support headers/footers, content-type choice, and cache control; return helpful headers like `X-Cache` to aid debugging.
- Tests: include unit tests for validators and converter outputs plus integration tests that spin up an in-memory Fastify server to assert routes, headers, and caching behavior.

## Minimal Usage Example
```typescript
import Fastify from 'fastify';
import llms from 'fastify-llms-txt';

const fastify = Fastify()
  .register(llms, {
    source: { type: 'url', url: '/swagger/json' },
    header: '# API Docs for LLMs',
    cache: { enabled: true, ttl: 60_000 },
  })
  .listen(3000);
// GET http://localhost:3000/llms.txt returns generated Markdown
```

Use this documentation as the canonical reference for reproducing the project’s functionality or adapting it to other frameworks.
