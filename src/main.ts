import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  const isLocal = configService.get<string>('LOCAL') === 'true';
  const configuredOrigins =
    configService.get<string>('FRONTEND_URL') ||
    (isLocal
      ? configService.get<string>('FRONTEND_URL_LOCAL')
      : configService.get<string>('FRONTEND_URL_PRODUCTION'));

  // Support multiple comma-separated origins or default
  let corsOrigin: boolean | string | string[] = true;
  if (configuredOrigins && configuredOrigins !== '*') {
    const origins = configuredOrigins
      .split(',')
      .map((url) => url.trim().replace(/\/$/, ''))
      .filter(Boolean);
    corsOrigin = origins.length === 1 ? origins[0] : origins;
  } else if (!configuredOrigins) {
    corsOrigin = ['http://localhost:3000'];
  }

  // Enable CORS for frontend
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Serve static assets from uploads folder with CORS/CORP headers
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  // Global validation pipe for DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
}
bootstrap().catch((err) => {
  console.error('Application failed to start', err);
  process.exit(1);
});
