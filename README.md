# fastify-llms-txt

[![NPM version](https://img.shields.io/npm/v/fastify-llms-txt.svg?style=flat)](https://www.npmjs.com/package/fastify-llms-txt)
[![Known Vulnerabilities](https://snyk.io/test/github/magdielcampelo/fastify-llms-txt/badge.svg)](https://snyk.io/test/github/magdielcampelo/fastify-llms-txt)

Fastify plugin that generates `llms.txt` (and a 301 alias `/llms-full.txt`) containing LLM-friendly Markdown derived from an OpenAPI/Swagger specification. It helps Large Language Models understand your API structure and documentation.

## Install

```bash
npm install fastify-llms-txt
```

## Usage

Register the plugin in your Fastify instance. If you are using `@fastify/swagger`, this plugin validates and converts the existing OpenAPI configuration.

```js
import fastify from 'fastify'
import fastifyLlmsTxt from 'fastify-llms-txt'

const app = fastify()

// Example with existing @fastify/swagger
await app.register(require('@fastify/swagger'), {
  openapi: {
    info: {
      title: 'My API',
      version: '1.0.0'
    }
  }
})

await app.register(fastifyLlmsTxt)

app.listen({ port: 3000 })
```

You can also load the OpenAPI specification from a file or a URL:

```js
// Load from file
await app.register(fastifyLlmsTxt, {
  source: {
    type: 'file',
    file: './openapi.json'
  }
})

// Load from URL
await app.register(fastifyLlmsTxt, {
  source: {
    type: 'url',
    url: 'https://api.example.com/openapi.json'
  }
})
```

## API

### Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `source` | `object` | `undefined` | Source of the OpenAPI spec. If undefined, attempts to use `@fastify/swagger`. |
| `header` | `string` | `undefined` | Custom text to prepend to the generated Markdown. |
| `footer` | `string` | `undefined` | Custom text to append to the generated Markdown. |
| `contentType` | `string` | `'text/markdown'` | Content-Type header for the response. |
| `cache` | `object` | `undefined` | Caching configuration. |

### Source Object

| Option | Type | Description |
| :--- | :--- | :--- |
| `type` | `'file' \| 'url'` | The type of source. |
| `file` | `string` | Path to the OpenAPI file (if type is 'file'). |
| `url` | `string` | URL to the OpenAPI spec (if type is 'url'). |
| `skipValidation` | `boolean` | Skip URL validation (e.g., SSRF checks). Default `false`. |

### Cache Object

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | `boolean` | `false` | Enable/Disable caching. |
| `ttl` | `number` | `60000` | Time to live in milliseconds. |
| `maxSize` | `number` | `100` | Maximum number of items in cache. |

## License

Licensed under [MIT](./LICENSE).
