import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Invitation } from './entities/invitation.entity.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { RegisterViaInviteDto } from './dto/register-via-invite.dto.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from '../auth/auth.service.js';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    createInvitationDto: CreateInvitationDto,
    createdByUserId: string,
  ) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const invitation = this.invitationsRepository.create({
      token,
      role: createInvitationDto.role,
      createdBy: createdByUserId,
      expiresAt,
    });

    await this.invitationsRepository.save(invitation);

    // Construct the link using environment variable
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return {
      token,
      link: `${frontendUrl}/invite/${token}`,
    };
  }

  async findAll() {
    return this.invitationsRepository.find({ order: { createdAt: 'DESC' } });
  }

  async validate(token: string) {
    const invitation = await this.invitationsRepository.findOne({
      where: { token },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== 'pending') {
      throw new BadRequestException('Invitation is no longer valid');
    }
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await this.invitationsRepository.save(invitation);
      throw new BadRequestException('Invitation has expired');
    }

    return {
      valid: true,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  async register(token: string, registerDto: RegisterViaInviteDto) {
    const validationResult = await this.validate(token);
    const invitation = await this.invitationsRepository.findOne({
      where: { token },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');

    const user = await this.usersService.create({
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      email: registerDto.email,
      password: registerDto.password,
      role: validationResult.role,
      status: 'Active',
    });

    invitation.status = 'used';
    invitation.usedBy = user.id;
    invitation.usedAt = new Date();
    await this.invitationsRepository.save(invitation);

    return this.authService.login(registerDto.email, registerDto.password);
  }

  async revoke(id: string) {
    const invitation = await this.invitationsRepository.findOne({
      where: { id },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== 'pending') {
      throw new BadRequestException(
        'Cannot revoke an invitation that is not pending',
      );
    }
    invitation.status = 'revoked';
    await this.invitationsRepository.save(invitation);
  }
}
