import { RedditAccount } from '@prisma/client';

/**
 * The RedditAccount shape safe to return over the API — everything except the
 * owning `userId` (ownership is derived from the JWT, never echoed to the client).
 */
export interface PublicRedditAccount {
  id: string;
  redditUsername: string;
  status: RedditAccount['status'];
  lastCheckedAt: Date | null;
  createdAt: Date;
}

/**
 * Map a persisted RedditAccount to its public projection.
 * @returns the account without the owning `userId`.
 */
export function toPublicRedditAccount(
  account: RedditAccount,
): PublicRedditAccount {
  return {
    id: account.id,
    redditUsername: account.redditUsername,
    status: account.status,
    lastCheckedAt: account.lastCheckedAt,
    createdAt: account.createdAt,
  };
}
