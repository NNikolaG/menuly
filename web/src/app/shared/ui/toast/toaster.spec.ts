import { TestBed } from '@angular/core/testing';
import { AppToaster } from './toast';
import { Toaster } from './toaster';

describe('Toaster', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a toast in a polite live region and dismisses it after a while', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppToaster);
    const toaster = TestBed.inject(Toaster);
    const region: HTMLElement = fixture.nativeElement.querySelector('section');
    expect(region.getAttribute('aria-live')).toBe('polite');

    toaster.show('Objekat je sačuvan.');
    fixture.detectChanges();
    expect(region.textContent).toContain('Objekat je sačuvan.');

    vi.advanceTimersByTime(4000);
    expect(toaster.toasts()).toEqual([]);
  });

  it('holds a toast while pointed at, and the close button removes it', () => {
    vi.useFakeTimers();
    const toaster = TestBed.inject(Toaster);
    toaster.show('Sačuvano');
    const [toast] = toaster.toasts();

    toaster.pause(toast.id);
    vi.advanceTimersByTime(10_000);
    expect(toaster.toasts().length).toBe(1);

    toaster.dismiss(toast.id);
    expect(toaster.toasts()).toEqual([]);
  });

  it('keeps at most three, dropping the oldest', () => {
    const toaster = TestBed.inject(Toaster);
    for (const message of ['1', '2', '3', '4']) toaster.show(message);
    expect(toaster.toasts().map((toast) => toast.message)).toEqual(['2', '3', '4']);
  });
});
