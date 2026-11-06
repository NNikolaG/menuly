import { Component, inject } from '@angular/core';
import { LucideCircleAlert, LucideCircleCheck, LucideX } from '@lucide/angular';
import { Toaster } from './toaster';

/** Region for `Toaster` toasts; once, in the app root. Polite live region, so screen readers hear each one. */
@Component({
  selector: 'app-toaster',
  imports: [LucideCircleCheck, LucideCircleAlert, LucideX],
  template: `
    <section class="region" aria-live="polite" [attr.aria-label]="label">
      @for (toast of toaster.toasts(); track toast.id) {
        <div
          class="toast"
          [attr.data-tone]="toast.tone"
          animate.enter="toast-enter"
          animate.leave="toast-leave"
          (pointerenter)="toaster.pause(toast.id)"
          (pointerleave)="toaster.resume(toast.id)"
          (focusin)="toaster.pause(toast.id)"
          (focusout)="toaster.resume(toast.id)"
        >
          @if (toast.tone === 'danger') {
            <svg lucideCircleAlert class="icon" aria-hidden="true"></svg>
          } @else {
            <svg lucideCircleCheck class="icon" aria-hidden="true"></svg>
          }
          <span class="message">{{ toast.message }}</span>
          <button
            type="button"
            class="close"
            [attr.aria-label]="closeLabel"
            (click)="toaster.dismiss(toast.id)"
          >
            <svg lucideX aria-hidden="true"></svg>
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    .region {
      position: fixed;
      inset-block-end: var(--space-6);
      inset-inline-end: var(--space-6);
      z-index: var(--z-toast);
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--space-2);
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
    }

    .message {
      flex: 1;
      min-inline-size: 0;
    }

    .toast[data-tone='success'] .icon {
      color: var(--color-success-on-inverse);
    }

    .toast[data-tone='danger'] .icon {
      color: var(--color-danger-on-inverse);
    }

    .close {
      display: grid;
      flex: none;
      place-items: center;
      inline-size: var(--control-sm);
      block-size: var(--control-sm);
      margin-inline-end: calc(var(--space-2) * -1);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: inherit;
      opacity: 0.7;
      cursor: pointer;
      transition: opacity var(--duration-fast) var(--ease-out);
    }

    .close:hover,
    .close:focus-visible {
      opacity: 1;
    }

    .close svg {
      inline-size: var(--size-icon-sm);
      block-size: var(--size-icon-sm);
    }

    /* In from below with ease-out; out faster than in, so it never holds the user up. */
    .toast-enter {
      animation: toast-in var(--duration-slow) var(--ease-out);
    }

    .toast-leave {
      animation: toast-out var(--duration-base) var(--ease-out) forwards;
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        translate: 0 calc(var(--enter-shift) * 2);
        scale: var(--enter-scale);
      }
    }

    @keyframes toast-out {
      to {
        opacity: 0;
        scale: var(--enter-scale);
      }
    }

    @media (max-width: 720px) {
      .region {
        inset-inline: var(--space-4);
        inset-block-end: var(--space-4);
        align-items: stretch;
      }

      .toast {
        inline-size: auto;
      }
    }
  `,
})
export class AppToaster {
  protected readonly toaster = inject(Toaster);
  protected readonly label = $localize`:@@toast.region:Obaveštenja`;
  protected readonly closeLabel = $localize`:@@toast.close:Zatvori obaveštenje`;
}
