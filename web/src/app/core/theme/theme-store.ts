import { DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'menuly.theme';

/** Light, dark or system theme: persisted, applied as `data-theme` on `<html>` (none for system). */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly root = inject(DOCUMENT).documentElement;

  readonly preference = signal<ThemePreference>(readPreference());

  constructor() {
    effect(() => {
      const preference = this.preference();
      if (preference === 'system') {
        delete this.root.dataset['theme'];
        localStorage.removeItem(STORAGE_KEY);
      } else {
        this.root.dataset['theme'] = preference;
        localStorage.setItem(STORAGE_KEY, preference);
      }
    });
  }
}

function readPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}
