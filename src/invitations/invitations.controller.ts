import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { RegisterViaInviteDto } from './dto/register-via-invite.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('api/invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createInvitationDto: CreateInvitationDto, @Request() req: AuthenticatedRequest) {
    return this.invitationsService.create(createInvitationDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.invitationsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.invitationsService.revoke(id);
  }

  // Public Endpoints
  @Get(':token/validate')
  validate(@Param('token') token: string) {
    return this.invitationsService.validate(token);
  }

  @Post(':token/register')
  register(
    @Param('token') token: string,
    @Body() registerDto: RegisterViaInviteDto,
  ) {
    return this.invitationsService.register(token, registerDto);
  }
}
