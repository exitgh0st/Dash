import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Optional date-range bounds for the comments endpoint. Both are ISO-8601
 * instants; omit either (or both) to leave that side of the range unbounded.
 * The global `ValidationPipe({ whitelist })` strips anything else off the query.
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
}
