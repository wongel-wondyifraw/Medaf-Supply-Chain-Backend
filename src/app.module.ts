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
import { User } from './users/entities/user.entity.js';
import { Role } from './roles/entities/role.entity.js';
import { Invitation } from './invitations/entities/invitation.entity.js';
import { Order } from './orders/entities/order.entity.js';
import { OrderItem } from './orders/entities/order-item.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isLocal = configService.get<string>('LOCAL') === 'true';
        const databaseUrl = configService.get<string>('DATABASE_URL');
        let dbHost = configService.get<string>('DB_HOST', 'localhost');
        if (dbHost === 'localhost') {
          // On Linux / cPanel, 127.0.0.1 prevents IPv6 (::1) ECONNREFUSED
          dbHost = '127.0.0.1';
        }
        const dbPort = Number(configService.get<number>('DB_PORT', 5432));
        const dbUsername = configService.get<string>('DB_USERNAME', 'postgres');
        const dbPassword = configService.get<string>('DB_PASSWORD', '');
        const dbName = configService.get<string>('DB_NAME', 'medaf_supply_chain');
        const dbSsl = configService.get<string>('DB_SSL');

        // Determine SSL mode:
        // - Explicit DB_SSL takes precedence ('true' or 'false')
        // - Otherwise: enable SSL if DATABASE_URL specifies require or for remote non-local hosts
        // - Default to false for cPanel localhost / 127.0.0.1
        let sslConfig: boolean | { rejectUnauthorized: boolean } = false;
        if (dbSsl === 'true') {
          sslConfig = { rejectUnauthorized: false };
        } else if (dbSsl === 'false') {
          sslConfig = false;
        } else if (
          databaseUrl &&
          (databaseUrl.includes('sslmode=require') ||
            (!isLocal && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1')))
        ) {
          sslConfig = { rejectUnauthorized: false };
        } else if (!isLocal && dbHost !== 'localhost' && dbHost !== '127.0.0.1') {
          sslConfig = { rejectUnauthorized: false };
        }

        // In local development, prioritize explicit DB_HOST / DB_PASSWORD credentials.
        // In production / cPanel, use DATABASE_URL if present, otherwise fallback to DB_HOST / DB_PASSWORD.
        const useDatabaseUrl = !isLocal && !!databaseUrl;

        const connectionConfig = useDatabaseUrl
          ? {
              url: databaseUrl,
              ssl: sslConfig,
            }
          : {
              host: dbHost,
              port: dbPort,
              username: dbUsername,
              password: dbPassword,
              database: dbName,
              ssl: sslConfig,
            };

        return {
          type: 'postgres' as const,
          ...connectionConfig,
          entities: [User, Role, Invitation, Order, OrderItem],
          autoLoadEntities: true,
          synchronize:
            configService.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
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
