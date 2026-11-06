import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ThemeStore } from '../theme/theme-store';
import { AdminShell } from './admin-shell';

describe('AdminShell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  it('cycles the theme from the sidebar: system, light, dark', async () => {
    const fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.theme');
    expect(button.getAttribute('aria-label')).toBe('Tema: kao sistem');

    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(ThemeStore).preference()).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Tema: svetla');

    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(ThemeStore).preference()).toBe('dark');
  });

  it('collapses the sidebar to icons and remembers it', async () => {
    const fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const toggle = root.querySelector<HTMLButtonElement>('.topbar button')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    await fixture.whenStable();
    expect(root.querySelector('.sidebar')!.hasAttribute('data-collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Proširi meni');
    expect(localStorage.getItem('menuly.sidebar')).toBe('collapsed');

    const again = TestBed.createComponent(AdminShell);
    await again.whenStable();
    expect(again.nativeElement.querySelector('.sidebar').hasAttribute('data-collapsed')).toBe(true);
  });
});
