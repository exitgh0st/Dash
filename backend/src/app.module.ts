import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { RedditModule } from './reddit/reddit.module';

/**
 * Root application module.
 *
 * Loads configuration globally and composes the feature modules. Auth is
 * intentionally not wired yet — it arrives as the next feature and will add its
 * own module plus a global JwtAuthGuard here.
 */
@Module({
  imports: [
    // isGlobal so ConfigService is injectable everywhere without re-importing.
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    RedditModule,
    // TODO(auth): import AuthModule here.
  ],
  controllers: [],
  providers: [
    // TODO(auth): register JwtAuthGuard as a global APP_GUARD, opt out via @Public().
  ],
})
export class AppModule {}
