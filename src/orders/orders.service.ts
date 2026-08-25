import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CreateOrderItemDto } from './dto/create-order-item.dto.js';
import { UsersService } from '../users/users.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepository: Repository<OrderItem>,
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private async generateOrderId(): Promise<string> {
    const count = await this.ordersRepository.count();
    const nextId = (count + 1).toString().padStart(4, '0');
    return `ORD-${nextId}`;
  }

  async create(
    createOrderDto: CreateOrderDto,
    createdByUserId: string,
  ): Promise<Order> {
    // Validate roles for assigned users
    const merchant = await this.usersService.findOne(createOrderDto.merchantId);
    if (merchant.role !== 'Merchant' && merchant.role !== 'Admin')
      throw new BadRequestException('Invalid Merchant');

    const receiver = await this.usersService.findOne(createOrderDto.receiverId);
    if (receiver.role !== 'Receiver' && receiver.role !== 'Admin')
      throw new BadRequestException('Invalid Receiver');

    const storeKeeper = await this.usersService.findOne(
      createOrderDto.storeKeeperId,
    );
    if (storeKeeper.role !== 'Store Keeper' && storeKeeper.role !== 'Admin')
      throw new BadRequestException('Invalid Store Keeper');

    const orderId = await this.generateOrderId();

    const order = this.ordersRepository.create({
      orderId,
      merchantId: createOrderDto.merchantId,
      receiverId: createOrderDto.receiverId,
      storeKeeperId: createOrderDto.storeKeeperId,
      createdBy: createdByUserId,
      status: 'pending',
      currentStep: 1,
    });

    return this.ordersRepository.save(order);
  }

  async findAll(search?: string, status?: string): Promise<Order[]> {
    const where: FindOptionsWhere<Order> = {};

    if (search) {
      where.orderId = Like(`%${search}%`);
    }
    if (status) {
      where.status = status;
    }

    return this.ordersRepository.find({
      where,
      relations: {
        merchant: true,
        receiver: true,
        storeKeeper: true,
        creator: true,
        items: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getInventoryItems(): Promise<OrderItem[]> {
    return this.orderItemsRepository.find({
      where: { confirmedByStoreKeeper: true },
      relations: { order: { storeKeeper: true } },
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: {
        merchant: true,
        receiver: true,
        storeKeeper: true,
        creator: true,
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" not found`);
    }

    return order;
  }

  async addItem(
    orderId: string,
    createOrderItemDto: CreateOrderItemDto,
    file?: Express.Multer.File,
  ): Promise<OrderItem> {
    const order = await this.findOne(orderId);

    if (order.status === 'closed') {
      throw new BadRequestException('Cannot add items to a closed order');
    }

    let imageUrl = createOrderItemDto.imageUrl;
    if (file) {
      const uploadResult = await this.cloudinaryService.uploadImage(file) as { secure_url: string };
      imageUrl = uploadResult.secure_url;
    }

    const item = this.orderItemsRepository.create({
      ...createOrderItemDto,
      imageUrl,
      orderId: order.id,
      stage: 'merchant',
    });

    return this.orderItemsRepository.save(item);
  }

  async removeItem(orderId: string, itemId: string): Promise<void> {
    const order = await this.findOne(orderId);
    if (order.status === 'closed') {
      throw new BadRequestException('Cannot remove items from a closed order');
    }

    const item = await this.orderItemsRepository.findOne({
      where: { id: itemId, orderId: order.id },
    });
    if (!item) {
      throw new NotFoundException(
        `Item with ID "${itemId}" not found in order`,
      );
    }

    await this.orderItemsRepository.remove(item);
  }

  async confirmItem(
    orderId: string,
    itemId: string,
    userId: string,
    userRole: string,
  ): Promise<OrderItem> {
    const order = await this.findOne(orderId);
    if (order.status === 'closed') {
      throw new BadRequestException('Order is already closed');
    }

    const item = await this.orderItemsRepository.findOne({
      where: { id: itemId, orderId: order.id },
    });
    if (!item) {
      throw new NotFoundException(`Item with ID "${itemId}" not found`);
    }

    // Role-based confirmation logic
    if (userRole === 'Merchant' || userRole === 'Admin') {
      item.confirmedByMerchant = true;
      if (item.stage === 'merchant') item.stage = 'delivery';
    }
    if (userRole === 'Receiver' || userRole === 'Admin') {
      if (!item.confirmedByMerchant && userRole !== 'Admin') {
        throw new BadRequestException(
          'Item must be confirmed by Merchant first',
        );
      }
      item.confirmedByReceiver = true;
      if (item.stage === 'delivery') item.stage = 'store_keeper';
    }
    if (userRole === 'Store Keeper' || userRole === 'Admin') {
      if (!item.confirmedByReceiver && userRole !== 'Admin') {
        throw new BadRequestException(
          'Item must be confirmed by Receiver first',
        );
      }
      item.confirmedByStoreKeeper = true;
      item.stage = 'store_keeper'; // Final stage
    }

    // Update order status if items are confirmed
    if (order.status === 'pending') {
      order.status = 'in_progress';
      await this.ordersRepository.save(order);
    }

    return this.orderItemsRepository.save(item);
  }

  async closeOrder(orderId: string, _userId: string): Promise<OrderItem[]> {
    const order = await this.findOne(orderId);

    if (order.status === 'closed') {
      throw new BadRequestException('Order is already closed');
    }

    order.status = 'closed';
    order.closedAt = new Date();
    await this.ordersRepository.save(order);

    // Return items that are not fully confirmed
    const unconfirmedItems = order.items.filter(
      (item) =>
        !item.confirmedByMerchant ||
        !item.confirmedByReceiver ||
        !item.confirmedByStoreKeeper,
    );

    return unconfirmedItems;
  }

  async removeOrder(
    orderId: string,
    _userId: string,
    userRole: string,
  ): Promise<void> {
    if (userRole !== 'Admin') {
      throw new BadRequestException('Only Admins can delete orders');
    }

    const order = await this.findOne(orderId);

    // TypeORM cascading delete doesn't always delete items if not set up,
    // so let's delete items first explicitly.
    if (order.items && order.items.length > 0) {
      await this.orderItemsRepository.remove(order.items);
    }

    await this.ordersRepository.remove(order);
  }
}
