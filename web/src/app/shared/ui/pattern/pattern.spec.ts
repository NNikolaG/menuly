import { TestBed } from '@angular/core/testing';
import { AppPattern } from './pattern';

describe('AppPattern', () => {
  it('renders one hidden cell per generated cell with its grid placement', async () => {
    const fixture = TestBed.createComponent(AppPattern);
    fixture.componentRef.setInput('seed', 'Kafana Mornar');
    fixture.componentRef.setInput('cols', 4);
    fixture.componentRef.setInput('rows', 2);
    fixture.componentRef.setInput('big', false);
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;
    const cells = host.querySelectorAll<HTMLElement>('.pattern__cell');
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.classList).toContain('pattern');
    expect(host.style.getPropertyValue('--cols')).toBe('4');
    expect(cells).toHaveLength(8);
    expect(cells[0].style.gridColumn).toBe('1 / span 1');
    expect(cells[0].dataset['kind']).toBeTruthy();
    expect(cells[0].style.getPropertyValue('--bg')).toMatch(/^var\(--color-brand-/);
  });
});
