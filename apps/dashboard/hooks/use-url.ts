"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

class UrlLib {
	constructor(
		public url: URL,
		private router: AppRouterInstance,
	) {}

	get route() {
		return this.url.pathname + this.url.search;
	}

	toString() {
		return this.url.toString();
	}

	matches(url_pattern: `/${string}`) {
		return this.url.pathname === url_pattern || this.url.pathname.startsWith(`${url_pattern}/`);
	}

	// Not a hook despite the "set" verb pairing with getQueryParam below —
	// named setQueryParams (not useQueryParams) so lint rules that key off a
	// `use`-prefix (e.g. biome's useHookAtTopLevel) don't mistake a plain
	// instance method for one.
	setQueryParams(params: Record<string, string | null>) {
		const nUrl = new URL(this.url.toString());
		for (const key in params) {
			if (params[key] === null) {
				nUrl.searchParams.delete(key);
			} else {
				nUrl.searchParams.set(key, params[key]);
			}
		}
		this.router.replace(nUrl.toString());
	}

	getQueryParam(param: string) {
		return this.url.searchParams.get(param);
	}
}

export default function useURL() {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();

	const url = new URL(
		pathname,
		typeof window !== "undefined" ? window.location.origin : "http://localhost",
	);
	for (const [key, value] of searchParams.entries()) {
		url.searchParams.append(key, value);
	}

	return new UrlLib(url, router);
}
