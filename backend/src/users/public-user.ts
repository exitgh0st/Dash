import { User } from '@prisma/client';

/**
 * The user shape safe to return over the API — everything on `User` except the
 * password hash (and any future secrets).
 */
export interface PublicUser {
  id: string;
  email: string;
  role: User['role'];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Map a persisted User to its public projection.
 * @returns the user without `passwordHash`.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
