import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CreateOrderItemDto } from './dto/create-order-item.dto.js';
import { ConfirmItemDto } from './dto/confirm-item.dto.js';
import { UsersService } from '../users/users.service.js';
import { StorageService } from '../storage/storage.service.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepository: Repository<OrderItem>,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
  ) { }

  private async generateOrderId(manager?: EntityManager): Promise<string> {
    const runner = manager || this.dataSource;
    try {
      await runner.query(
        'CREATE SEQUENCE IF NOT EXISTS order_id_seq START WITH 1',
      );
      const maxRes = await runner.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(order_id FROM 5) AS INTEGER)), 0) as max_id 
        FROM orders 
        WHERE order_id ~ '^ORD-[0-9]+$'
      `);
      const maxId = Number(maxRes[0]?.max_id || 0);
      if (maxId > 0) {
        await runner.query(
          `SELECT setval('order_id_seq', GREATEST(nextval('order_id_seq'), ${maxId}))`,
        );
      }
      const seqRes = await runner.query(
        "SELECT nextval('order_id_seq') as next_id",
      );
      const nextId = String(seqRes[0].next_id).padStart(4, '0');
      return `ORD-${nextId}`;
    } catch {
      const count = await this.ordersRepository.count();
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      return `ORD-${(count + 1).toString().padStart(4, '0')}-${randomPart}`;
    }
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

    return this.dataSource.transaction(async (manager) => {
      const orderId = await this.generateOrderId(manager);

      const orderEntity = manager.create(Order, {
        orderId,
        merchantId: createOrderDto.merchantId,
        receiverId: createOrderDto.receiverId,
        storeKeeperId: createOrderDto.storeKeeperId,
        createdBy: createdByUserId,
        status: 'pending',
        currentStep: 1,
      });

      const savedOrder = await manager.save(Order, orderEntity);

      if (createOrderDto.items && createOrderDto.items.length > 0) {
        const itemEntities = createOrderDto.items.map((item) =>
          manager.create(OrderItem, {
            name: item.name,
            cost: item.cost,
            quantity: item.quantity || 1,
            imageUrl: item.imageUrl,
            orderId: savedOrder.id,
            stage: 'merchant',
          }),
        );
        savedOrder.items = await manager.save(OrderItem, itemEntities);
      } else {
        savedOrder.items = [];
      }

      return (await manager.findOne(Order, {
        where: { id: savedOrder.id },
        relations: {
          merchant: true,
          receiver: true,
          storeKeeper: true,
          creator: true,
          items: true,
        },
      })) as Order;
    });
  }

  async findAll(
    search?: string,
    status?: string,
    userId?: string,
    userRole?: string,
    page?: number,
    limit?: number,
  ): Promise<
    | Order[]
    | {
      data: Order[];
      meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }
  > {
    const qb = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.merchant', 'merchant')
      .leftJoinAndSelect('order.receiver', 'receiver')
      .leftJoinAndSelect('order.storeKeeper', 'storeKeeper')
      .leftJoinAndSelect('order.creator', 'creator')
      .leftJoinAndSelect('order.items', 'items');

    if (search) {
      qb.andWhere('order.orderId ILIKE :search', { search: `%${search}%` });
    }
    if (status && status !== 'all') {
      qb.andWhere('order.status = :status', { status });
    }

    if (userRole === 'Merchant') {
      qb.andWhere(
        '(order.merchantId = :userId OR order.createdBy = :userId)',
        { userId },
      );
    } else if (userRole === 'Receiver') {
      qb.andWhere(
        '(order.receiverId = :userId OR order.createdBy = :userId)',
        { userId },
      );
    } else if (userRole === 'Store Keeper') {
      qb.andWhere(
        '(order.storeKeeperId = :userId OR order.createdBy = :userId)',
        { userId },
      );
    }

    qb.orderBy('order.createdAt', 'DESC');

    if (page && limit) {
      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.max(1, Number(limit));
      qb.skip((pageNum - 1) * limitNum).take(limitNum);
      const [data, total] = await qb.getManyAndCount();
      return {
        data,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    }

    return qb.getMany();
  }

  async getInventoryItems(): Promise<OrderItem[]> {
    return this.orderItemsRepository.find({
      where: { confirmedByStoreKeeper: true },
      relations: { order: { storeKeeper: true } },
      order: { updatedAt: 'DESC' },
    });
  }

  async getDashboardStats() {
    try {
      const statsRes = await this.dataSource.query(`
        SELECT
          (SELECT COUNT(*) FROM orders) as "allOrders",
          (SELECT COUNT(*) FROM orders WHERE status = 'pending') as "pendingOrders",
          (SELECT COUNT(*) FROM orders WHERE status IN ('in_progress', 'closed')) as "confirmedOrders",
          (SELECT COUNT(*) FROM order_items WHERE confirmed_by_store_keeper = true) as "inventoryItems"
      `);
      const row = statsRes[0] || {};
      const stats = {
        allOrders: Number(row.allOrders || 0),
        pendingOrders: Number(row.pendingOrders || 0),
        confirmedOrders: Number(row.confirmedOrders || 0),
        inventoryItems: Number(row.inventoryItems || 0),
      };

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

      return { stats, recentOrders };
    } catch {
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
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      );
    const order = await this.ordersRepository.findOne({
      where: isUuid ? { id } : { orderId: id },
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
    let uploadResult: { url: string; relativePath: string } | undefined;
    if (file) {
      uploadResult = await this.storageService.saveOrderImage(
        order.orderId || order.id,
        file,
      );
      imageUrl = uploadResult.url;
    }

    try {
      const item = this.orderItemsRepository.create({
        ...createOrderItemDto,
        imageUrl,
        orderId: order.id,
        stage: 'merchant',
      });

      return await this.orderItemsRepository.save(item);
    } catch (err) {
      if (uploadResult?.url) {
        await this.storageService.deleteFile(uploadResult.url);
      }
      throw err;
    }
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

    if (item.imageUrl) {
      await this.storageService.deleteFile(item.imageUrl);
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
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const itemRepo = manager.getRepository(OrderItem);

      const order = await orderRepo.findOne({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException(`Order with ID "${orderId}" not found`);
      }
      if (order.status === 'closed') {
        throw new BadRequestException('Order is already closed');
      }

      const item = await itemRepo.findOne({
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
        await orderRepo.save(order);
      }

      return itemRepo.save(item);
    });
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

    return this.dataSource.transaction(async (manager) => {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          orderId,
        );
      const orderRepo = manager.getRepository(Order);
      const order = await orderRepo.findOne({
        where: isUuid ? { id: orderId } : { orderId },
      });
      if (!order) {
        throw new NotFoundException(`Order with ID "${orderId}" not found`);
      }

      // Detach fully confirmed items so they remain preserved in inventory
      await manager.query(
        'UPDATE order_items SET order_id = NULL WHERE order_id = $1 AND confirmed_by_store_keeper = true',
        [order.id],
      );

      // Delete unconfirmed / pending items associated with this order
      await manager.query(
        'DELETE FROM order_items WHERE order_id = $1 AND (confirmed_by_store_keeper IS NOT TRUE)',
        [order.id],
      );

      // Ensure any leftover item reference is cleared so FK constraint never fails
      await manager.query(
        'UPDATE order_items SET order_id = NULL WHERE order_id = $1',
        [order.id],
      );

      // Delete the order record directly
      await manager.query('DELETE FROM orders WHERE id = $1', [order.id]);
    });
  }
}
