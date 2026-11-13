import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  GRAIN_LAYERS,
  grainDots,
  grainPhases,
  grainPoint,
  type GrainDot,
  type GrainMood,
} from './grain.generator';

/** Frames per second: smooth enough to breathe, cheap enough for old phones. */
const FPS = 24;
/** Dots per CSS pixel of band area; each dot is about one CSS pixel. */
const DENSITY = 0.6;

/**
 * "Zrno": waves and clouds of sprayed dots that roll and breathe in a loop, generated from a seed.
 * The ground comes from CSS (it follows the theme); dots are painted pixel by pixel. Still with
 * reduced motion, paused off screen. Decoration only.
 */
@Component({
  selector: 'app-grain',
  host: { class: 'grain', '[attr.data-mood]': 'mood()', 'aria-hidden': 'true' },
  template: `<canvas #canvas class="grain__canvas"></canvas>`,
})
export class AppGrain {
  /** Always app data (venue or combo name), never random per load. */
  readonly seed = input.required<string>();
  readonly mood = input<GrainMood>('cool');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const mood = this.mood();
      const layers = GRAIN_LAYERS[mood];
      const style = getComputedStyle(this.host.nativeElement);
      const colors = [1, 2, 3, 4, 5, 6].map((i) =>
        packColor(style.getPropertyValue(`--color-grain-${mood}-${i}`).trim()),
      );
      const phases = grainPhases(this.seed(), mood);
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

      let dots: GrainDot[] = [];
      let image: ImageData | null = null;
      let pixels = new Uint32Array(0);
      let ratio = 1;
      let t = 0;
      const draw = () => {
        if (!image) return;
        const w = canvas.width;
        const h = canvas.height;
        const dot = Math.max(1, Math.round(ratio * 0.8));
        pixels.fill(0);
        for (const d of dots) {
          const layer = layers[d.layer];
          const [x, y] = grainPoint(layer, d, phases[d.layer], t, w / ratio, h / ratio);
          const px = Math.round(x * ratio);
          const py = Math.round(y * ratio);
          if (px < 0 || py < 0 || px + dot > w || py + dot > h) continue;
          const color = colors[layer.color];
          for (let j = 0; j < dot; j++)
            pixels.fill(color, (py + j) * w + px, (py + j) * w + px + dot);
        }
        ctx.putImageData(image, 0, 0);
      };
      const resize = () => {
        const { width, height } = this.host.nativeElement.getBoundingClientRect();
        if (!width || !height) return;
        ratio = devicePixelRatio || 1;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        image = ctx.createImageData(canvas.width, canvas.height);
        pixels = new Uint32Array(image.data.buffer);
        dots = grainDots(this.seed(), mood, Math.round(width * height * DENSITY));
        draw();
      };
      const sizes = new ResizeObserver(resize);
      sizes.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => sizes.disconnect());
      if (still) return;

      let visible = false;
      let frameId = 0;
      let last = 0;
      const tick = (now: number) => {
        frameId = requestAnimationFrame(tick);
        if (now - last < 1000 / FPS) return;
        t += (last ? Math.min(now - last, 100) : 0) / 1000;
        last = now;
        draw();
      };
      const sync = () => {
        cancelAnimationFrame(frameId);
        last = 0;
        if (visible && !document.hidden) frameId = requestAnimationFrame(tick);
      };
      const seen = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        sync();
      });
      seen.observe(this.host.nativeElement);
      document.addEventListener('visibilitychange', sync);
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frameId);
        seen.disconnect();
        document.removeEventListener('visibilitychange', sync);
      });
    });
  }
}

/** Any CSS color as one RGBA pixel in the canvas's (little-endian) byte order. */
function packColor(color: string): number {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return 0;
  probe.fillStyle = color || '#000';
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
