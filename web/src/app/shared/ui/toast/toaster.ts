import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'danger';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/** How long a toast stays when nobody points at it. */
const DURATION_MS = 4000;
/** More than this and the oldest goes first; a stack of toasts is noise. */
const MAX = 3;

/**
 * Short confirmations that outlive the page that caused them (saved, then navigated away).
 * Errors that need fixing stay inline next to the form, never in a toast.
 */
@Injectable({ providedIn: 'root' })
export class Toaster {
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly list = signal<readonly Toast[]>([]);
  readonly toasts = this.list.asReadonly();

  show(message: string, tone: ToastTone = 'success'): void {
    const toast: Toast = { id: this.nextId++, message, tone };
    const next = [...this.list(), toast];
    for (const old of next.slice(0, Math.max(0, next.length - MAX))) this.dismiss(old.id);
    this.list.update((list) => [...list, toast]);
    this.resume(toast.id);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.list.update((list) => list.filter((toast) => toast.id !== id));
  }

  /** Hover or focus holds the toast so it can be read. */
  pause(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  resume(id: number): void {
    this.pause(id);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), DURATION_MS),
    );
  }
}
