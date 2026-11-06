import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppImageField } from './image-field';

describe('AppImageField', () => {
  let http: HttpTestingController;
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function pick(fixture: { nativeElement: HTMLElement }, file: File): void {
    const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  it('uploads with the purpose and keeps the returned URL', async () => {
    const fixture = TestBed.createComponent(AppImageField);
    fixture.componentRef.setInput('purpose', 'logo');
    fixture.detectChanges();
    pick(fixture, new File(['x'], 'logo.png', { type: 'image/png' }));
    const request = http.expectOne('/api/v1/media/images');
    const body = request.request.body as FormData;
    expect(body.get('purpose')).toBe('logo');
    expect((body.get('file') as File).name).toBe('logo.png');
    request.flush(
      {
        id: 'm1',
        url: 'https://api.menuly.app/v1/public/media/t/m1.png',
        mime: 'image/png',
        width: 512,
        height: 512,
        size_bytes: 10,
      },
      { status: 201, statusText: 'Created' },
    );
    await tick();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe(
      'https://api.menuly.app/v1/public/media/t/m1.png',
    );
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toContain('/m1.png');
  });

  it('refuses HEIC before uploading', () => {
    const fixture = TestBed.createComponent(AppImageField);
    fixture.detectChanges();
    pick(fixture, new File(['x'], 'IMG_1.heic', { type: 'image/heic' }));
    fixture.detectChanges();
    http.expectNone('/api/v1/media/images');
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain(
      'JPEG, PNG ili WebP',
    );
  });
});
