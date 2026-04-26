type UmamiStats = {
	pageviews?: number;
	visitors?: number;
	visits?: number;
	bounces?: number;
	totaltime?: number;
};

type UmamiStatsConfig = {
	websiteId?: string;
	apiEndpoint?: string;
	baseUrl?: string;
	apiKey?: string;
	token?: string;
};

declare global {
	interface Window {
		__umamiStatsConfig?: UmamiStatsConfig;
		oddmisc?: {
			getStats?: (path?: string) => Promise<UmamiStats>;
			getSiteStats?: () => Promise<UmamiStats>;
			getPageStats?: (path: string) => Promise<UmamiStats>;
		};
		fetchUmamiStats?: (options?: {
			path?: string;
			startAt?: number;
			endAt?: number;
		}) => Promise<UmamiStats>;
	}
}

const normalizeEndpoint = (value?: string) => value?.replace(/\/$/, "") ?? "";

const getApiEndpoint = (config: UmamiStatsConfig) => {
	const explicitEndpoint = normalizeEndpoint(config.apiEndpoint);

	if (explicitEndpoint) {
		return explicitEndpoint;
	}

	if (config.apiKey) {
		return "https://api.umami.is/v1";
	}

	const baseUrl = normalizeEndpoint(config.baseUrl);

	if (!baseUrl) {
		return "";
	}

	return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
};

const getAuthHeaders = (config: UmamiStatsConfig): Record<string, string> => {
	if (config.apiKey) {
		return { "x-umami-api-key": config.apiKey };
	}

	if (config.token) {
		return { Authorization: `Bearer ${config.token}` };
	}

	return {};
};

const readTimestamp = (value: number | undefined, fallback: number) =>
	Number.isFinite(value) && value !== undefined && value >= 0
		? value
		: fallback;

const getStatsFromOddmisc = ({ path }: { path?: string } = {}) => {
	if (!window.oddmisc) {
		return null;
	}

	if (path && window.oddmisc.getPageStats) {
		return window.oddmisc.getPageStats(path);
	}

	if (path && window.oddmisc.getStats) {
		return window.oddmisc.getStats(path);
	}

	if (window.oddmisc.getSiteStats) {
		return window.oddmisc.getSiteStats();
	}

	return null;
};

const waitForOddmiscStats = (options: { path?: string } = {}) =>
	new Promise<UmamiStats>((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			reject(new Error("Umami share client did not load"));
		}, 3000);

		window.addEventListener(
			"oddmisc-ready",
			() => {
				window.clearTimeout(timeoutId);

				const statsPromise = getStatsFromOddmisc(options);
				if (!statsPromise) {
					reject(new Error("Umami share client is not available"));
					return;
				}

				statsPromise.then(resolve, reject);
			},
			{ once: true },
		);
	});

const hasDirectApiConfig = (config: UmamiStatsConfig) => {
	const authHeaders = getAuthHeaders(config);

	return Boolean(
		config.websiteId &&
			getApiEndpoint(config) &&
			Object.keys(authHeaders).length > 0,
	);
};

const fetchDirectUmamiStats = async ({
	path,
	startAt,
	endAt,
}: {
	path?: string;
	startAt?: number;
	endAt?: number;
}) => {
	const config = window.__umamiStatsConfig ?? {};
	const websiteId = config.websiteId;
	const apiEndpoint = getApiEndpoint(config);
	const authHeaders = getAuthHeaders(config);

	if (!websiteId || !apiEndpoint || Object.keys(authHeaders).length === 0) {
		throw new Error("Umami API is not configured for client-side access");
	}

	const params = new URLSearchParams({
		startAt: String(readTimestamp(startAt, 0)),
		endAt: String(readTimestamp(endAt, Date.now())),
	});

	if (path) {
		params.set("path", path);
	}

	const response = await fetch(
		`${apiEndpoint}/websites/${websiteId}/stats?${params.toString()}`,
		{
			headers: {
				Accept: "application/json",
				...authHeaders,
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch stats: ${response.status}`);
	}

	const stats = (await response.json()) as UmamiStats;

	return {
		pageviews: stats.pageviews ?? 0,
		visitors: stats.visitors ?? 0,
		visits: stats.visits ?? 0,
		bounces: stats.bounces ?? 0,
		totaltime: stats.totaltime ?? 0,
	};
};

window.fetchUmamiStats = async ({ path, startAt, endAt } = {}) => {
	const config = window.__umamiStatsConfig ?? {};

	if (hasDirectApiConfig(config)) {
		return fetchDirectUmamiStats({ path, startAt, endAt });
	}

	const oddmiscStats = getStatsFromOddmisc({ path });

	if (oddmiscStats) {
		return oddmiscStats;
	}

	return waitForOddmiscStats({ path });
};

window.dispatchEvent(new Event("umami-stats-ready"));

export {};
