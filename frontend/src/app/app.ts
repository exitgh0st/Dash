import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root application component. Hosts the top-level router outlet; the visible
 * chrome (toolbar + responsive sidenav) lives in the AppShell layout that the
 * routes render into.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
