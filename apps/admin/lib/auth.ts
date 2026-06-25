'use client';

const KEY = 'gateway:bearer';

export function getBearer(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(KEY);
}

export function setBearer(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, token);
}

export function clearBearer(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}
