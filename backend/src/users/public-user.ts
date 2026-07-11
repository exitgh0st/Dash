import { User } from '@prisma/client';

/**
 * The user shape safe to return over the API — everything on `User` except the
 * password hash (and any future secrets).
 */
export interface PublicUser {
  id: string;
  email: string;
  role: User['role'];
  /** Per-account weekly comment target; the admin edit dialog prefills from it. */
  weeklyCommentQuota: number;
  /** Per-account weekly post target; the admin edit dialog prefills from it. */
  weeklyPostQuota: number;
  createdAt: Date;
  updatedAt: Date;
  /** Number of Reddit accounts the user owns. Only set on the admin list. */
  redditAccountCount?: number;
}

/**
 * Map a persisted User to its public projection.
 * @param redditAccountCount owned-account count to attach (admin list only);
 *   omit for auth responses so the field stays absent there.
 * @returns the user without `passwordHash`.
 */
export function toPublicUser(
  user: User,
  redditAccountCount?: number,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    weeklyCommentQuota: user.weeklyCommentQuota,
    weeklyPostQuota: user.weeklyPostQuota,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(redditAccountCount === undefined ? {} : { redditAccountCount }),
  };
}
