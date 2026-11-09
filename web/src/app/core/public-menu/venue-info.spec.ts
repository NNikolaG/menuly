import { TestBed } from '@angular/core/testing';
import { publicMenuFixture } from './public-menu.testing';
import type { PublicMenu } from './public-menu';
import { VenueInfo } from './venue-info';

describe('VenueInfo', () => {
  afterEach(() => vi.useRealTimers());

  function render(venue: Partial<PublicMenu['venue']>) {
    const fixture = TestBed.createComponent(VenueInfo);
    fixture.componentRef.setInput('venue', { ...publicMenuFixture().venue, ...venue });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says whether the venue is open now and lists the week', () => {
    // Friday 10:00 in Belgrade.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T09:00:00Z'));
    const root = render({
      opening_hours: { mon: [['08:00', '23:00']], fri: [['08:00', '01:00']] },
    });
    expect(root.querySelector('summary')!.textContent).toContain('Otvoreno · do 01:00');
    const rows = [...root.querySelectorAll('.week__row')];
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain('08:00 – 23:00');
    expect(rows[1].textContent).toContain('Zatvoreno');
    expect(rows[4].getAttribute('aria-current')).toBe('date');
  });

  it('tells when a closed venue opens next', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Sunday noon.
    vi.setSystemTime(new Date('2026-11-08T11:00:00Z'));
    const root = render({ opening_hours: { mon: [['08:00', '23:00']] } });
    expect(root.querySelector('summary')!.textContent).toMatch(/Zatvoreno · otvara .+ u 08:00/);
  });

  it('shows the Wi-Fi password only when it is on the menu', () => {
    let root = render({ wifi: { ssid: 'Zora-Gost', password: 'kafa123', access: 'menu' } });
    expect(root.querySelector('.ssid')!.textContent).toBe('Zora-Gost');
    expect(root.querySelector('.password')!.textContent).toBe('kafa123');
    expect(root.querySelector('button.copy')).not.toBeNull();

    root = render({ wifi: { ssid: 'Zora-Gost', password: '', access: 'staff' } });
    expect(root.querySelector('.password')).toBeNull();
    expect(root.textContent).toContain('Lozinku pitaj osoblje');
  });

  it('renders nothing without hours or Wi-Fi', () => {
    const root = render({ opening_hours: {}, wifi: null });
    expect(root.textContent!.trim()).toBe('');
  });
});
