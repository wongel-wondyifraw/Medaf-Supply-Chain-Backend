import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { RolesService } from '../roles/roles.service.js';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  async onModuleInit() {
    await this.seedRoles();
    await this.seedAdmin();
  }

  private async seedRoles() {
    const defaultRoles = [
      { name: 'Admin', description: 'Full system access and management capabilities' },
      { name: 'Manager', description: 'Manage inventory, orders, and view users' },
      { name: 'Viewer', description: 'Read-only access to the system' },
    ];

    for (const role of defaultRoles) {
      const existing = await this.rolesService.findByName(role.name);
      if (!existing) {
        await this.rolesService.create(role);
        this.logger.log(`Seeded role: ${role.name}`);
      }
    }
  }

  private async seedAdmin() {
    const adminEmail = 'admin@medafsupplychain.com';
    const existing = await this.usersService.findByEmail(adminEmail);

    if (!existing) {
      await this.usersService.create({
        firstName: 'System',
        lastName: 'Admin',
        email: adminEmail,
        password: 'Admin123!',
        role: 'Admin',
        status: 'Active',
      });
      this.logger.log(`Seeded admin user: ${adminEmail}`);
    } else {
      this.logger.log(`Admin user already exists: ${adminEmail}`);
    }
  }
}
