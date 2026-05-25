import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const proxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8080";
	const port = Number(env.VITE_DEV_SERVER_PORT || 5183);

	return {
		plugins: [tailwindcss()],
		define: {
			"process.env": {},
		},
		server: {
			port,
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
