import { Module } from '@nestjs/common';
import { RedditController } from './reddit.controller';
import { RedditService } from './reddit.service';
import { RedditAccountsService } from './reddit-accounts.service';

/**
 * Reddit integration module. Exports RedditService so quota-tracking features can
 * inject the single shared-token Reddit client.
 */
@Module({
  controllers: [RedditController],
  providers: [RedditService, RedditAccountsService],
  exports: [RedditService],
})
export class RedditModule {}
