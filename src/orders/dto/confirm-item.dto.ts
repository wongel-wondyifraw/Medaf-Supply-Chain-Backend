import { IsOptional, IsInt, Min } from 'class-validator';

export class ConfirmItemDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  receivedQuantity?: number;
}
