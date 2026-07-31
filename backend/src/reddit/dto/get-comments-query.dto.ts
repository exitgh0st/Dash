import { IsISO8601, IsOptional, Matches } from 'class-validator';

// A Reddit "fullname" cursor, e.g. t1_l8xk29b — a kind prefix plus a base-36 id.
const REDDIT_FULLNAME = /^t[0-9]_[a-z0-9]+$/i;

/**
 * Optional date-range bounds and paging cursor for the comments endpoint. The
 * dates are ISO-8601 instants; omit either (or both) to leave that side of the
 * range unbounded. The global `ValidationPipe({ whitelist })` strips anything
 * else off the query.
 */
export class GetCommentsQueryDto {
  /** Inclusive lower bound — only comments posted at/after this instant. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Inclusive upper bound — only comments posted at/before this instant. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Cursor from a previous response's `after` — resumes the listing there so the
   * caller receives strictly older comments. Shape-validated so a malformed
   * cursor fails here rather than confusing Reddit into returning page 1 again.
   */
  @IsOptional()
  @Matches(REDDIT_FULLNAME, {
    message: 'after must be a Reddit fullname, e.g. t1_abc123',
  })
  after?: string;
}
