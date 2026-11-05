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

  it('cycles the theme from the top bar: system, light, dark', async () => {
    const fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.topbar button');
    expect(button.getAttribute('aria-label')).toBe('Tema: kao sistem');

    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(ThemeStore).preference()).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Tema: svetla');

    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(ThemeStore).preference()).toBe('dark');
  });
});
