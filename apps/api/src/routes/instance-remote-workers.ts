import { computeDestinations, getDb, remoteServers } from "@ossplay/db";
import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";
import { serializeComputeDestination } from "./instance-compute";
import { serializeRemoteServer } from "./instance-servers";

// Read-only merge of remoteServers + computeDestinations for
// instance/servers/page.tsx — a "remote worker" is either kind (see that
// page's own comment). Create/delete stay on their kind-specific routes
// (instance-servers.ts, instance-compute.ts); this exists only so the list
// view is one request instead of two, with the "Type" filter and search
// applied here instead of client-side. Both tables are small (instance-wide,
// not per-org), so this reads both in full and paginates in memory rather
// than reaching for a SQL UNION across two differently-shaped tables.
export const instanceRemoteWorkersRoute = new Hono<AppEnv>();

instanceRemoteWorkersRoute.use(
	"*",
	requireAuth,
	requireInstancePermission("instance:manage_workers"),
);

type RemoteWorkerRow =
	| ({ kind: "ssh" } & ReturnType<typeof serializeRemoteServer>)
	| ({ kind: "lambda" } & ReturnType<typeof serializeComputeDestination>);

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

instanceRemoteWorkersRoute.get("/", async (c) => {
	const db = getDb();
	const [servers, destinations] = await Promise.all([
		db.select().from(remoteServers),
		db.select().from(computeDestinations),
	]);

	const rows: RemoteWorkerRow[] = [
		...servers.map((s) => ({ kind: "ssh" as const, ...serializeRemoteServer(s) })),
		...destinations.map((d) => ({ kind: "lambda" as const, ...serializeComputeDestination(d) })),
	];

	// Same `q` / `filter_<key>` contract as lib/http/list-query.ts, applied by
	// hand since this spans two tables a single `where` can't.
	const q = c.req.query("q")?.trim().toLowerCase();
	const kindFilter = (c.req.query("filter_kind") ?? "")
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);
	const statusFilter = (c.req.query("filter_status") ?? "")
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);

	const filtered = rows
		.filter((row) => !q || row.label.toLowerCase().includes(q))
		.filter((row) => kindFilter.length === 0 || kindFilter.includes(row.kind))
		.filter((row) => statusFilter.length === 0 || statusFilter.includes(row.status))
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	const page = Math.max(0, Number.parseInt(c.req.query("page") ?? "0", 10) || 0);
	const pageSize = Math.min(
		MAX_PAGE_SIZE,
		Math.max(1, Number.parseInt(c.req.query("per_page") ?? "", 10) || DEFAULT_PAGE_SIZE),
	);
	const start = page * pageSize;

	return c.json({
		workers: filtered.slice(start, start + pageSize),
		total: filtered.length,
		page,
		pageSize,
	});
});
