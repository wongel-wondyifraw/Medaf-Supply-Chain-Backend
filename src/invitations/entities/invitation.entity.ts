import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column()
  role: string;

  @Column({ default: 'pending' })
  status: string; // 'pending', 'used', 'expired', 'revoked'

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ name: 'used_by', nullable: true, type: 'varchar' })
  usedBy: string | null;

  @Column({ name: 'used_at', nullable: true, type: 'timestamp' })
  usedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
