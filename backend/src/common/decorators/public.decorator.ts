import { SetMetadata } from '@nestjs/common';

/** Metadata key read by the (future) global JwtAuthGuard to skip auth. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as publicly accessible, opting it out of the global JWT guard.
 * Intended for `/api/auth/*` routes once auth lands.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
