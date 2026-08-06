/**
 * emailRenderPlugin — a Vite dev-server middleware that renders OSSPlay email
 * templates to HTML server-side and exposes them at:
 *
 *   GET /__email/templates          → JSON list of available template names
 *   GET /__email/render/:template   → rendered HTML (with optional ?fixture=N)
 *
 * We register the module with tsx/esbuild on-the-fly so we can import .tsx
 * files that use React JSX without needing a separate compilation step.
 * In production (build mode) the plugin is a no-op — the preview app itself
 * bundles its own mock data.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { FIXTURES } from "../fixtures.ts";

export interface EmailRenderPluginOptions {
	templatesDir: string;
}

export function emailRenderPlugin(opts: EmailRenderPluginOptions): Plugin {
	return {
		name: "email-render",
		apply: "serve",

		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const url = req.url ?? "";

				// ── GET /__email/templates ──────────────────────────────────────
				if (url === "/__email/templates") {
					try {
						const files = await readdir(opts.templatesDir);
						const templates = files
							.filter((f) => f.endsWith(".tsx") && f !== "layout.tsx")
							.map((f) => path.basename(f, ".tsx"));

						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify(templates));
					} catch (err) {
						res.writeHead(500, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: String(err) }));
					}
					return;
				}

				// ── GET /__email/render/:template?fixture=N ─────────────────────
				const renderMatch = url.match(/^\/__email\/render\/([^?]+)/);
				if (renderMatch) {
					const templateName = renderMatch[1];
					const fixtureIndex = Number(
						new URL(url, "http://localhost").searchParams.get("fixture") ?? "0",
					);

					try {
						// Use Vite's module runner so React/JSX resolution goes through
						// the same pipeline (handles monorepo node_modules, tsconfig paths)
						const modulePath = path.join(opts.templatesDir, `${templateName}.tsx`);

						// Clear from Vite's module graph so edits hot-reload in the preview
						const mod = server.moduleGraph.getModulesByFile(modulePath);
						if (mod) {
							for (const m of mod) {
								server.moduleGraph.invalidateModule(m);
							}
						}

						// Dynamic import through Vite's SSR pipeline
						const module = await server.ssrLoadModule(modulePath, {
							fixStacktrace: true,
						});

						// Find the named export matching the component name
						const componentName = Object.keys(module).find((k) => typeof module[k] === "function");
						if (!componentName) {
							throw new Error(`No React component export found in ${templateName}`);
						}

						const Component = module[componentName] as (props: Record<string, unknown>) => unknown;

						// Resolve fixture data for this template
						const fixtures = FIXTURES[templateName as keyof typeof FIXTURES] ?? [];
						const fixture = fixtures[fixtureIndex] ?? fixtures[0] ?? {};

						// Plain Node `import()`, not server.ssrLoadModule — these are
						// ordinary npm packages (no JSX/TS to transform), and routing a
						// bare CJS specifier like "react" through Vite's SSR module
						// runner fails ("module is not defined": the runner doesn't
						// apply its CJS interop shim for a directly-requested bare
						// specifier the way it does for a dependency of a transformed
						// module).
						const { render } = await import("@react-email/render");
						const { createElement } = await import("react");

						const html = await render(createElement(Component, fixture), {
							pretty: true,
						});

						res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
						res.end(html);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
						res.end(
							`<html><body style="font-family:monospace;padding:24px;color:#dc2626">
								<strong>Render error</strong><pre>${message}</pre>
							</body></html>`,
						);
					}
					return;
				}

				next();
			});
		},
	};
}
