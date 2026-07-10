import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Attaches the access token to outgoing API requests and transparently recovers
 * from an expired token: on a 401 it refreshes once and retries the original
 * request. If the refresh also fails, the session is cleared and the user is
 * sent to /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // login/refresh carry their own credentials in the body — never add a bearer.
  const isAuthEndpoint =
    req.url.includes('/auth/login') || req.url.includes('/auth/refresh');

  const accessToken = auth.accessToken;
  const authReq =
    accessToken && !isAuthEndpoint
      ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
      : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only attempt recovery for genuine token expiry on protected endpoints.
      if (error.status !== 401 || isAuthEndpoint || !auth.refreshToken) {
        return throwError(() => error);
      }
      // Refresh once, then replay the original request with the new token.
      return auth.refresh().pipe(
        switchMap((res) =>
          next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${res.accessToken}` },
            }),
          ),
        ),
        catchError((refreshError: unknown) => {
          // Refresh failed → session is dead; force a clean re-login.
          auth.clearSession();
          void router.navigate(['/login']);
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
