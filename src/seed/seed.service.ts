import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { UsersService } from '../users/users.service.js';
import { RolesService } from '../roles/roles.service.js';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedRoles();
    await this.seedAdmin();
  }

  private async seedRoles() {
    const candidatePaths = [
      path.join(process.cwd(), 'dist', 'permissions', 'permissions-catalog.json'),
      path.join(process.cwd(), 'src', 'permissions', 'permissions-catalog.json'),
      path.join(__dirname, '..', 'permissions', 'permissions-catalog.json'),
    ];
    let allPermissions: string[] = [];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const catalogData = JSON.parse(fs.readFileSync(p, 'utf8')) as {
            permissions: Array<{ key: string; label: string; group: string }>;
          };
          allPermissions = catalogData.permissions.map((item) => item.key);
          break;
        } catch (e) {
          this.logger.error(`Failed to parse permissions catalog at ${p}`, e);
        }
      }
    }

    const defaultRoles = [
      {
        name: 'Admin',
        description: 'Full system access and management capabilities',
        permissions: allPermissions,
      },
      {
        name: 'Manager',
        description: 'Manage inventory, orders, and view users',
        permissions: allPermissions.filter(
          (p) => !['users.delete', 'roles.manage'].includes(p),
        ),
      },
      {
        name: 'Viewer',
        description: 'Read-only access to the system',
        permissions: allPermissions.filter((p) => p.endsWith('.view')),
      },
      {
        name: 'Merchant',
        description: 'Manage sales and customer orders',
        permissions: [
          'orders.view',
          'orders.items.confirm',
          'orders.approvals.view',
        ],
      },
      {
        name: 'Receiver',
        description: 'Handle incoming shipments and goods receipts',
        permissions: [
          'orders.view',
          'orders.items.confirm',
          'orders.approvals.view',
        ],
      },
      {
        name: 'Store Keeper',
        description: 'Manage physical inventory and warehouse operations',
        permissions: [
          'orders.view',
          'orders.items.confirm',
          'inventory.view',
          'orders.approvals.view',
        ],
      },
    ];

    for (const role of defaultRoles) {
      const existing = await this.rolesService.findByName(role.name);
      if (!existing) {
        await this.rolesService.create(role);
        this.logger.log(`Seeded role: ${role.name}`);
      } else {
        // ALWAYS update permissions to ensure they stay in sync with the code
        await this.rolesService.update(existing.id, {
          permissions: role.permissions,
        });
        this.logger.log(`Updated permissions for role: ${role.name}`);
      }
    }
  }

  private async seedAdmin() {
    const adminEmail = this.configService.get<string>(
      'ADMIN_EMAIL',
      'admin@medafsupplychain.com',
    );
    const adminPassword = this.configService.get<string>(
      'ADMIN_PASSWORD',
      'Admin123!',
    );
    const adminFirstName = this.configService.get<string>(
      'ADMIN_FIRST_NAME',
      'System',
    );
    const adminLastName = this.configService.get<string>(
      'ADMIN_LAST_NAME',
      'Admin',
    );

    const existing = await this.usersService.findByIdentifier(adminEmail);

    if (!existing) {
      await this.usersService.create({
        firstName: adminFirstName,
        lastName: adminLastName,
        email: adminEmail,
        password: adminPassword,
        role: 'Admin',
        status: 'Active',
      });
      this.logger.log(`Seeded admin user from env: ${adminEmail}`);
    } else {
      // Ensure existing user has Admin role and is active, and synchronize password from env
      await this.usersService.update(existing.id, {
        role: 'Admin',
        status: 'Active',
        ...(adminPassword ? { password: adminPassword } : {}),
      });
      this.logger.log(`Synchronized admin user from env: ${adminEmail}`);
    }
  }
}
