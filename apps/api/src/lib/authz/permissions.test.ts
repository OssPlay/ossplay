import { describe, expect, it } from "bun:test";
import { can } from "./permissions";

const root = { instanceRole: "root" as const };
const regular = { instanceRole: null };

describe("instance permissions", () => {
	it("root can manage workers", () => {
		expect(can(root, "instance:manage_workers")).toBe(true);
	});

	it("a user with no instance role cannot", () => {
		expect(can(regular, "instance:manage_workers")).toBe(false);
	});

	it("root can manage users", () => {
		expect(can(root, "instance:manage_users")).toBe(true);
	});

	it("a user with no instance role cannot manage users", () => {
		expect(can(regular, "instance:manage_users")).toBe(false);
	});
});

describe("org permissions", () => {
	it("root has implicit access even with no membership row", () => {
		expect(can(root, "org:delete", null)).toBe(true);
	});

	it("owner can do everything org-scoped", () => {
		const membership = { role: "owner" as const };
		expect(can(regular, "org:manage_settings", membership)).toBe(true);
		expect(can(regular, "org:manage_members", membership)).toBe(true);
		expect(can(regular, "org:delete", membership)).toBe(true);
		expect(can(regular, "org:manage_projects", membership)).toBe(true);
		expect(can(regular, "org:manage_assets", membership)).toBe(true);
	});

	it("admin can manage projects/assets but not settings/members/delete", () => {
		const membership = { role: "admin" as const };
		expect(can(regular, "org:manage_projects", membership)).toBe(true);
		expect(can(regular, "org:manage_assets", membership)).toBe(true);
		expect(can(regular, "org:manage_settings", membership)).toBe(false);
		expect(can(regular, "org:manage_members", membership)).toBe(false);
		expect(can(regular, "org:delete", membership)).toBe(false);
	});

	it("member can only manage assets", () => {
		const membership = { role: "member" as const };
		expect(can(regular, "org:manage_assets", membership)).toBe(true);
		expect(can(regular, "org:manage_projects", membership)).toBe(false);
		expect(can(regular, "org:manage_settings", membership)).toBe(false);
	});

	it("a non-member with no instance role has no org access", () => {
		expect(can(regular, "org:manage_assets", null)).toBe(false);
	});
});
