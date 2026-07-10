import { IsJWT, IsNotEmpty, IsString } from 'class-validator';

/** Request body for `POST /api/auth/refresh` and `POST /api/auth/logout`. */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken!: string;
}
