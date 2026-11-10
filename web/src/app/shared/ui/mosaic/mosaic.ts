import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { mosaicFrame, valueNoise, type MosaicFrame } from './mosaic.generator';

/** Steps per second: a pixel-art cadence, not smooth motion. */
const FPS = 10;
/** Noise time per step: how fast the field flows. */
const FLOW = 0.045;

/**
 * "Mozaik": glyph tiles generated from a seed, dense in the top-left corner and breaking up toward
 * the bottom-right, flowing in a loop. Still with reduced motion, paused off screen. Decoration only.
 */
@Component({
  selector: 'app-mosaic',
  host: { class: 'mosaic', 'aria-hidden': 'true' },
  template: `<canvas #canvas class="mosaic__canvas"></canvas>`,
})
export class AppMosaic {
  /** Always app data (venue or combo name), never random per load. */
  readonly seed = input.required<string>();
  /** Tile size in CSS px, gap included. */
  readonly cell = input(12);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const style = getComputedStyle(this.host.nativeElement);
      const colors = [1, 2, 3, 4, 5].map((i) =>
        style.getPropertyValue(`--color-mosaic-${i}`).trim(),
      );
      const ink = style.getPropertyValue('--color-mosaic-ground').trim();
      const noise = valueNoise(this.seed());
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

      let cols = 0;
      let rows = 0;
      let t = 0;
      const draw = () => {
        const size = this.cell();
        const frame = mosaicFrame(noise, cols, rows, t);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        paint(ctx, frame, cols, size, colors, ink);
      };
      const resize = () => {
        const { width, height } = this.host.nativeElement.getBoundingClientRect();
        const ratio = devicePixelRatio || 1;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        cols = Math.ceil(width / this.cell());
        rows = Math.ceil(height / this.cell());
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
        last = now;
        t += FLOW;
        draw();
      };
      const sync = () => {
        cancelAnimationFrame(frameId);
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

function paint(
  ctx: CanvasRenderingContext2D,
  frame: MosaicFrame,
  cols: number,
  size: number,
  colors: string[],
  ink: string,
): void {
  const gap = Math.max(1, Math.round(size / 8));
  const s = size - gap;
  ctx.lineWidth = Math.max(1, size / 8);
  frame.forEach((tile, i) => {
    if (!tile) return;
    const x = (i % cols) * size;
    const y = Math.floor(i / cols) * size;
    const color = colors[tile.color];
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    switch (tile.glyph) {
      case 'square':
        ctx.fillRect(x, y, s, s);
        break;
      case 'ring':
        ctx.fillRect(x, y, s, s);
        ctx.strokeStyle = ink;
        ctx.strokeRect(x + s * 0.25, y + s * 0.25, s * 0.5, s * 0.5);
        break;
      case 'dash':
        ctx.fillRect(x, y + s * 0.3, size, s * 0.4);
        break;
      case 'dot':
        ctx.fillRect(x + s * 0.25, y + s * 0.25, s * 0.5, s * 0.5);
        break;
      case 'cross':
        ctx.beginPath();
        ctx.moveTo(x + s * 0.2, y + s * 0.2);
        ctx.lineTo(x + s * 0.8, y + s * 0.8);
        ctx.moveTo(x + s * 0.8, y + s * 0.2);
        ctx.lineTo(x + s * 0.2, y + s * 0.8);
        ctx.stroke();
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(x + s / 2, y + s * 0.1);
        ctx.lineTo(x + s * 0.8, y + s / 2);
        ctx.lineTo(x + s / 2, y + s * 0.9);
        ctx.lineTo(x + s * 0.2, y + s / 2);
        ctx.closePath();
        ctx.fill();
        break;
    }
  });
}
