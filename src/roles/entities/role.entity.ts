import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, default: '' })
  description: string;

  @Column({ type: 'simple-array', default: '' })
  permissions: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
