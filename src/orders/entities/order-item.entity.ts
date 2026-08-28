import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity.js';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, (order) => order.items, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column()
  name: string;

  @Column({ name: 'image_url', nullable: true })
  imageUrl: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cost: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ name: 'received_quantity', type: 'int', nullable: true })
  receivedQuantity: number;

  @Column({ default: 'merchant' })
  stage: string; // merchant, delivery (receiver), store_keeper

  @Column({ name: 'confirmed_by_merchant', default: false })
  confirmedByMerchant: boolean;

  @Column({ name: 'confirmed_by_receiver', default: false })
  confirmedByReceiver: boolean;

  @Column({ name: 'confirmed_by_store_keeper', default: false })
  confirmedByStoreKeeper: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
