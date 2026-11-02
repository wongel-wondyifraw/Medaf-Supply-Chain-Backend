import {
  Entity,
  PrimaryColumn,
  BeforeInsert,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';

@Entity('roles')
export class Role {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = randomUUID();
    }
  }

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, default: '' })
  description: string;

  @Column({ type: 'simple-array', default: '' })
  permissions: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
