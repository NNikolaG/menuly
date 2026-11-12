import { Component, computed, input } from '@angular/core';
import { hashSeed, mulberry32 } from '../pattern/pattern.generator';

export interface Butterfly {
  /** Height of the flight line, percent of the band. */
  y: number;
  /** Climb over one crossing, percent of the band (negative = up). */
  climb: number;
  scale: number;
  /** Seconds to cross the band. */
  duration: number;
  /** Negative: already mid-flight on load. */
  delay: number;
  /** Seconds per wing beat. */
  flap: number;
  /** 1..4: `--color-butterfly-<n>`. */
  color: number;
}

/** The same flock for the same seed: where each one flies, how fast, and its color. */
export function butterflies(seed: string, count = 7): Butterfly[] {
  const rnd = mulberry32(hashSeed(`leptiri:${seed}`));
  return Array.from({ length: count }, (_, i) => {
    const duration = 14 + rnd() * 14;
    return {
      y: 15 + ((i + rnd()) / count) * 65,
      climb: -10 - rnd() * 25,
      scale: 0.6 + rnd() * 0.7,
      duration,
      delay: -rnd() * duration,
      flap: 0.28 + rnd() * 0.2,
      color: (i % 4) + 1,
    };
  });
}

/**
 * "Leptiri": a pastel sky with a seeded flock of crayon butterflies that flap and drift across it
 * in a loop. With reduced motion they stay where they are. Decoration only.
 */
@Component({
  selector: 'app-butterflies',
  host: { class: 'butterflies', 'aria-hidden': 'true' },
  template: `
    @for (b of flock(); track $index) {
      <div
        class="flyer"
        [style.--y]="b.y"
        [style.--climb]="b.climb"
        [style.--scale]="b.scale"
        [style.animation-duration.s]="b.duration"
        [style.animation-delay.s]="b.delay"
        [style.--flap.s]="b.flap"
        [style.--wing]="'var(--color-butterfly-' + b.color + ')'"
      >
        <svg viewBox="0 0 40 32">
          <g class="wing wing--left">
            <path d="M20 15C16 2 2 0 3 9C4 15 12 17 20 16Z" />
            <path class="wing__low" d="M20 16C13 17 7 22 10 28C13 32 18 25 20 18Z" />
            <circle class="wing__spot" cx="8" cy="7" r="1.6" />
            <circle class="wing__spot" cx="12" cy="5" r="1.2" />
          </g>
          <g class="wing wing--right">
            <path d="M20 15C24 2 38 0 37 9C36 15 28 17 20 16Z" />
            <path class="wing__low" d="M20 16C27 17 33 22 30 28C27 32 22 25 20 18Z" />
            <circle class="wing__spot" cx="32" cy="7" r="1.6" />
            <circle class="wing__spot" cx="28" cy="5" r="1.2" />
          </g>
          <rect class="body" x="19" y="10" width="2" height="12" rx="1" />
        </svg>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      inline-size: 100%;
      block-size: 100%;
      overflow: hidden;
      container-type: size;
      background:
        var(--texture-grain),
        radial-gradient(
          ellipse 38% 16% at 22% 72%,
          color-mix(in oklab, var(--color-pastel-sheet) 70%, transparent),
          transparent
        ),
        radial-gradient(
          ellipse 30% 12% at 78% 30%,
          color-mix(in oklab, var(--color-pastel-sheet) 55%, transparent),
          transparent
        ),
        linear-gradient(to bottom, var(--color-pastel-sky-top), var(--color-pastel-sky-bottom));
    }
    .flyer {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 0;
      inline-size: var(--size-butterfly);
      animation: fly linear infinite;
    }
    svg {
      display: block;
      inline-size: 100%;
      overflow: visible;
      scale: var(--scale);
      rotate: -14deg;
      filter: drop-shadow(0 6px 4px rgb(0 0 0 / 0.08));
    }
    .wing {
      fill: var(--wing);
      stroke: color-mix(in oklab, var(--wing) 70%, var(--color-text));
      stroke-width: 0.8;
      stroke-dasharray: 2 1;
      transform-box: view-box;
      transform-origin: 20px 16px;
      animation: flap var(--flap) var(--ease-in-out) infinite alternate;
    }
    .wing__low {
      opacity: 0.75;
    }
    .wing__spot {
      fill: var(--color-pastel-sheet);
      stroke: none;
    }
    .body {
      fill: var(--color-text);
      opacity: 0.6;
    }
    @keyframes fly {
      from {
        translate: -12cqw calc(var(--y) * 1cqh);
      }
      25% {
        translate: 22cqw calc((var(--y) + var(--climb) * 0.15 + 6) * 1cqh);
      }
      50% {
        translate: 50cqw calc((var(--y) + var(--climb) * 0.5) * 1cqh);
      }
      75% {
        translate: 80cqw calc((var(--y) + var(--climb) * 0.7 - 6) * 1cqh);
      }
      to {
        translate: 112cqw calc((var(--y) + var(--climb)) * 1cqh);
      }
    }
    @keyframes flap {
      to {
        scale: 0.3 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .flyer,
      .wing {
        animation-play-state: paused;
      }
    }
  `,
})
export class AppButterflies {
  /** Always app data (venue name), never random per load. */
  readonly seed = input.required<string>();
  protected readonly flock = computed(() => butterflies(this.seed()));
}
