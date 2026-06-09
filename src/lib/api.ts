import { clearSessionHint } from '../auth/sessionHint';

const inferredBaseUrl = import.meta.env.DEV
  ? 'http://127.0.0.1:8000'
  : typeof window !== 'undefined'
    ? window.location.origin
    : 'https://auth.nazo.run';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || inferredBaseUrl
).replace(/\/+$/, '');
const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || 'nazo_oauth_csrf';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let inMemoryCsrfToken: string | null = null;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const encodedName = `${encodeURIComponent(name)}=`;
  const cookies = document.cookie.split(';');
  for (const item of cookies) {
    const candidate = item.trim();
    if (!candidate.startsWith(encodedName)) {
      continue;
    }
    return decodeURIComponent(candidate.slice(encodedName.length));
  }
  return null;
}

type JsonValue = Record<string, unknown> | unknown[] | null;

export class ApiError extends Error {
  readonly status: number;
  readonly payload: JsonValue;

  constructor(message: string, status: number, payload: JsonValue) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function resolveMessage(payload: JsonValue, fallback: string): string {
  if (!payload || Array.isArray(payload)) {
    return fallback;
  }
  const candidate =
    (payload.error_description as string | undefined) ??
    (payload.message as string | undefined);
  return candidate || fallback;
}

function isUnsafeMethod(method?: string): boolean {
  return UNSAFE_METHODS.has((method ?? 'GET').toUpperCase());
}

function readTokenFromPayload(payload: JsonValue): string | null {
  if (!payload || Array.isArray(payload)) {
    return null;
  }
  const token = payload.csrf_token;
  if (typeof token !== 'string') {
    return null;
  }
  const normalized = token.trim();
  return normalized || null;
}

function isCsrfFailure(payload: JsonValue): boolean {
  if (!payload || Array.isArray(payload)) {
    return false;
  }
  const message =
    (payload.error_description as string | undefined) ??
    (payload.message as string | undefined) ??
    '';
  return message.includes('CSRF');
}

async function parsePayload(response: Response): Promise<JsonValue> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  return (await response.json()) as JsonValue;
}

async function requestFreshCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      return null;
    }
    const payload = await parsePayload(response);
    const token = readTokenFromPayload(payload) ?? getCookie(CSRF_COOKIE_NAME);
    if (token) {
      inMemoryCsrfToken = token;
    }
    return token;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? {});
  let csrfToken = getCookie(CSRF_COOKIE_NAME) ?? inMemoryCsrfToken;
  if (isUnsafeMethod(method) && !csrfToken) {
    csrfToken = await requestFreshCsrfToken();
  }
  if (csrfToken && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrfToken);
    inMemoryCsrfToken = csrfToken;
  }

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method,
    credentials: 'include',
    headers,
  });
  let payload: JsonValue = await parsePayload(response);

  if (!response.ok && response.status === 400 && isUnsafeMethod(method) && isCsrfFailure(payload)) {
    const refreshedToken = await requestFreshCsrfToken();
    if (refreshedToken) {
      headers.set('X-CSRF-Token', refreshedToken);
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        method,
        credentials: 'include',
        headers,
      });
      payload = await parsePayload(response);
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSessionHint();
    }
    throw new ApiError(resolveMessage(payload, '请求失败'), response.status, payload);
  }

  return payload as T;
}
