import { DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';

/** Brand frame of the sign-in screens: bento of brand tiles on the left, the form on a paper card on the right. */
@Component({
  selector: 'app-auth-layout',
  imports: [DecimalPipe],
  template: `
    <div class="brand screen">
      <div class="brand-grid showcase" aria-hidden="true">
        <div class="brand-tile" data-color="cobalt" data-span="2" data-rows="2">
          <span class="brand-label" i18n="@@auth.brand.label">Menuly · digitalni meni</span>
          <p class="brand-tile__headline" i18n="@@auth.brand.headline">
            Meni koji ne mora da se štampa.
          </p>
        </div>
        <div class="brand-tile art" data-rows="2">
          <div class="blocks">
            <span data-color="orange" data-weight="3"></span>
            <span data-color="amber"></span>
            <span data-color="periwinkle"></span>
            <span data-color="cobalt"></span>
            <span data-color="amber" data-weight="2"></span>
          </div>
          <div class="art-caption">
            <p class="ticket__title" i18n="@@auth.brand.ticket">Sto 12</p>
            <hr class="ticket__rule" />
            <div class="ticket__meta">
              <span i18n="@@auth.brand.ticketMeta">Skeniraj QR</span><span>12:04</span>
            </div>
          </div>
        </div>
        <div class="brand-tile" data-color="pink">
          <span class="brand-label" i18n="@@auth.brand.ocrLabel">Uvoz menija</span>
          <span class="brand-tile__caption" i18n="@@auth.brand.ocr"
            >Slikaj papirni meni, a stavke i cene se same upišu.</span
          >
        </div>
        <div class="brand-tile" data-color="amber" data-span="2">
          <span class="brand-label" i18n="@@auth.brand.priceLabel">Cena se menja odmah</span>
          <div class="price-row">
            <span i18n="@@auth.brand.priceItem">Espresso</span
            ><span class="price">{{ 220 | number }} RSD</span>
          </div>
        </div>
      </div>

      <section class="card" data-theme="light">
        <h1 class="display">{{ heading() }}</h1>
        <ng-content />
      </section>
    </div>
  `,
  styles: `
    .screen {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      align-items: center;
      gap: var(--space-6);
      min-block-size: 100dvh;
      padding: var(--space-6);
    }

    .art {
      padding: 0;
    }

    .art .blocks {
      block-size: var(--size-ticket-art);
      flex: none;
    }

    .art-caption {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-5) var(--space-6) var(--space-6);
    }

    .price-row {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      inline-size: 100%;
      max-inline-size: var(--dialog-width);
      justify-self: center;
      padding: var(--space-8);
      background: var(--color-brand-paper);
      color: var(--color-text);
      border-radius: var(--radius-lg);
    }

    @media (max-width: 720px) {
      .screen {
        grid-template-columns: minmax(0, 1fr);
        padding: var(--space-4);
      }

      .showcase {
        display: none;
      }

      .card {
        padding: var(--space-6);
      }
    }
  `,
})
export class AuthLayout {
  readonly heading = input.required<string>();
}
