# OSSPlay — Design System & UX Principles

Shared design principles across the three product surfaces users see: the `ossplay` dashboard (self-hosted admin UI), `website` (ossplay.com), and `docs` (docs.ossplay.com). The goal is that moving between subdomains feels like one product, not three separately-built sites, without over-specifying visual decisions that haven't been made yet.

Items marked **TBD** are open — don't invent specifics for them; flag them for an explicit decision instead of guessing.

---

## 1. Brand Basics

- **Name:** OSSPlay. Written as one word, capital O/S/S/P — not "OSS Play" or "ossPlay" in prose.
- **Voice:** Technical, direct, developer-first — mirrors the PRD's own tone. Prefer precise terms over marketing language ("self-hosted object storage platform," not "revolutionary media cloud"). This applies to UI copy, error messages, docs, and the website equally.
- **Logo, color palette, typography:** **TBD.** No brand assets exist yet. Do not invent a color palette or logo direction inside code or docs — placeholder/neutral (e.g. Shadcn's default zinc/slate theme) until a real decision is made.

---

## 2. Shared UI Foundation

- **Component library:** Shadcn UI + Tailwind everywhere a UI surface exists (dashboard, website, docs). Shadcn is copy-in, not a runtime dependency — each repo (`ossplay`'s `apps/dashboard`, `website`, `docs`) vendors its own copies of the primitives it uses rather than sharing a UI package across repos with independent release cycles (see [ARCHITECTURE.md](./ARCHITECTURE.md)).
- **Design tokens:** Once a real palette/typography decision is made, define it once (CSS variables or a Tailwind theme extension) and replicate the same token *values* — not necessarily the same package — across all three repos, so a color change is a coordinated update, not a drift.
- **Dark mode:** Support both light and dark themes across all three surfaces; default to system preference. Developer-tool audiences skew toward dark-mode use, so dark mode should get equal design attention, not be an afterthought pass over a light-first design.

## 3. Cross-Product Consistency

- **Header/nav:** `website`, `docs`, and the `ossplay` dashboard should share a recognizable header treatment (same logo placement, same product-switcher pattern for jumping between docs/dashboard/marketing) even though they're built and deployed independently. This is a visual-consistency requirement, not a shared-component requirement — each repo implements its own header matching the same spec.
- **Footer:** Consistent footer links (GitHub org, docs, license) across `website` and `docs` at minimum.

## 4. Dashboard-Specific UX Principles

The `ossplay` dashboard is admin/ops tooling, not a consumer app — optimize for information density and operator efficiency over marketing polish:

- **Dense, sortable/filterable tables** for orgs, projects, assets, and worker fleets rather than card grids — operators are scanning many rows, not browsing a catalog.
- **Structured editors for project rules** (PRD §3's per-category rule matrix): favor form controls with inline validation over raw JSON editing for common cases, but allow an "advanced/raw JSON" escape hatch for rule shapes the form doesn't cover yet — the rules are stored as JSONB and will evolve faster than the form UI.
- **Drive/folder browser:** familiar file-manager interaction patterns (breadcrumbs, drag-drop upload, right-click/context menu) since it's backed by a closure-table hierarchy users will recognize as "folders."
- **Async operation visibility:** transcoding/packaging jobs run on remote workers over potentially minutes — surface job status (`pending`/`processing`/`ready`/`failed` per the `assets.status` enum) prominently, with retry affordances on `failed`, rather than silent background processing.

## 5. Accessibility & Responsiveness Baseline

- All three surfaces: keyboard-navigable, sufficient color contrast in both themes, semantic HTML/ARIA for interactive components (Shadcn's Radix-based primitives get most of this for free — don't fight it).
- `website` and `docs` must be fully responsive down to mobile widths (visitors land from search/social on phones). The `ossplay` dashboard should be usable on tablet width at minimum; full mobile optimization for the dashboard is a lower priority than for the public-facing surfaces, since it's an admin tool typically used at a desk.
