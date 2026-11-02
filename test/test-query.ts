import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { OrderItem } from './src/orders/entities/order-item.entity';
import { Order } from './src/orders/entities/order.entity';
import { User } from './src/users/entities/user.entity';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/medaf',
  entities: [OrderItem, Order, User],
  synchronize: false,
});

async function run() {
  await dataSource.initialize();
  const repo = dataSource.getRepository(OrderItem);
  try {
    const res = await repo.find({
      where: {
        confirmedByMerchant: true,
        order: { merchantId: 'some-uuid' }
      },
      relations: {
        order: true,
      },
      order: {
        updatedAt: 'DESC',
      },
    });
    console.log('Query success:', res.length);
  } catch (err) {
    console.error('Query failed:', err);
  } finally {
    await dataSource.destroy();
  }
}

run();
