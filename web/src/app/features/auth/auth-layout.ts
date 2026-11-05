import { DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { AppPattern } from '../../shared/ui';

/** Brand frame of the sign-in screens: bento of brand tiles on the left, the form on a paper card on the right. */
@Component({
  selector: 'app-auth-layout',
  imports: [DecimalPipe, AppPattern],
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
          <div class="art-pattern">
            <app-pattern seed="Menuly" [cols]="4" [rows]="2" [fluid]="true" />
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

    .art-pattern {
      display: grid;
      place-items: center;
      flex: none;
      block-size: var(--size-ticket-art);
      container-type: size;
      background: var(--color-brand-ink);
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
