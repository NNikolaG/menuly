import { Component, input } from '@angular/core';
import { fold } from '../../shared/text/fold';

export type ArtKind =
  | 'cup'
  | 'cone'
  | 'beer'
  | 'wine'
  | 'cocktail'
  | 'juice'
  | 'pan'
  | 'cake'
  | 'pizza'
  | 'burger'
  | 'salad'
  | 'fish'
  | 'bowl'
  | 'plate';

/** First match wins, so "Topli napici" is a cup before "napici" makes it a juice. Folded, sr + en. */
const KEYWORDS: [ArtKind, RegExp][] = [
  ['cup', /topl|kaf|coffee|espres|kapuc|cappuc|caj|\btea\b|hot drink/],
  ['cone', /sladoled|gelato|ice ?cream/],
  ['beer', /piv|beer|\bale\b|lager/],
  ['wine', /vin|wine/],
  ['cocktail', /koktel|cocktail|zest|rakij|spirit|liker/],
  ['juice', /sok|bezalkohol|juice|soft|limunad|smoothie|napit|drink|voda|water/],
  ['pan', /dorucak|breakfast|jaj|egg|brunch/],
  ['cake', /desert|dezert|dessert|kolac|torta|slatk|palacin|cake|sweet|poslastic/],
  ['pizza', /pizz|\bpic[ae]\b/],
  ['burger', /burger|sendvic|sandwich|tortilj|wrap/],
  ['salad', /salat|salad|vegan|povrc/],
  ['fish', /rib|fish|morsk|seafood|plodovi mora/],
  ['bowl', /corb|sup|soup|past|testenin|rizot|risott|ramen/],
];

/** Which drawing fits a category, from its name; anything else gets a plate. */
export function artKindFor(name: string): ArtKind {
  // Folding makes "pića" (drinks) read as "pica" (pizza), so name the drinks first.
  const text = fold(name.toLowerCase().replaceAll('pić', 'drink'));
  return KEYWORDS.find(([, words]) => words.test(text))?.[0] ?? 'plate';
}

/**
 * Category illustration drawn only from circles, half circles and capsules (Bauhaus poster style),
 * in the venue's accent plus the brand colors. Steam and bubbles loop gently; still with reduced motion.
 */
@Component({
  selector: 'app-category-art',
  host: { class: 'category-art', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 64 64">
      @switch (kind()) {
        @case ('cup') {
          <rect class="steam a-amber" x="22" y="8" width="5" height="13" rx="2.5" />
          <rect class="steam steam--late a-blue" x="32" y="4" width="5" height="16" rx="2.5" />
          <circle class="a-none a-ink-line" cx="46" cy="35" r="6" />
          <path class="a-accent" d="M12 28H46A17 17 0 0 1 12 28Z" />
          <rect class="a-ink" x="6" y="49" width="50" height="6" rx="3" />
        }
        @case ('cone') {
          <path class="a-ink" d="M18 34H46L32 61Z" />
          <circle class="a-pink" cx="22" cy="30" r="10" />
          <circle class="a-teal" cx="42" cy="30" r="10" />
          <circle class="a-accent" cx="32" cy="20" r="12" />
          <circle class="a-amber" cx="32" cy="7" r="3.5" />
        }
        @case ('beer') {
          <rect class="a-none a-ink-line" x="42" y="26" width="10" height="20" rx="5" />
          <rect class="a-amber" x="14" y="18" width="30" height="40" rx="4" />
          <circle class="bubble a-paper" cx="22" cy="48" r="2" />
          <circle class="bubble bubble--late a-paper" cx="33" cy="52" r="2.5" />
          <circle class="a-paper a-ink-line" cx="19" cy="18" r="6" />
          <circle class="a-paper a-ink-line" cx="29" cy="14" r="7.5" />
          <circle class="a-paper a-ink-line" cx="39" cy="18" r="6" />
        }
        @case ('wine') {
          <path class="a-accent" d="M16 10H48A16 16 0 0 1 16 10Z" />
          <rect class="a-ink" x="30" y="25" width="4" height="24" rx="2" />
          <rect class="a-ink" x="20" y="48" width="24" height="6" rx="3" />
          <circle class="a-amber" cx="50" cy="44" r="6" />
        }
        @case ('cocktail') {
          <path class="a-blue" d="M10 12H54L32 37Z" />
          <path class="a-accent" d="M18 19H46L32 36Z" />
          <rect class="a-ink" x="30" y="36" width="4" height="15" rx="2" />
          <rect class="a-ink" x="21" y="50" width="22" height="6" rx="3" />
          <circle class="a-teal" cx="46" cy="10" r="5" />
        }
        @case ('juice') {
          <rect
            class="a-pink"
            x="33"
            y="2"
            width="5"
            height="28"
            rx="2.5"
            transform="rotate(14 35 16)"
          />
          <rect class="a-blue" x="16" y="14" width="26" height="44" rx="4" />
          <rect class="a-accent" x="16" y="30" width="26" height="28" rx="4" />
          <circle class="a-amber" cx="44" cy="18" r="9" />
          <circle class="a-paper" cx="44" cy="18" r="5" />
        }
        @case ('pan') {
          <rect class="a-ink" x="40" y="31" width="22" height="7" rx="3.5" />
          <circle class="a-ink" cx="26" cy="34" r="22" />
          <circle class="a-paper" cx="26" cy="34" r="14" />
          <circle class="a-amber" cx="26" cy="34" r="6.5" />
        }
        @case ('cake') {
          <rect class="a-accent" x="10" y="28" width="44" height="28" rx="4" />
          <rect class="a-pink" x="10" y="39" width="44" height="6" />
          <circle class="a-pink" cx="16" cy="28" r="5" />
          <circle class="a-pink" cx="27" cy="28" r="5" />
          <circle class="a-pink" cx="38" cy="28" r="5" />
          <circle class="a-pink" cx="49" cy="28" r="5" />
          <circle class="a-red" cx="32" cy="17" r="6" />
        }
        @case ('pizza') {
          <path class="a-amber" d="M32 60L8 14A28 28 0 0 1 56 14Z" />
          <path class="a-accent" d="M8 14A28 28 0 0 1 56 14L52.5 20.5A22 22 0 0 0 11.5 20.5Z" />
          <circle class="a-red" cx="26" cy="28" r="4.5" />
          <circle class="a-red" cx="38" cy="30" r="4" />
          <circle class="a-red" cx="32" cy="43" r="3.5" />
        }
        @case ('burger') {
          <path class="a-amber" d="M10 30A22 22 0 0 1 54 30Z" />
          <rect class="a-teal" x="8" y="30" width="48" height="6" rx="3" />
          <rect class="a-ink" x="10" y="36" width="44" height="9" rx="4.5" />
          <rect class="a-amber" x="10" y="45" width="44" height="10" rx="5" />
          <rect class="a-paper" x="22" y="18" width="5" height="2.5" rx="1.25" />
          <rect class="a-paper" x="35" y="15" width="5" height="2.5" rx="1.25" />
        }
        @case ('salad') {
          <circle class="a-teal" cx="22" cy="30" r="9" />
          <circle class="a-teal" cx="36" cy="25" r="10" />
          <circle class="a-red" cx="46" cy="31" r="5.5" />
          <circle class="a-amber" cx="28" cy="34" r="4" />
          <path class="a-blue" d="M6 34H58A26 26 0 0 1 6 34Z" />
        }
        @case ('fish') {
          <path class="a-accent" d="M44 32L60 18V46Z" />
          <path class="a-blue" d="M6 32C14 14 40 14 48 32C40 50 14 50 6 32Z" />
          <circle class="a-ink" cx="17" cy="29" r="3" />
          <circle class="steam a-teal" cx="6" cy="14" r="3.5" />
          <circle class="steam steam--late a-amber" cx="13" cy="6" r="2.5" />
        }
        @case ('bowl') {
          <rect class="steam a-amber" x="20" y="6" width="5" height="13" rx="2.5" />
          <rect class="steam steam--late a-pink" x="30" y="3" width="5" height="16" rx="2.5" />
          <rect class="steam a-blue" x="40" y="6" width="5" height="13" rx="2.5" />
          <rect class="a-ink" x="6" y="25" width="52" height="5" rx="2.5" />
          <path class="a-accent" d="M8 30H56A24 24 0 0 1 8 30Z" />
        }
        @default {
          <rect class="a-ink" x="3" y="14" width="4" height="40" rx="2" />
          <rect class="a-ink" x="57" y="14" width="4" height="40" rx="2" />
          <circle class="a-blue" cx="32" cy="34" r="22" />
          <circle class="a-paper" cx="32" cy="34" r="15" />
          <path class="a-accent" d="M22 36H42A10 10 0 0 1 22 36Z" />
          <circle class="a-amber" cx="30" cy="30" r="5" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      flex: none;
      inline-size: var(--size-category-art);
      block-size: var(--size-category-art);
    }
    svg {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      overflow: visible;
    }
    .a-ink {
      fill: var(--color-text);
    }
    .a-accent {
      fill: var(--color-accent);
    }
    .a-amber {
      fill: var(--color-brand-amber);
    }
    .a-blue {
      fill: var(--color-brand-periwinkle);
    }
    .a-pink {
      fill: var(--color-brand-pink);
    }
    .a-teal {
      fill: var(--color-mosaic-2);
    }
    .a-red {
      fill: var(--color-brand-orange);
    }
    .a-paper {
      fill: var(--color-brand-paper);
    }
    .a-none {
      fill: none;
    }
    .a-ink-line {
      stroke: var(--color-text);
      stroke-width: 3;
    }
    .steam {
      animation: art-steam 2.4s var(--ease-in-out) infinite;
    }
    .bubble {
      animation: art-bubble 2.8s linear infinite;
    }
    .steam--late,
    .bubble--late {
      animation-delay: -1.2s;
    }
    @keyframes art-steam {
      0%,
      100% {
        translate: 0 2px;
        opacity: 0.55;
      }
      50% {
        translate: 0 -3px;
        opacity: 1;
      }
    }
    @keyframes art-bubble {
      from {
        translate: 0 0;
        opacity: 0;
      }
      20% {
        opacity: 1;
      }
      to {
        translate: 0 -26px;
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .steam,
      .bubble {
        animation: none;
      }
    }
  `,
})
export class AppCategoryArt {
  readonly kind = input.required<ArtKind>();
}
