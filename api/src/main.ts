import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The API is only reachable through nginx (one hop), so take the client IP
  // from X-Forwarded-For — otherwise per-IP throttling keys on nginx's address
  app.set('trust proxy', 1);

  // Increase body size limit to support base64-encoded image uploads in the OCR test endpoint
  app.use(require('express').json({ limit: '10mb' }));

  // Security headers
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Cookie parser (for httpOnly refresh token cookie)
  app.use(cookieParser());

  // Global validation pipe — strip unknown fields, whitelist only declared
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — allow only the frontend origin
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Global API prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api/v1`);
}

bootstrap();
