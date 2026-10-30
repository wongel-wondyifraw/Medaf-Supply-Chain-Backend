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

  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
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
    let email = createUserDto.email;
    let phone = createUserDto.phone;

    if (createUserDto.identifier) {
      if (createUserDto.identifier.includes('@')) {
        email = email || createUserDto.identifier;
      } else {
        phone = phone || createUserDto.identifier;
      }
    }

    if (!email && !phone) {
      throw new ConflictException(
        'Either email, phone, or identifier must be provided',
      );
    }

    if (email) {
      const existingEmail = await this.usersRepository.findOne({
        where: { email },
      });
      if (existingEmail) {
        throw new ConflictException(
          `User with email "${email}" already exists`,
        );
      }
    }

    if (phone) {
      const existingPhone = await this.usersRepository.findOne({
        where: { phone },
      });
      if (existingPhone) {
        throw new ConflictException(
          `User with phone "${phone}" already exists`,
        );
      }
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { identifier, ...userData } = createUserDto;
    const user = this.usersRepository.create({
      ...userData,
      email,
      phone,
      password: hashedPassword,
    });
    const saved = await this.usersRepository.save(user);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = saved;
    return result as User;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { identifier, ...updateData } = updateUserDto;
    let email = updateData.email;
    let phone = updateData.phone;
    if (identifier) {
      if (identifier.includes('@')) {
        email = email || identifier;
      } else {
        phone = phone || identifier;
      }
    }

    if (email && email !== user.email) {
      const existing = await this.usersRepository.findOne({
        where: { email },
      });
      if (existing) {
        throw new ConflictException(
          `User with email "${email}" already exists`,
        );
      }
    }

    if (phone && phone !== user.phone) {
      const existingPhone = await this.usersRepository.findOne({
        where: { phone },
      });
      if (existingPhone) {
        throw new ConflictException(
          `User with phone "${phone}" already exists`,
        );
      }
    }

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    Object.assign(user, {
      ...updateData,
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
    });
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
