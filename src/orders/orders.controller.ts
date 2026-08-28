import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CreateOrderItemDto } from './dto/create-order-item.dto.js';
import { ConfirmItemDto } from './dto/confirm-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('api/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermissions('orders.create')
  create(
    @Body() createOrderDto: CreateOrderDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.ordersService.create(createOrderDto, req.user.id);
  }

  @Get()
  @RequirePermissions('orders.view')
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findAll(search, status, req.user.id, req.user.role);
  }

  @Get('inventory/items')
  @RequirePermissions('inventory.view')
  getInventory() {
    return this.ordersService.getInventoryItems();
  }

  @Get('dashboard/stats')
  @RequirePermissions('dashboard.view')
  getDashboardStats() {
    return this.ordersService.getDashboardStats();
  }

  @Get('my-approvals')
  @RequirePermissions('orders.approvals.view')
  getMyApprovals(@Request() req: AuthenticatedRequest) {
    return this.ordersService.getMyApprovals(req.user.id, req.user.role);
  }

  @Get(':id')
  @RequirePermissions('orders.view')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post(':id/items')
  @RequirePermissions('orders.items.add')
  @UseInterceptors(FileInterceptor('image'))
  addItem(
    @Param('id') id: string,
    @Body() createOrderItemDto: CreateOrderItemDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.ordersService.addItem(id, createOrderItemDto, file);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('orders.items.remove')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.ordersService.removeItem(id, itemId);
  }

  @Patch(':id/items/:itemId/confirm')
  @RequirePermissions('orders.items.confirm')
  confirmItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() confirmItemDto: ConfirmItemDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.ordersService.confirmItem(
      id,
      itemId,
      confirmItemDto,
      req.user.id,
      req.user.role,
    );
  }

  @Patch(':id/close')
  @RequirePermissions('orders.close')
  closeOrder(@Param('id') id: string) {
    return this.ordersService.closeOrder(id);
  }

  @Delete(':id')
  @RequirePermissions('orders.delete')
  removeOrder(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.ordersService.removeOrder(id, req.user.id, req.user.role);
  }
}
