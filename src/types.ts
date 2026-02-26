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
}

export interface OpenAPISpec {
	openapi: string;
	info: {
		title: string;
		version: string;
		description?: string;
		termsOfService?: string;
		contact?: {
			name?: string;
			url?: string;
			email?: string;
		};
		license?: {
			name: string;
			url?: string;
		};
	};
	servers?: Array<{
		url: string;
		description?: string;
		variables?: Record<
			string,
			{ default: string; description?: string; enum?: string[] }
		>;
	}>;
	paths: Record<string, Record<string, Operation>>;
	components?: {
		schemas?: Record<string, Schema>;
		securitySchemes?: Record<string, SecurityScheme>;
		parameters?: Record<string, Parameter>;
		responses?: Record<string, Response>;
	};
	tags?: Array<{
		name: string;
		description?: string;
	}>;
	externalDocs?: {
		description?: string;
		url: string;
	};
	webhooks?: Record<string, Operation | Reference>;
}

export interface Operation {
	tags?: string[];
	summary?: string;
	description?: string;
	operationId?: string;
	parameters?: Array<Parameter | Reference>;
	requestBody?: RequestBody | Reference;
	responses: Record<string, Response | Reference>;
	deprecated?: boolean;
	security?: Array<Record<string, string[]>>;
	externalDocs?: {
		description?: string;
		url: string;
	};
}

export interface Reference {
	$ref: string;
}

export interface Parameter {
	name: string;
	in: "query" | "header" | "path" | "cookie";
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	allowEmptyValue?: boolean;
	schema?: Schema | Reference;
	type?: string; // OpenAPI 2.0 support
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
	description: string;
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
	type?: string | string[];
	format?: string;
	description?: string;
	properties?: Record<string, Schema | Reference>;
	required?: string[];
	items?: Schema | Reference;
	enum?: JsonValue[];
	default?: JsonValue;
	example?: JsonValue;
	deprecated?: boolean;
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
}

export interface SecurityScheme {
	type: "apiKey" | "http" | "oauth2" | "openIdConnect";
	description?: string;
	name?: string;
	in?: "query" | "header" | "cookie";
	scheme?: string;
	bearerFormat?: string;
	flows?: Record<string, JsonValue>;
	openIdConnectUrl?: string;
}
