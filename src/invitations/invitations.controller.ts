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
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('api/invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post()
  @RequirePermissions('invitations.manage')
  create(
    @Body() createInvitationDto: CreateInvitationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.invitationsService.create(createInvitationDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get()
  @RequirePermissions('invitations.manage')
  findAll() {
    return this.invitationsService.findAll();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Delete(':id')
  @RequirePermissions('invitations.manage')
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
