import { Directive } from '@angular/core';

/** Native checkbox shown as an on/off switch; works with `[formField]` on a boolean. Wrap it in a `<label>` with its text. */
@Directive({
  selector: 'input[type=checkbox][appSwitch]',
  host: { role: 'switch' },
})
export class AppSwitch {}
