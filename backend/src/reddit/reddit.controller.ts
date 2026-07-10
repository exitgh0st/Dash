import { Controller } from '@nestjs/common';
import { RedditService } from './reddit.service';

/**
 * HTTP surface for Reddit account linking (served under /api/reddit).
 *
 * Scaffold stage: no handlers yet. The OAuth callback and account-link routes
 * are added with the Reddit-linking feature.
 */
@Controller('reddit')
export class RedditController {
  constructor(private readonly redditService: RedditService) {}

  // TODO(reddit): @Public() GET 'callback' — handle the OAuth authorization-code
  //   redirect (REDDIT_REDIRECT_URI), exchange the code for a refresh token,
  //   and persist an encrypted RedditAccount for the linking shiller.
}
