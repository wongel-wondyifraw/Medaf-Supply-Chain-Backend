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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('api/orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() createOrderDto: CreateOrderDto, @Request() req: AuthenticatedRequest) {
    return this.ordersService.create(createOrderDto, req.user.id);
  }

  @Get()
  findAll(@Query('search') search?: string, @Query('status') status?: string) {
    return this.ordersService.findAll(search, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post(':id/items')
  @UseInterceptors(FileInterceptor('image'))
  addItem(
    @Param('id') id: string,
    @Body() createOrderItemDto: CreateOrderItemDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.ordersService.addItem(id, createOrderItemDto, file);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.ordersService.removeItem(id, itemId);
  }

  @Patch(':id/items/:itemId/confirm')
  confirmItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.ordersService.confirmItem(
      id,
      itemId,
      req.user.id,
      req.user.role,
    );
  }

  @Patch(':id/close')
  closeOrder(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.ordersService.closeOrder(id, req.user.id);
  }

  @Delete(':id')
  removeOrder(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.ordersService.removeOrder(id, req.user.id, req.user.role);
  }
}
