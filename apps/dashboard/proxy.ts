import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'ossplay_session';
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

async function checkNeedsSetup(): Promise<boolean> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/setup/status`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { needsSetup: boolean };
    return data.needsSetup;
  } catch {
    // API unreachable — fall through to the login page rather than
    // blocking the whole dashboard on a hard error.
    return false;
  }
}

// Cheap redirect gate, not full auth enforcement: a stale/expired session
// cookie is caught by the API returning 401 and handled client-side, not by
// re-validating the session here on every navigation.
//
// Named `proxy` per Next.js 16's rename of the middleware convention (a
// file named middleware.ts with an exported `middleware` function is
// deprecated — see https://nextjs.org/docs/messages/middleware-to-proxy).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  const isAuthPage = pathname === '/setup' || pathname === '/login';

  if (hasSessionCookie) {
    if (isAuthPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  const needsSetup = await checkNeedsSetup();
  const target = needsSetup ? '/setup' : '/login';

  if (pathname === target) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
