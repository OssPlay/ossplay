# @ossplay/templates

Live preview + dev-time HTML compiler for the email templates in
[`packages/mail/src/templates`](../../packages/mail/src/templates) — the React
Email components `@ossplay/mail` actually renders and sends. Lets you iterate
on an email's look without sending anything over a real SMTP server.

```bash
bun run dev:templates   # from the repo root, or `bun run dev` here
```

Opens at `http://localhost:3004`. Pick a template from the sidebar, switch
between fixtures (sample prop sets, see `src/fixtures.ts`), and toggle
desktop / mobile / raw-HTML source view. A Vite dev-middleware
(`src/plugin/email-render-plugin.ts`) renders each `.tsx` template
server-side via `@react-email/render` on every request, so edits to
`packages/mail/src/templates/*.tsx` show up on save with no separate build
step.

**Not part of the production build.** This is a development tool only —
it's excluded from the root `bun run build` (see the root `package.json`'s
`build` script) and from every Docker image. It stays committed so anyone
working on email templates has it available via `bun run dev:templates`,
without being shipped or built as part of the actual OSSPlay stack.
