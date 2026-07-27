import { IsIn, IsOptional } from 'class-validator';
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
}
