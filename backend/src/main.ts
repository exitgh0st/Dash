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
