import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Role } from './entities/role.entity.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  getPermissionsCatalog(): Array<{ key: string; label: string; group: string }> {
    const catalogPath = path.join(
      process.cwd(),
      'src',
      'permissions',
      'permissions-catalog.json',
    );
    try {
      const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
        permissions: Array<{ key: string; label: string; group: string }>;
      };
      return catalogData.permissions;
    } catch (e) {
      this.logger.error('Failed to load permissions catalog', e);
      return [];
    }
  }

  async findAll(): Promise<Role[]> {
    return this.rolesRepository.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.rolesRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }
    return role;
  }

  async findByName(name: string): Promise<Role | null> {
    return this.rolesRepository.findOne({ where: { name } });
  }

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    const existing = await this.rolesRepository.findOne({
      where: { name: createRoleDto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Role with name "${createRoleDto.name}" already exists`,
      );
    }
    const role = this.rolesRepository.create(createRoleDto);
    return this.rolesRepository.save(role);
  }

  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);

    if (updateRoleDto.name && updateRoleDto.name !== role.name) {
      const existing = await this.rolesRepository.findOne({
        where: { name: updateRoleDto.name },
      });
      if (existing) {
        throw new ConflictException(
          `Role with name "${updateRoleDto.name}" already exists`,
        );
      }
    }

    Object.assign(role, updateRoleDto);
    return this.rolesRepository.save(role);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    await this.rolesRepository.remove(role);
  }
}
