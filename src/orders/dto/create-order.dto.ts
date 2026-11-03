import {
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto.js';

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];
}
