import { API_BASE_URL } from './api';

export const DEFAULT_AVATAR_PATH = '/icons/default-avatar.svg';

function normalizeApiBasePath(): string {
  try {
    if (typeof window === 'undefined') {
      return '';
    }
    const url = new URL(API_BASE_URL, window.location.origin);
    const basePath = url.pathname.replace(/\/+$/, '');
    return basePath === '/' ? '' : basePath;
  } catch {
    return '';
  }
}

function normalizeAvatarOriginAndPath(raw: string): string {
  if (typeof window === 'undefined') {
    return raw;
  }
  const basePath = normalizeApiBasePath();
  if (!basePath) {
    return raw;
  }

  try {
    const avatar = new URL(raw, window.location.origin);
    if (avatar.origin !== window.location.origin) {
      return raw;
    }
    if (!avatar.pathname.startsWith('/auth/')) {
      return raw;
    }
    if (avatar.pathname.startsWith(`${basePath}/auth/`)) {
      return avatar.toString();
    }
    avatar.pathname = `${basePath}${avatar.pathname}`;
    return avatar.toString();
  } catch {
    return raw;
  }
}

export function resolveAvatarUrl(avatarUrl?: string | null): string {
  const normalized = avatarUrl?.trim();
  if (!normalized) {
    return DEFAULT_AVATAR_PATH;
  }
  return normalizeAvatarOriginAndPath(normalized);
}
