import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { emailRenderPlugin } from "./src/plugin/email-render-plugin.ts";

// Port 6104 per the monorepo port convention:
//   6100 – root/dashboard  6101 – api  6102 – docs  6103 – website  6104 – templates
const monorepoRoot = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		// Injects a dev-only middleware that renders email templates server-side
		// and returns the HTML. This avoids running a separate sidecar process.
		emailRenderPlugin({
			// The templates themselves live in @ossplay/mail (the package that
			// actually sends these emails) — resolved by path rather than a
			// workspace import since the plugin loads each .tsx file through
			// Vite's SSR module runner for hot-reload-on-save, not as a bundled
			// dependency.
			templatesDir: path.resolve(monorepoRoot, "packages/mail/src/templates"),
		}),
	],
	server: {
		port: 6104,
		fs: {
			// Needs to reach outside apps/templates to serve/SSR-load
			// packages/mail/src/templates.
			allow: [monorepoRoot],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
