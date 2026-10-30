import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { RolesService } from '../roles/roles.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly rolesService: RolesService,
  ) {}

  async validateUser(identifier: string, password: string) {
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'Active') {
      throw new UnauthorizedException(
        'Account is inactive. Contact your administrator.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.usersService.updateLastLogin(user.id);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
  }

  async login(identifier: string, password: string) {
    const user = await this.validateUser(identifier, password);

    const roleObj = await this.rolesService.findByName(user.role);
    const permissions = roleObj ? roleObj.permissions : [];

    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      permissions,
    };

    return {
      user: { ...user, permissions },
      token: this.jwtService.sign(payload),
    };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.usersService.findOne(userId);
    const updated = await this.usersService.update(user.id, {
      firstName: updateProfileDto.firstName,
      lastName: updateProfileDto.lastName,
      ...(updateProfileDto.phone !== undefined
        ? { phone: updateProfileDto.phone }
        : {}),
    });

    const roleObj = await this.rolesService.findByName(updated.role);
    const permissions = roleObj ? roleObj.permissions : [];

    return {
      ...updated,
      permissions,
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );
    if (!isMatch) {
      throw new BadRequestException('Current password does not match');
    }

    await this.usersService.update(userId, {
      password: changePasswordDto.newPassword,
    });

    return { message: 'Password updated successfully' };
  }
}

