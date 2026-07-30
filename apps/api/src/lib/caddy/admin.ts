// Talks to Caddy's admin API (see infra/caddy/Caddyfile's `admin` global
// directive) to change the instance's domain at runtime, without an
// SSH+.env-edit+restart round trip. Caddy already does automatic Let's
// Encrypt for whatever domain it's configured with — this module's job is
// only getting a new domain *into* Caddy's live config.
//
// OSSPLAY_CADDY_ADMIN_URL's presence is the graceful-degradation signal:
// it's only set by infra/docker-compose.yml's `api` service, so local dev
// (bun dev, no Docker) and any non-Docker-Compose deployment always no-op
// here with no network call attempted — which is exactly what keeps the
// onboarding DNS step truly skippable everywhere, not just in Docker.
const REQUEST_TIMEOUT_MS = 5000;

function buildCaddyfile(domain: string, acmeEmail: string): string {
  return `{
	email ${acmeEmail}
}

${domain} {
	handle /api/* {
		uri strip_prefix /api
		reverse_proxy api:3001
	}

	handle {
		reverse_proxy dashboard:3000
	}
}
`;
}

export type ApplyDomainConfigResult = { applied: boolean; reason?: string };

// Never throws — a Caddy-reachability failure must not block saving the
// domain or block onboarding, since the whole point of this being a
// skippable step is that it can't hard-fail the flow.
export async function applyDomainConfig(domain: string): Promise<ApplyDomainConfigResult> {
  const adminUrl = process.env.OSSPLAY_CADDY_ADMIN_URL;
  if (!adminUrl) {
    return { applied: false, reason: 'Caddy admin API is not configured on this deployment' };
  }

  const acmeEmail = process.env.OSSPLAY_ACME_EMAIL ?? 'internal@ossplay.local';

  try {
    const res = await fetch(`${adminUrl}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/caddyfile' },
      body: buildCaddyfile(domain, acmeEmail),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { applied: false, reason: `Caddy admin API returned ${res.status}` };
    }
    return { applied: true };
  } catch (err) {
    return { applied: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
