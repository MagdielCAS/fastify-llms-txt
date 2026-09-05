# fastify-llms-txt

[![NPM version](https://img.shields.io/npm/v/fastify-llms-txt.svg?style=flat)](https://www.npmjs.com/package/fastify-llms-txt)
[![Known Vulnerabilities](https://snyk.io/test/github/MagdielCAS/fastify-llms-txt/badge.svg)](https://snyk.io/test/github/MagdielCAS/fastify-llms-txt)

Fastify plugin that serves `/llms.txt` (with `/llms-full.txt` as a 301 alias) containing LLM-friendly Markdown derived from an OpenAPI/Swagger specification. It helps Large Language Models understand your API structure and documentation.

## Install

```bash
npm install fastify-llms-txt
```

Requires Fastify 5 and Node.js 22.12 or newer. Install [`js-yaml`](https://www.npmjs.com/package/js-yaml) as well if your specification is YAML — it is an optional peer dependency.

## Usage

Register the plugin on your Fastify instance. With no `source`, it reads the specification straight from `@fastify/swagger`:

```js
import fastify from 'fastify'
import fastifySwagger from '@fastify/swagger'
import fastifyLlmsTxt from 'fastify-llms-txt'

const app = fastify()

await app.register(fastifySwagger, {
  openapi: {
    info: { title: 'My API', version: '1.0.0' }
  }
})

await app.register(fastifyLlmsTxt)

app.listen({ port: 3000 })
```

You can also load the specification from a file or a URL:

```js
// From a file (JSON or YAML), resolved inside `basePath` (default: process.cwd())
await app.register(fastifyLlmsTxt, {
  source: { type: 'file', file: './openapi.yaml' }
})

// From an absolute URL
await app.register(fastifyLlmsTxt, {
  source: { type: 'url', url: 'https://api.example.com/openapi.json' }
})

// From a route on this same server (resolved against the server's own origin)
await app.register(fastifyLlmsTxt, {
  source: { type: 'url', url: '/documentation/json' },
  cache: { enabled: true, ttl: 60_000 }
})
```

The plugin's own routes are hidden from `@fastify/swagger`, so they never show up in the document they generate.

## Generated document

Sections are emitted in a fixed order, and empty ones are skipped:

| Section | Source |
| :--- | :--- |
| Title, version, OpenAPI version, description, terms, contact, license | `info`, `openapi` |
| `## External Documentation` | `externalDocs` |
| `## Servers` | `servers`, including templated variables |
| `## Authentication` | top-level `security` |
| `## API Groups` | `tags` |
| `## Endpoints` | `paths` — verb, path, deprecation, tags, `operationId`, per-operation security, parameters (path-level ones inherited), request bodies, responses with media types and headers |
| `## Webhooks` | `webhooks` (OpenAPI 3.1) |
| `## Data Models` | `components` — schemas, security schemes, reusable responses and parameters |

## API

### Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `source` | `object` | `undefined` | Source of the OpenAPI spec. If undefined, uses `@fastify/swagger`. |
| `header` | `string` | `undefined` | Markdown prepended to the generated document. |
| `footer` | `string` | `undefined` | Markdown appended to the generated document. |
| `contentType` | `'text/markdown' \| 'text/plain'` | `'text/markdown'` | Response content type; `; charset=utf-8` is appended. |
| `basePath` | `string` | `process.cwd()` | Directory a `file` source must stay within. |
| `cache` | `object` | `undefined` | Caching configuration. |

Options are validated when the plugin is registered, so a misconfiguration fails at boot rather than on the first request.

### Source object

| Option | Type | Description |
| :--- | :--- | :--- |
| `type` | `'file' \| 'url'` | The type of source. |
| `file` | `string` | Path to the OpenAPI file (when `type` is `'file'`). Absolute or relative to `basePath`; paths escaping it are rejected. |
| `url` | `string` | URL of the OpenAPI spec (when `type` is `'url'`). Relative URLs resolve against this server's own origin. |
| `skipValidation` | `boolean` | Skip the SSRF check on absolute URLs. Default `false`. |

Absolute URLs are checked before they are fetched: only `http:` and `https:` are allowed, and loopback, link-local, unique-local, carrier-grade-NAT and private-network hosts are blocked (IPv4, IPv6 and IPv4-mapped IPv6 alike). Set `skipValidation: true` when you deliberately point at an internal service. Relative URLs skip the check, since they can only ever address this server.

### Cache object

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | `boolean` | — | Enable caching. Required when `cache` is given. |
| `ttl` | `number` | `60000` | Time to live, in milliseconds. |
| `maxSize` | `number` | `100` | Maximum number of entries. |

When caching is on, responses carry an `X-Cache: HIT | MISS` header.

### Exports

Besides the default plugin export, the conversion layer is available on its own:

```js
import { convertOpenAPIToMarkdown, OpenAPIToMarkdownConverter } from 'fastify-llms-txt'

const markdown = convertOpenAPIToMarkdown(spec)
// or
const markdown = new OpenAPIToMarkdownConverter(spec).convert()
```

TypeScript types (`LLMsOptions`, `LLMsSource`, `OpenAPISpec`, `Schema`, …) are exported too.

## License

Licensed under [MIT](./LICENSE).
