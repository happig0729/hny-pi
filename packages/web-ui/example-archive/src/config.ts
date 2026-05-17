/// <reference types="vite/client" />

export interface AppConfig {
	api: {
		proxyTarget: string;
		baseUrl: string;
		auth: {
			enabled: boolean;
			endpoint: string;
			username: string;
			password: string;
		};
	};
	apiKeys: {
		deepseek?: string;
	};
}

export function loadConfig(): AppConfig {
	const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

	return {
		api: {
			proxyTarget: import.meta.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
			baseUrl,
			auth: {
				enabled: import.meta.env.VITE_AUTH_ENABLED !== "false",
				endpoint: `${baseUrl}/auth/login`,
				username: import.meta.env.VITE_AUTH_USERNAME ?? "",
				password: import.meta.env.VITE_AUTH_PASSWORD ?? "",
			},
		},
		apiKeys: {
			deepseek: import.meta.env.VITE_DEEPSEEK_API_KEY || undefined,
		},
	};
}
