import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { RolesModule } from './roles/roles.module.js';
import { AuthModule } from './auth/auth.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { SeedModule } from './seed/seed.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isLocal = configService.get<string>('LOCAL') === 'true';

        return {
          type: 'postgres' as const,
          ...(isLocal
            ? {
                host: configService.get<string>('DB_HOST', 'localhost'),
                port: configService.get<number>('DB_PORT', 5432),
                username: configService.get<string>('DB_USERNAME', 'postgres'),
                password: configService.get<string>('DB_PASSWORD', ''),
                database: configService.get<string>('DB_NAME', 'medaf_supply_chain'),
                ssl: false,
              }
            : {
                url: configService.get<string>('DATABASE_URL'),
                ssl: { rejectUnauthorized: false },
              }),
          autoLoadEntities: true,
          synchronize: true, // Auto-create tables (dev only)
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
    RolesModule,
    AuthModule,
    InvitationsModule,
    SeedModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
