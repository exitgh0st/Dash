import { Module } from '@nestjs/common';
import { RedditController } from './reddit.controller';
import { RedditService } from './reddit.service';

/**
 * Reddit integration module. Exports RedditService so quota-tracking features
 * can inject the single rate-limited Reddit client.
 */
@Module({
  controllers: [RedditController],
  providers: [RedditService],
  exports: [RedditService],
})
export class RedditModule {}
