import { Menu, MenuContent, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { CdkConnectedOverlay, type ConnectedPosition } from '@angular/cdk/overlay';
import { Component, input, output, viewChild } from '@angular/core';

export interface AppMenuItem {
  value: string;
  label: string;
}

/** Button that opens a list of actions. Keyboard and ARIA from `@angular/aria`, positioning from the CDK. */
@Component({
  selector: 'app-menu',
  imports: [MenuTrigger, Menu, MenuContent, MenuItem, CdkConnectedOverlay],
  template: `
    <button type="button" ngMenuTrigger #origin #trigger="ngMenuTrigger" [menu]="menu()">
      {{ label() }}
    </button>
    <ng-template
      [cdkConnectedOverlay]="{ origin, usePopover: 'inline' }"
      [cdkConnectedOverlayOpen]="trigger.expanded()"
      [cdkConnectedOverlayPositions]="positions"
    >
      <div ngMenu (itemSelected)="onSelected($event)">
        <ng-template ngMenuContent>
          @for (item of items(); track item.value) {
            <div ngMenuItem [value]="item.value">{{ item.label }}</div>
          }
        </ng-template>
      </div>
    </ng-template>
  `,
  styles: `
    [ngMenuItem] {
      cursor: pointer;
    }
  `,
})
export class AppMenu {
  readonly label = input.required<string>();
  readonly items = input.required<readonly AppMenuItem[]>();
  readonly selected = output<string>();

  protected readonly menu = viewChild(Menu<string>);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  ];

  protected onSelected(value: string | undefined): void {
    if (value !== undefined) this.selected.emit(value);
  }
}
