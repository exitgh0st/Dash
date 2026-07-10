import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * Request body for `POST /api/users` (admin creates a shiller). Role is fixed to
 * `shiller` server-side, so it is intentionally not accepted from the client —
 * additional admins are created only via the seed script.
 */
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
