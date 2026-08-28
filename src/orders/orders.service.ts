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
import { ConfirmItemDto } from './dto/confirm-item.dto.js';
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

  async findAll(
    search?: string,
    status?: string,
    userId?: string,
    userRole?: string,
  ): Promise<Order[]> {
    const where: FindOptionsWhere<Order> = {};

    if (search) {
      where.orderId = Like(`%${search}%`);
    }
    if (status) {
      where.status = status;
    }

    if (userRole === 'Merchant') {
      where.merchantId = userId;
    } else if (userRole === 'Receiver') {
      where.receiverId = userId;
    } else if (userRole === 'Store Keeper') {
      where.storeKeeperId = userId;
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

  async getDashboardStats() {
    const allOrdersCount = await this.ordersRepository.count();

    const pendingOrdersCount = await this.ordersRepository.count({
      where: { status: 'pending' },
    });

    const confirmedOrdersCount = await this.ordersRepository.count({
      where: [{ status: 'in_progress' }, { status: 'closed' }],
    });

    const inventoryItemsCount = await this.orderItemsRepository.count({
      where: { confirmedByStoreKeeper: true },
    });

    const recentOrders = await this.ordersRepository.find({
      relations: {
        merchant: true,
        receiver: true,
        storeKeeper: true,
        creator: true,
        items: true,
      },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    return {
      stats: {
        allOrders: allOrdersCount,
        pendingOrders: pendingOrdersCount,
        confirmedOrders: confirmedOrdersCount,
        inventoryItems: inventoryItemsCount,
      },
      recentOrders,
    };
  }

  async getMyApprovals(userId: string, userRole: string): Promise<OrderItem[]> {
    const query = this.orderItemsRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.order', 'order');

    if (userRole === 'Merchant') {
      query
        .where('item.confirmedByMerchant = :confirmed', { confirmed: true })
        .andWhere('order.merchantId = :userId', { userId });
    } else if (userRole === 'Receiver') {
      query
        .where('item.confirmedByReceiver = :confirmed', { confirmed: true })
        .andWhere('order.receiverId = :userId', { userId });
    } else if (userRole === 'Store Keeper') {
      query
        .where('item.confirmedByStoreKeeper = :confirmed', { confirmed: true })
        .andWhere('order.storeKeeperId = :userId', { userId });
    } else {
      return [];
    }

    query.orderBy('item.updatedAt', 'DESC');
    return query.getMany();
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
      const uploadResult = (await this.cloudinaryService.uploadImage(file)) as {
        secure_url: string;
      };
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
    confirmItemDto: ConfirmItemDto,
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

    if (confirmItemDto.receivedQuantity !== undefined) {
      item.receivedQuantity = confirmItemDto.receivedQuantity;
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

  async closeOrder(orderId: string): Promise<OrderItem[]> {
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

    if (order.items && order.items.length > 0) {
      // Only delete items that are not in the inventory (not fully confirmed)
      const itemsToDelete = order.items.filter(
        (item) => !item.confirmedByStoreKeeper,
      );
      if (itemsToDelete.length > 0) {
        await this.orderItemsRepository.remove(itemsToDelete);
      }

      // Items that are fully confirmed stay in the inventory.
      // Detach them from the order so they aren't affected by the order deletion.
      const itemsToKeep = order.items.filter(
        (item) => item.confirmedByStoreKeeper,
      );
      if (itemsToKeep.length > 0) {
        for (const item of itemsToKeep) {
          item.orderId = null;
        }
        await this.orderItemsRepository.save(itemsToKeep);
      }
    }

    // Bypass TypeORM's in-memory cascade logic that might still delete preserved items
    await this.ordersRepository.delete(order.id);
  }
}
