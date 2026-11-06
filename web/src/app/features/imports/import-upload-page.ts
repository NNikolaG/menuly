import { CdkDrag, CdkDropList, moveItemInArray, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideArrowLeftRight,
  LucideCamera,
  LucideChevronLeft,
  LucideChevronRight,
  LucideFileText,
  LucideImagePlus,
  LucideX,
} from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { ImportsApi } from '../../core/imports/imports-api';
import { VenuesApi } from '../../core/venues/venues-api';
import { AppButton } from '../../shared/ui';
import {
  ACCEPT,
  ACCEPT_PHOTO,
  IMPORT_STATUS,
  importError,
  MAX_FILE_BYTES,
  MAX_PAGES,
} from './import-labels';

interface Picked {
  id: number;
  file: File;
  /** Object URL for an image preview; undefined for a PDF. */
  preview?: string;
}

/** `/objekti/:venueId/uvoz`: photograph (or pick) the printed menu, in reading order, and send it to be read. */
@Component({
  selector: 'app-import-upload-page',
  imports: [
    DatePipe,
    RouterLink,
    CdkDropList,
    CdkDrag,
    Toolbar,
    ToolbarWidget,
    AppButton,
    LucideArrowLeft,
    LucideArrowLeftRight,
    LucideCamera,
    LucideChevronLeft,
    LucideChevronRight,
    LucideFileText,
    LucideImagePlus,
    LucideX,
  ],
  template: `
    <div class="stack" data-gap="6">
      <div class="stack" data-gap="2">
        <a appButton variant="ghost" size="sm" [routerLink]="['/objekti', venueId()]" class="back">
          <svg lucideArrowLeft aria-hidden="true"></svg>
          {{ venue.value()?.name }}
        </a>
        <div class="row" data-justify="between">
          <h1 i18n="@@import.pageTitle">Uvoz menija sa slike</h1>
          @if (quota(); as q) {
            <span class="badge" [attr.data-tone]="q.left ? 'info' : 'danger'" i18n="@@import.quota"
              >Iskorišćeno {{ q.used }} od {{ q.limit }}</span
            >
          }
        </div>
        <p class="meta" i18n="@@import.intro">
          Slikaj postojeći meni, a mi pročitamo kategorije, stavke i cene. Pre uvoza sve proveriš i
          ispraviš.
        </p>
      </div>

      <div class="layout">
        <section class="stack" data-gap="4" aria-labelledby="upload-heading">
          <h2 id="upload-heading" class="visually-hidden" i18n="@@import.upload">Fajlovi</h2>

          <div
            class="drop"
            [attr.data-over]="over() ? '' : null"
            (dragover)="$event.preventDefault(); over.set(true)"
            (dragleave)="over.set(false)"
            (drop)="onDrop($event)"
          >
            <div class="row" data-gap="2" data-justify="center">
              <!-- capture opens the back camera on phones; one photo per tap, so it appends. -->
              <label appButton [attr.aria-disabled]="!canUpload() || null">
                <svg lucideCamera aria-hidden="true"></svg>
                <ng-container i18n="@@import.takePhoto">Slikaj stranicu</ng-container>
                <input
                  type="file"
                  class="visually-hidden"
                  capture="environment"
                  [accept]="acceptPhoto"
                  [disabled]="!canUpload()"
                  (change)="onPick($event)"
                />
              </label>
              <label appButton data-variant="secondary" [attr.aria-disabled]="!canUpload() || null">
                <svg lucideImagePlus aria-hidden="true"></svg>
                <ng-container i18n="@@import.pickFiles">Izaberi fajlove</ng-container>
                <input
                  type="file"
                  class="visually-hidden"
                  multiple
                  [accept]="accept"
                  [disabled]="!canUpload()"
                  (change)="onPick($event)"
                />
              </label>
            </div>
            <p class="meta" i18n="@@import.dropHint">
              ili prevuci slike ili PDF ovde · JPEG, PNG, WebP, PDF · do 15 MB · najviše 20 stranica
            </p>
          </div>

          @if (problem()) {
            <p class="alert" role="alert">{{ problem() }}</p>
          }

          @if (files().length) {
            <p id="order-hint" class="meta" i18n="@@import.orderHint">
              Redosled je redosled čitanja: prevuci ili koristi strelice. Preklapanje između slika
              je u redu.
            </p>
            <ol
              class="thumbs"
              cdkDropList
              cdkDropListOrientation="mixed"
              aria-describedby="order-hint"
              (cdkDropListDropped)="drop($event)"
            >
              @for (picked of files(); track picked.id; let i = $index) {
                <li class="thumb" cdkDrag>
                  <span class="thumb__n">{{ i + 1 }}</span>
                  @if (picked.preview) {
                    <img [src]="picked.preview" [alt]="picked.file.name" />
                  } @else {
                    <span class="thumb__pdf">
                      <svg lucideFileText aria-hidden="true"></svg>
                      PDF
                    </span>
                  }
                  <span class="thumb__name">{{ picked.file.name }}</span>
                  <div
                    class="row thumb__actions"
                    data-gap="1"
                    ngToolbar
                    [softDisabled]="false"
                    [attr.aria-label]="pageLabel(i)"
                  >
                    <button
                      appButton
                      ngToolbarWidget
                      variant="ghost"
                      size="sm"
                      type="button"
                      [disabled]="i === 0"
                      [attr.aria-label]="earlierLabel"
                      (click)="move(i, i - 1)"
                    >
                      <svg lucideChevronLeft aria-hidden="true"></svg>
                    </button>
                    <button
                      appButton
                      ngToolbarWidget
                      variant="ghost"
                      size="sm"
                      type="button"
                      [disabled]="i === files().length - 1"
                      [attr.aria-label]="laterLabel"
                      (click)="move(i, i + 1)"
                    >
                      <svg lucideChevronRight aria-hidden="true"></svg>
                    </button>
                    <button
                      appButton
                      ngToolbarWidget
                      variant="ghost"
                      size="sm"
                      type="button"
                      [attr.aria-label]="removeLabel(picked.file.name)"
                      (click)="remove(picked.id)"
                    >
                      <svg lucideX aria-hidden="true"></svg>
                    </button>
                  </div>
                </li>
              }
            </ol>
            <div class="row" data-gap="3">
              <button
                appButton
                type="button"
                [disabled]="sending() || !canUpload()"
                (click)="send()"
              >
                <svg lucideArrowLeftRight aria-hidden="true"></svg>
                @if (sending()) {
                  <ng-container i18n="@@import.sending">Šaljem…</ng-container>
                } @else {
                  <ng-container i18n="@@import.send">Pročitaj meni</ng-container>
                }
              </button>
              <span class="meta" i18n="@@import.fileCount">{files().length, plural,
                one {{{ files().length }} fajl}
                few {{{ files().length }} fajla}
                other {{{ files().length }} fajlova}
              }</span>
            </div>
          }
        </section>

        <aside class="card stack tips" data-gap="2">
          <p class="card__title" i18n="@@import.tipsTitle">Za najbolje čitanje</p>
          <ul class="stack" data-gap="1">
            <li i18n="@@import.tip1">Jedna stranica po slici, cela u kadru.</li>
            <li i18n="@@import.tip2">Dobro svetlo, bez odsjaja i blica.</li>
            <li i18n="@@import.tip3">Slikaj odozgo, da tekst ne bude iskrivljen.</li>
            <li i18n="@@import.tip4">Dugačak meni slikaj iz više delova, redom odozgo nadole.</li>
          </ul>
        </aside>
      </div>

      @if (history(); as items) {
        @if (items.length) {
          <section class="stack" data-gap="3" aria-labelledby="history-heading">
            <h2 id="history-heading" i18n="@@import.history">Ranije</h2>
            <table class="table">
              <thead>
                <tr>
                  <th i18n="@@import.col.date">Datum</th>
                  <th i18n="@@venue.col.status">Status</th>
                  <th i18n="@@import.col.found">Pročitano</th>
                </tr>
              </thead>
              <tbody>
                @for (item of items; track item.id) {
                  <tr>
                    <td>
                      <a [routerLink]="['/uvoz', item.id]">{{
                        item.created_at | date: 'dd.MM.y. HH:mm'
                      }}</a>
                    </td>
                    <td>
                      <span class="badge" [attr.data-tone]="status[item.status].tone">{{
                        status[item.status].label
                      }}</span>
                    </td>
                    <td>
                      @if (item.summary; as s) {
                        <span i18n="@@import.found">{s.items, plural,
                          one {{{ s.items }} stavka}
                          few {{{ s.items }} stavke}
                          other {{{ s.items }} stavki}
                        }</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .back {
      align-self: flex-start;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(14rem, 18rem);
      align-items: start;
      gap: var(--space-8);
    }

    @media (max-width: 960px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .drop {
      display: grid;
      gap: var(--space-3);
      justify-items: center;
      padding: var(--space-8) var(--space-4);
      border: var(--stroke-hairline) dashed var(--color-border-strong);
      border-radius: var(--radius-lg);
      background: var(--color-surface-sunken);
      text-align: center;
    }

    .drop[data-over] {
      border-color: var(--color-accent);
      background: var(--color-surface-hover);
    }

    label[appButton] {
      cursor: pointer;
    }

    label[aria-disabled='true'] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    label:has(input:focus-visible) {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--stroke-focus);
    }

    .thumbs {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .thumb {
      position: relative;
      display: grid;
      gap: var(--space-1);
      padding: var(--space-2);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      cursor: grab;
    }

    .thumb img,
    .thumb__pdf {
      display: grid;
      place-items: center;
      inline-size: 100%;
      aspect-ratio: 3 / 4;
      object-fit: cover;
      border-radius: var(--radius-sm);
      background: var(--color-surface-sunken);
      color: var(--color-text-muted);
      font: var(--type-meta);
    }

    .thumb__n {
      position: absolute;
      inset: var(--space-3) auto auto var(--space-3);
      min-inline-size: 1.5rem;
      padding: 0 var(--space-1);
      border-radius: var(--radius-xs);
      background: var(--color-text);
      color: var(--color-bg);
      font: var(--type-meta);
      text-align: center;
    }

    .thumb__name {
      overflow: hidden;
      font: var(--type-meta);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .thumb__actions {
      justify-content: center;
    }

    .cdk-drag-preview {
      box-shadow: var(--shadow-lg);
    }

    .cdk-drag-placeholder {
      opacity: 0.4;
    }

    .tips ul {
      margin: 0;
      padding-inline-start: var(--space-4);
    }

    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export default class ImportUploadPage {
  private readonly api = inject(ImportsApi);
  private readonly router = inject(Router);

  readonly venueId = input.required<string>();

  protected readonly accept = ACCEPT;
  protected readonly acceptPhoto = ACCEPT_PHOTO;
  protected readonly status = IMPORT_STATUS;
  protected readonly earlierLabel = $localize`:@@import.earlier:Pomeri ranije`;
  protected readonly laterLabel = $localize`:@@import.later:Pomeri kasnije`;

  protected readonly venue = inject(VenuesApi).venueResource(this.venueId);
  protected readonly imports = this.api.listResource(this.venueId);
  protected readonly history = computed(() =>
    this.imports.hasValue() ? this.imports.value()?.items : undefined,
  );
  protected readonly quota = computed(() => {
    const list = this.imports.hasValue() ? this.imports.value() : undefined;
    return list
      ? {
          used: list.imports_used,
          limit: list.import_limit,
          left: list.imports_used < list.import_limit,
        }
      : undefined;
  });
  protected readonly canUpload = computed(() => this.quota()?.left ?? true);

  protected readonly files = signal<Picked[]>([]);
  protected readonly problem = signal('');
  protected readonly sending = signal(false);
  protected readonly over = signal(false);
  private nextId = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.files().forEach(revoke));
  }

  protected pageLabel(index: number): string {
    return $localize`:@@import.pageN:Stranica ${index + 1}:number:`;
  }

  protected removeLabel(name: string): string {
    return $localize`:@@import.removeFile:Ukloni ${name}:name:`;
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.add([...(input.files ?? [])]);
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    if (this.canUpload()) this.add([...(event.dataTransfer?.files ?? [])]);
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.move(event.previousIndex, event.currentIndex);
  }

  protected move(from: number, to: number): void {
    if (from === to) return;
    this.files.update((files) => {
      const next = [...files];
      moveItemInArray(next, from, to);
      return next;
    });
  }

  protected remove(id: number): void {
    const picked = this.files().find((file) => file.id === id);
    if (picked) revoke(picked);
    this.files.update((files) => files.filter((file) => file.id !== id));
  }

  protected async send(): Promise<void> {
    this.problem.set('');
    this.sending.set(true);
    try {
      const created = await firstValueFrom(
        this.api.create(
          this.venueId(),
          this.files().map((picked) => picked.file),
        ),
      );
      await this.router.navigate(['/uvoz', created.id]);
    } catch (error) {
      this.problem.set(importError(toApiError(error).code));
      this.imports.reload();
    } finally {
      this.sending.set(false);
    }
  }

  /** Client-side checks first, so a wrong file fails here and not after the upload. */
  private add(files: File[]): void {
    this.problem.set('');
    const accepted = ACCEPT.split(',');
    const ok: Picked[] = [];
    for (const file of files) {
      if (!accepted.includes(file.type)) {
        this.problem.set(importError('unsupported_file'));
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        this.problem.set(importError('validation_failed'));
        continue;
      }
      ok.push({
        id: this.nextId++,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      });
    }
    const room = MAX_PAGES - this.files().length;
    if (ok.length > room) {
      ok.splice(room).forEach(revoke);
      this.problem.set(importError('validation_failed'));
    }
    this.files.update((current) => [...current, ...ok]);
  }
}

function revoke(picked: Picked): void {
  if (picked.preview) URL.revokeObjectURL(picked.preview);
}
