import { TestBed } from '@angular/core/testing';
import { ThemeStore } from './theme-store';

describe('ThemeStore', () => {
  const root = document.documentElement;

  afterEach(() => {
    localStorage.clear();
    delete root.dataset['theme'];
  });

  it('starts from the saved preference', () => {
    localStorage.setItem('menuly.theme', 'dark');
    expect(TestBed.inject(ThemeStore).preference()).toBe('dark');
  });

  it('applies and persists a theme, and clears both for system', () => {
    const store = TestBed.inject(ThemeStore);
    store.preference.set('dark');
    TestBed.tick();
    expect(root.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('menuly.theme')).toBe('dark');

    store.preference.set('system');
    TestBed.tick();
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('menuly.theme')).toBeNull();
  });
});
