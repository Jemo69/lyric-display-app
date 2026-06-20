import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(35).substring(2, 15);
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  let lastArgs: Parameters<T> | null = null;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          func(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

export function getBackendOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://127.0.0.1:4000';
}

export function isElectron(): boolean {
  if (typeof window !== 'undefined') {
    return !!(window as any).electronAPI;
  }
  return false;
}

export function getPlatform(): string {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI.getPlatform();
  }
  return 'web';
}

export function isMac(): boolean {
  return getPlatform() === 'darwin';
}

export function isWindows(): boolean {
  return getPlatform() === 'win32';
}

export function isLinux(): boolean {
  return getPlatform() === 'linux';
}
