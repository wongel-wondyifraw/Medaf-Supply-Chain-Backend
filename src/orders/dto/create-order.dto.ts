import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  merchantId: string;

  @IsUUID()
  @IsNotEmpty()
  receiverId: string;

  @IsUUID()
  @IsNotEmpty()
  storeKeeperId: string;
}
