import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Request body for `POST /api/reddit/accounts` — the username of a Reddit account
 * a shiller wants to track. Accepts an optional `u/` or `/u/` prefix; the pattern
 * enforces Reddit's handle rules (3–20 chars of letters, digits, `_` or `-`).
 */
export class AddRedditAccountDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:\/?u\/)?[A-Za-z0-9_-]{3,20}$/, {
    message: 'redditUsername must be a valid Reddit username.',
  })
  redditUsername!: string;
}
