const SESSION_HINT_KEY = 'nazo_oauth_session_hint';

export function hasSessionHint(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(SESSION_HINT_KEY) === '1';
}

export function markSessionHint(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SESSION_HINT_KEY, '1');
}

export function clearSessionHint(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(SESSION_HINT_KEY);
}

