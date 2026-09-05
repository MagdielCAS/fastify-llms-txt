export interface LLMsCacheOptions {
	enabled: boolean;
	ttl?: number;
	maxSize?: number;
}

export type LLMsSource =
	| { type: "file"; file: string }
	| { type: "url"; url: string; skipValidation?: boolean };

export interface LLMsOptions {
	source?: LLMsSource;
	header?: string;
	footer?: string;
	contentType?: "text/markdown" | "text/plain";
	cache?: LLMsCacheOptions;
	/**
	 * Base directory a `file` source must stay within.
	 * Defaults to `process.cwd()`.
	 */
	basePath?: string;
}

export interface ExternalDocs {
	description?: string;
	url: string;
}

export interface Contact {
	name?: string;
	url?: string;
	email?: string;
}

export interface License {
	name: string;
	identifier?: string;
	url?: string;
}

export interface Info {
	title: string;
	version: string;
	summary?: string;
	description?: string;
	termsOfService?: string;
	contact?: Contact;
	license?: License;
}

export interface ServerVariable {
	default: string;
	description?: string;
	enum?: string[];
}

export interface Server {
	url: string;
	description?: string;
	variables?: Record<string, ServerVariable>;
}

export interface Tag {
	name: string;
	description?: string;
	externalDocs?: ExternalDocs;
}

/** A single `security` entry: scheme name mapped to the scopes it requires. */
export type SecurityRequirement = Record<string, string[]>;

export interface Components {
	schemas?: Record<string, Schema | Reference>;
	securitySchemes?: Record<string, SecurityScheme | Reference>;
	parameters?: Record<string, Parameter | Reference>;
	responses?: Record<string, Response | Reference>;
	requestBodies?: Record<string, RequestBody | Reference>;
	headers?: Record<string, Header | Reference>;
}

export interface OpenAPISpec {
	openapi: string;
	info: Info;
	servers?: Server[];
	paths?: Record<string, PathItem>;
	components?: Components;
	security?: SecurityRequirement[];
	tags?: Tag[];
	externalDocs?: ExternalDocs;
	/** OpenAPI 3.1 webhooks. */
	webhooks?: Record<string, PathItem | Reference>;
}

export const HTTP_METHODS = [
	"get",
	"put",
	"post",
	"delete",
	"options",
	"head",
	"patch",
	"trace",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type PathItem = {
	summary?: string;
	description?: string;
	servers?: Server[];
	parameters?: Array<Parameter | Reference>;
} & Partial<Record<HttpMethod, Operation>>;

export interface Operation {
	tags?: string[];
	summary?: string;
	description?: string;
	operationId?: string;
	parameters?: Array<Parameter | Reference>;
	requestBody?: RequestBody | Reference;
	responses?: Record<string, Response | Reference>;
	deprecated?: boolean;
	security?: SecurityRequirement[];
	servers?: Server[];
	externalDocs?: ExternalDocs;
}

export interface Reference {
	$ref: string;
	summary?: string;
	description?: string;
}

export interface Parameter {
	name: string;
	in: "query" | "header" | "path" | "cookie";
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	allowEmptyValue?: boolean;
	schema?: Schema | Reference;
	content?: Record<string, MediaType>;
	example?: JsonValue;
	examples?: Record<string, JsonValue>;
}

export interface RequestBody {
	description?: string;
	content: Record<string, MediaType>;
	required?: boolean;
}

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface MediaType {
	schema?: Schema | Reference;
	example?: JsonValue;
	examples?: Record<string, JsonValue>;
}

export interface Response {
	description?: string;
	headers?: Record<string, Header | Reference>;
	content?: Record<string, MediaType>;
}

export interface Header {
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	schema?: Schema | Reference;
}

export interface Schema {
	title?: string;
	type?: string | string[];
	format?: string;
	description?: string;
	properties?: Record<string, Schema | Reference>;
	required?: string[];
	items?: Schema | Reference;
	enum?: JsonValue[];
	const?: JsonValue;
	default?: JsonValue;
	example?: JsonValue;
	examples?: JsonValue[];
	deprecated?: boolean;
	nullable?: boolean;
	readOnly?: boolean;
	writeOnly?: boolean;
	oneOf?: (Schema | Reference)[];
	anyOf?: (Schema | Reference)[];
	allOf?: (Schema | Reference)[];
	not?: Schema | Reference;
	additionalProperties?: boolean | Schema | Reference;
	pattern?: string;
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	minItems?: number;
	maxItems?: number;
}

export interface OAuthFlow {
	authorizationUrl?: string;
	tokenUrl?: string;
	refreshUrl?: string;
	scopes?: Record<string, string>;
}

export interface SecurityScheme {
	type: "apiKey" | "http" | "oauth2" | "openIdConnect" | "mutualTLS";
	description?: string;
	name?: string;
	in?: "query" | "header" | "cookie";
	scheme?: string;
	bearerFormat?: string;
	flows?: Record<string, OAuthFlow>;
	openIdConnectUrl?: string;
}
