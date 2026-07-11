import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  AccountComments,
  RedditAccountsService,
} from './reddit-accounts.service';
import { AddRedditAccountDto } from './dto/add-reddit-account.dto';
import { GetCommentsQueryDto } from './dto/get-comments-query.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardSummary } from './dashboard-summary';
import { PublicRedditAccount } from './public-reddit-account';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * HTTP surface for a shiller's tracked Reddit accounts (served under /api/reddit).
 *
 * Thin controller: it validates/extracts input and delegates to
 * RedditAccountsService. All routes are shiller-only.
 */
@Controller('reddit')
export class RedditController {
  constructor(private readonly accounts: RedditAccountsService) {}

  /**
   * Role-scoped dashboard summary for a week: KPIs + per-account comment counts,
   * karma and status. Admins get every account (with owner email); a shiller gets
   * only their own.
   */
  @Get('dashboard')
  @Roles('admin', 'shiller')
  async dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardSummary> {
    return this.accounts.getDashboard(user, query.range);
  }

  /** Track a new Reddit account by username for the current shiller. */
  @Post('accounts')
  @Roles('shiller')
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddRedditAccountDto,
  ): Promise<PublicRedditAccount> {
    return this.accounts.addAccount(user.userId, dto.redditUsername);
  }

  /** List the current shiller's tracked Reddit accounts. */
  @Get('accounts')
  @Roles('shiller')
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicRedditAccount[]> {
    return this.accounts.listForUser(user.userId);
  }

  /** List a specific shiller's tracked accounts (admin drill-down from /shillers). */
  @Get('users/:userId/accounts')
  @Roles('admin')
  async listForUser(
    @Param('userId') userId: string,
  ): Promise<PublicRedditAccount[]> {
    return this.accounts.listForUser(userId);
  }

  /**
   * Fetch an account's comments, newest-first, optionally within a date range.
   * Admins may read any account; a shiller may read only their own (else 404).
   */
  @Get('accounts/:accountId/comments')
  @Roles('admin', 'shiller')
  async comments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId') accountId: string,
    @Query() query: GetCommentsQueryDto,
  ): Promise<AccountComments> {
    return this.accounts.getAccountComments(user, accountId, query);
  }

  /** Stop tracking one of the current shiller's Reddit accounts. */
  @Delete('accounts/:id')
  @Roles('shiller')
  @HttpCode(204)
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.accounts.unlink(user.userId, id);
  }
}
