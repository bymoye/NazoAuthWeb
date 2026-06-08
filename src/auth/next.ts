type LocationSnapshot = {
  pathname: string;
  search: string;
  hash: string;
};

function isAuthPath(path: string): boolean {
  return path === '/auth' || path.startsWith('/auth?');
}

export function buildCurrentPath(location: LocationSnapshot): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function buildAuthRedirectWithNext(nextPath: string): string {
  const normalized = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
  return `/auth?next=${encodeURIComponent(normalized)}`;
}

export function resolveSafeNextFromSearch(search: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const rawNext = new URLSearchParams(search).get('next');
  if (!rawNext) {
    return null;
  }
  try {
    const resolved = new URL(rawNext, window.location.origin);
    if (resolved.origin !== window.location.origin) {
      return null;
    }
    const next = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    if (!next.startsWith('/') || isAuthPath(next)) {
      return null;
    }
    return next;
  } catch {
    return null;
  }
}
