import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/** Metadata key read by RolesGuard. */
export const ROLES_KEY = 'roles';

/**
 * Restrict a route to one or more roles. The role is checked against the
 * verified JWT payload by RolesGuard — never against client-supplied data.
 *
 * @example @Roles('admin')
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
