// Anchor all Date math (especially the weekly karma baseline's `weekStart`) to UTC
// so the hosted server and any local dev machine agree on week boundaries — without
// this, a UTC+8 dev box computes a different Monday and reads/writes a different
// KarmaSnapshot than production. Node applies process.env.TZ to subsequent Date
// operations, and this runs before any request. An explicit OS/shell/.env TZ wins.
process.env.TZ = process.env.TZ ?? 'UTC';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Application entry point.
 *
 * Wires the global conventions every Dash route relies on: an `/api` prefix,
 * strict DTO validation, and CORS for the Angular dev origin. Port is read from
 * config so it can be overridden per environment.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // All routes are served under /api (CLAUDE.md global rule).
  app.setGlobalPrefix('api');

  // whitelist strips unknown props; transform coerces payloads into DTO types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Allow the Angular dev server to call the API during local development.
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:4200'),
    credentials: true,
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}
// void: bootstrap owns its own lifecycle; nothing awaits it at module scope.
void bootstrap();
