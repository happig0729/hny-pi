import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const proxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8080";

	return {
		plugins: [tailwindcss()],
		server: {
			port: 5183,
			proxy: {
				"/api": {
					target: proxyTarget,
					changeOrigin: true,
					configure: (proxy) => {
						proxy.on("proxyReq", (proxyReq) => {
							proxyReq.removeHeader("origin");
						});
					},
				},
			},
		},
	};
});
