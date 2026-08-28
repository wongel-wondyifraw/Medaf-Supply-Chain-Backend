import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user;
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: [{ email: identifier }, { phone: identifier }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        password: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    if (!createUserDto.email && !createUserDto.phone) {
      throw new ConflictException('Either email or phone must be provided');
    }

    if (createUserDto.email) {
      const existingEmail = await this.usersRepository.findOne({
        where: { email: createUserDto.email },
      });
      if (existingEmail) {
        throw new ConflictException(
          `User with email "${createUserDto.email}" already exists`,
        );
      }
    }

    if (createUserDto.phone) {
      const existingPhone = await this.usersRepository.findOne({
        where: { phone: createUserDto.phone },
      });
      if (existingPhone) {
        throw new ConflictException(
          `User with phone "${createUserDto.phone}" already exists`,
        );
      }
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    const saved = await this.usersRepository.save(user);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = saved;
    return result as User;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existing = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existing) {
        throw new ConflictException(
          `User with email "${updateUserDto.email}" already exists`,
        );
      }
    }

    const phoneUpdate = (updateUserDto as { phone?: string }).phone;
    if (phoneUpdate && phoneUpdate !== user.phone) {
      const existingPhone = await this.usersRepository.findOne({
        where: { phone: phoneUpdate },
      });
      if (existingPhone) {
        throw new ConflictException(
          `User with phone "${phoneUpdate}" already exists`,
        );
      }
    }

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }
}
