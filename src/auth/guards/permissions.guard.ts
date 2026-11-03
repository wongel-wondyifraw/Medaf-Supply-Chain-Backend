import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesService } from '../../roles/roles.service.js';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || !user.role) {
      return false;
    }

    // Fast-path: Check permissions from validated JWT token directly
    const tokenPermissions = (user as unknown as { permissions?: string[] })
      ?.permissions;
    if (tokenPermissions && tokenPermissions.length > 0) {
      return requiredPermissions.every((permission) =>
        tokenPermissions.includes(permission),
      );
    }

    // Fallback: check database if permissions are missing from token
    try {
      const role = await this.rolesService.findByName(user.role);
      if (!role || !role.permissions) return false;

      return requiredPermissions.every((permission) =>
        role.permissions.includes(permission),
      );
    } catch {
      return false;
    }
  }
}
