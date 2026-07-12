import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * In-app user guide. A plain-language walkthrough of every Dash screen, rendered
 * inside the shell with the app's own visual primitives so it reads as a native
 * page rather than an embedded document.
 *
 * Role-aware: a Reddit Manager sees the shared intro plus the manager sections;
 * an admin additionally sees the admin-only section. The route itself is open to
 * both roles — this only gates which sections render.
 */
@Component({
  selector: 'app-guide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './guide.component.html',
  styleUrl: './guide.component.scss',
})
export class GuideComponent {
  private readonly auth = inject(AuthService);

  /** Gates the admin-only section of the guide. */
  readonly isAdmin = computed(() => this.auth.role() === 'admin');

  /** On-screen role label, mirroring the shell footer ("Reddit Manager"/"Admin"). */
  readonly roleLabel = computed(() =>
    this.auth.role() === 'admin' ? 'Admin' : 'Reddit Manager',
  );
}
