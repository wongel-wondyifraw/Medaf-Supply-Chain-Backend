import { Module } from '@nestjs/common';
import { SeedService } from './seed.service.js';
import { UsersModule } from '../users/users.module.js';
import { RolesModule } from '../roles/roles.module.js';

@Module({
  imports: [UsersModule, RolesModule],
  providers: [SeedService],
})
export class SeedModule {}
