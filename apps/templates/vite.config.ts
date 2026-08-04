import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { emailRenderPlugin } from "./src/plugin/email-render-plugin.ts";

// Port 3004 per the monorepo port convention:
//   3000 – root/dashboard  3001 – api  3002 – docs  3003 – website  3004 – templates
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
		port: 3004,
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
