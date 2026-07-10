import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { RedditModule } from './reddit/reddit.module';
import { AuthModule } from './auth/auth.module';

/**
 * Root application module.
 *
 * Loads configuration globally and composes the feature modules. AuthModule
 * registers the global JwtAuthGuard + RolesGuard, so every route is protected by
 * default (opt out with `@Public()`).
 */
@Module({
  imports: [
    // isGlobal so ConfigService is injectable everywhere without re-importing.
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    RedditModule,
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
