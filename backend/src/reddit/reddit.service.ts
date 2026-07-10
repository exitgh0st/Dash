import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Single choke point for all Reddit API access.
 *
 * Every Reddit call in Dash goes through this service — controllers never talk
 * to Reddit directly. It owns (once implemented) global rate limiting, per
 * account token refresh, and error normalization.
 *
 * Scaffold stage: only config plumbing exists; the HTTP client and quota logic
 * arrive with the Reddit-linking feature.
 */
@Injectable()
export class RedditService {
  // Base URL for authenticated Reddit API calls.
  private readonly apiBaseUrl = 'https://oauth.reddit.com';

  constructor(private readonly config: ConfigService) {}

  // TODO(reddit): construct an axios instance with the required User-Agent
  //   header (Reddit rejects requests without a descriptive one) and the
  //   per-account bearer token obtained from the refresh-token flow.
  //
  // TODO(reddit): implement a single global token-bucket throttle (60 req/min
  //   per OAuth client) and honor X-Ratelimit-Remaining / X-Ratelimit-Reset.
  //
  // TODO(reddit): exchange authorization codes for refresh tokens on link, and
  //   refresh access tokens on demand. Never log or return a refresh token.
}
