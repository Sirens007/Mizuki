/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
	readonly PUBLIC_UMAMI_WEBSITE_ID?: string;
	readonly PUBLIC_UMAMI_API_ENDPOINT?: string;
	readonly PUBLIC_UMAMI_BASE_URL?: string;
	readonly PUBLIC_UMAMI_API_KEY?: string;
	readonly PUBLIC_UMAMI_TOKEN?: string;
}
