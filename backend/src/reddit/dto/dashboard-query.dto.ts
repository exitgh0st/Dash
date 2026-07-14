import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { DashboardRangeKey } from '../dashboard-summary';

/**
 * Query params for the dashboard endpoint. `range` selects the week to
 * summarize; omitting it defaults to the current week in the service. The global
 * `ValidationPipe({ whitelist })` strips anything else off the query.
 */
export class DashboardQueryDto {
  /** Which week to summarize — defaults to `this-week` when omitted. */
  @IsOptional()
  @IsIn(['this-week', 'last-week'])
  range?: DashboardRangeKey;

  /**
   * When `true`, bypass the metrics cache and re-poll Reddit synchronously for
   * every in-scope account (a user-triggered "Refresh"). Query params arrive as
   * strings, so coerce `"true"` to a boolean before validation.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  refresh?: boolean;
}
