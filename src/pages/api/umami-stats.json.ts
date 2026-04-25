import type { APIRoute } from "astro";

export const prerender = false;

type UmamiStats = {
	pageviews?: number;
	visitors?: number;
	visits?: number;
	bounces?: number;
	totaltime?: number;
};

type LoginResponse = {
	token?: string;
};

let cachedToken: string | undefined;

const json = (
	body: unknown,
	status = 200,
	cacheControl = "public, s-maxage=300, stale-while-revalidate=600",
) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			"Cache-Control": cacheControl,
			"Content-Type": "application/json; charset=utf-8",
		},
	});

const errorJson = (message: string, status = 500) =>
	json({ error: message }, status, "no-store");

const getApiEndpoint = () => {
	const explicitEndpoint = import.meta.env.UMAMI_API_ENDPOINT;

	if (explicitEndpoint) {
		return explicitEndpoint.replace(/\/$/, "");
	}

	if (import.meta.env.UMAMI_API_KEY) {
		return "https://api.umami.is/v1";
	}

	const baseUrl = import.meta.env.UMAMI_BASE_URL?.replace(/\/$/, "");

	if (!baseUrl) {
		return "";
	}

	return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
};

const getAuthHeaders = async (
	apiEndpoint: string,
): Promise<Record<string, string>> => {
	const apiKey = import.meta.env.UMAMI_API_KEY;
	const token = import.meta.env.UMAMI_TOKEN;

	if (apiKey) {
		return { "x-umami-api-key": apiKey };
	}

	if (token) {
		return { Authorization: `Bearer ${token}` };
	}

	if (cachedToken) {
		return { Authorization: `Bearer ${cachedToken}` };
	}

	const username = import.meta.env.UMAMI_USERNAME;
	const password = import.meta.env.UMAMI_PASSWORD;

	if (!username || !password) {
		throw new Error("Missing Umami authentication config");
	}

	const response = await fetch(`${apiEndpoint}/auth/login`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ username, password }),
	});

	if (!response.ok) {
		throw new Error(`Umami login failed: ${response.status}`);
	}

	const data = (await response.json()) as LoginResponse;

	if (!data.token) {
		throw new Error("Umami login response did not include a token");
	}

	cachedToken = data.token;
	return { Authorization: `Bearer ${cachedToken}` };
};

const getTimestamp = (value: string | null, fallback: number) => {
	if (!value) {
		return fallback;
	}

	const timestamp = Number(value);

	return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : fallback;
};

export const GET: APIRoute = async ({ url }) => {
	const websiteId = import.meta.env.UMAMI_WEBSITE_ID;
	const apiEndpoint = getApiEndpoint();

	if (!websiteId || !apiEndpoint) {
		return errorJson("Umami API is not configured", 503);
	}

	const endAt = getTimestamp(url.searchParams.get("endAt"), Date.now());
	const startAt = getTimestamp(url.searchParams.get("startAt"), 0);
	const path = url.searchParams.get("path");

	const params = new URLSearchParams({
		startAt: String(startAt),
		endAt: String(endAt),
	});

	if (path) {
		params.set("path", path);
	}

	try {
		const headers = await getAuthHeaders(apiEndpoint);
		const response = await fetch(
			`${apiEndpoint}/websites/${websiteId}/stats?${params.toString()}`,
			{
				headers: {
					Accept: "application/json",
					...headers,
				},
			},
		);

		if (!response.ok) {
			return errorJson(
				`Failed to fetch stats: ${response.status}`,
				response.status,
			);
		}

		const data = (await response.json()) as UmamiStats;

		return json({
			pageviews: data.pageviews ?? 0,
			visitors: data.visitors ?? 0,
			visits: data.visits ?? 0,
			bounces: data.bounces ?? 0,
			totaltime: data.totaltime ?? 0,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to fetch stats";

		return errorJson(message);
	}
};
