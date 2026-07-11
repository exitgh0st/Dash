import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Request body for `PATCH /api/users/:id` (admin edits a shiller). Every field
 * is optional so an admin can change just the email, just the password, the
 * weekly quotas, or any combination. Role is intentionally not editable here —
 * it stays `shiller`.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  // Only validated when provided; a blank/absent password leaves it unchanged.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Per-account weekly comment target; 0 disables the comment-quota bar.
  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyCommentQuota?: number;

  // Per-account weekly post target; 0 disables the post-quota bar.
  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyPostQuota?: number;
}
