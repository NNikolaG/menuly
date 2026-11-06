import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppToaster } from './shared/ui/toast/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppToaster],
  template: '<router-outlet /><app-toaster />',
})
export class App {}
