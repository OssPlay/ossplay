import type { CertProvider } from '../config/instance-config';

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

// Caddy's default ACME CA (used when no `acme_ca` directive is present) is
// Let's Encrypt's production directory — spelling it out here rather than
// omitting the directive keeps buildCaddyfile's output the same shape
// regardless of provider, instead of one provider being implicit.
const ACME_CA_URLS: Record<Exclude<CertProvider, 'custom'>, string> = {
  letsencrypt: 'https://acme-v02.api.letsencrypt.org/directory',
  zerossl: 'https://acme.zerossl.com/v2/DV90',
};

function buildCaddyfile(domain: string, acmeEmail: string, acmeCaUrl: string): string {
  return `{
	email ${acmeEmail}
	acme_ca ${acmeCaUrl}
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

export interface ApplyDomainConfigOptions {
  acmeEmail?: string;
  certProvider?: CertProvider;
  customAcmeUrl?: string;
}

// Never throws — a Caddy-reachability failure must not block saving the
// domain or block onboarding, since the whole point of this being a
// skippable step is that it can't hard-fail the flow.
export async function applyDomainConfig(
  domain: string,
  options: ApplyDomainConfigOptions = {},
): Promise<ApplyDomainConfigResult> {
  const adminUrl = process.env.OSSPLAY_CADDY_ADMIN_URL;
  if (!adminUrl) {
    return { applied: false, reason: 'Caddy admin API is not configured on this deployment' };
  }

  const acmeEmail = options.acmeEmail ?? process.env.OSSPLAY_ACME_EMAIL ?? 'internal@ossplay.local';
  const certProvider = options.certProvider ?? 'letsencrypt';
  const acmeCaUrl = certProvider === 'custom' ? options.customAcmeUrl : ACME_CA_URLS[certProvider];
  if (!acmeCaUrl) {
    return { applied: false, reason: 'Missing ACME directory URL for the custom provider' };
  }

  try {
    const res = await fetch(`${adminUrl}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/caddyfile' },
      body: buildCaddyfile(domain, acmeEmail, acmeCaUrl),
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
