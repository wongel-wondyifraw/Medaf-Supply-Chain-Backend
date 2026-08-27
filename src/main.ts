import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const isLocal = configService.get<string>('LOCAL') === 'true';
  const frontendUrl = isLocal
    ? configService.get<string>('FRONTEND_URL_LOCAL')
    : configService.get<string>('FRONTEND_URL_PRODUCTION');

  // Enable CORS for frontend
  app.enableCors({
    origin: [frontendUrl || 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
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
