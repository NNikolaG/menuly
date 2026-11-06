import { Menu, MenuContent, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { CdkConnectedOverlay, type ConnectedPosition } from '@angular/cdk/overlay';
import { Component, input, output, viewChild } from '@angular/core';
import { LucideChevronDown, LucideDynamicIcon, type LucideIcon } from '@lucide/angular';

export interface AppMenuItem {
  value: string;
  label: string;
  icon?: LucideIcon;
}

/** Button that opens a list of actions. Keyboard and ARIA from `@angular/aria`, positioning from the CDK. */
@Component({
  selector: 'app-menu',
  imports: [
    MenuTrigger,
    Menu,
    MenuContent,
    MenuItem,
    CdkConnectedOverlay,
    LucideChevronDown,
    LucideDynamicIcon,
  ],
  template: `
    <button
      type="button"
      class="trigger"
      ngMenuTrigger
      #origin
      #trigger="ngMenuTrigger"
      [menu]="menu()"
      [attr.aria-label]="icon() && compact() ? label() : null"
      [attr.title]="icon() && compact() ? label() : null"
    >
      @if (icon(); as triggerIcon) {
        <svg [lucideIcon]="triggerIcon" class="icon"></svg>
      }
      @if (!(icon() && compact())) {
        <span class="label">{{ label() }}</span>
        <svg lucideChevronDown class="chevron"></svg>
      }
    </button>
    <ng-template
      [cdkConnectedOverlay]="{ origin, usePopover: 'inline' }"
      [cdkConnectedOverlayOpen]="trigger.expanded()"
      [cdkConnectedOverlayPositions]="above() ? positionsAbove : positions"
    >
      <div ngMenu class="panel" (itemSelected)="onSelected($event)">
        <ng-template ngMenuContent>
          @for (item of items(); track item.value) {
            <div ngMenuItem class="item" [value]="item.value">
              @if (item.icon) {
                <svg [lucideIcon]="item.icon"></svg>
              }
              {{ item.label }}
            </div>
          }
        </ng-template>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      min-inline-size: 0;
    }

    .trigger {
      display: inline-flex;
      max-inline-size: 100%;
      align-items: center;
      gap: var(--space-2);
      block-size: var(--control-md);
      padding-inline: var(--space-3);
      border: var(--stroke-hairline) solid transparent;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-text);
      font: var(--type-body-strong);
      cursor: pointer;
      transition: background-color var(--duration-fast);
    }

    .trigger:hover,
    .trigger[aria-expanded='true'] {
      background: var(--color-surface-hover);
    }

    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .icon {
      flex: none;
      inline-size: var(--size-icon);
      block-size: var(--size-icon);
      color: var(--color-text-muted);
    }

    .chevron {
      flex: none;
      margin-inline-start: auto;
      inline-size: var(--size-icon-sm);
      block-size: var(--size-icon-sm);
      color: var(--color-text-muted);
      transition: rotate var(--duration-base);
    }

    .trigger[aria-expanded='true'] .chevron {
      rotate: 180deg;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-half);
      min-inline-size: var(--menu-min-width);
      padding: var(--space-1);
      background: var(--color-surface-raised);
      color: var(--color-text);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
    }

    .item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-block-size: var(--size-nav-item);
      padding-inline: var(--space-3);
      border-radius: var(--radius-sm);
      font: var(--type-body);
      cursor: pointer;
      outline: none;
    }

    .item svg {
      inline-size: var(--size-icon);
      block-size: var(--size-icon);
      color: var(--color-text-muted);
    }

    .item:hover,
    .item[data-active='true'] {
      background: var(--color-surface-hover);
    }

    .item:focus-visible {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: calc(var(--stroke-focus) * -1);
    }
  `,
})
export class AppMenu {
  readonly label = input.required<string>();
  readonly items = input.required<readonly AppMenuItem[]>();
  /** Shown before the label, or alone when `compact` (the label then becomes the accessible name). */
  readonly icon = input<LucideIcon>();
  readonly compact = input(false);
  /** Open upwards first, for a trigger at the bottom of the screen (sidebar footer). */
  readonly above = input(false);
  readonly selected = output<string>();

  protected readonly menu = viewChild(Menu<string>);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];

  protected readonly positionsAbove: ConnectedPosition[] = [
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  ];

  protected onSelected(value: string | undefined): void {
    if (value !== undefined) this.selected.emit(value);
  }
}
