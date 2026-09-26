import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OperationStatus, OperationType } from '@prisma/client';
export class LineDto {
  @IsString() @MaxLength(40) productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(999999999) quantity!: number;
}
export class OperationDto {
  @IsEnum(OperationType) type!: OperationType;
  @IsOptional() @IsString() @MaxLength(40) sourceId?: string;
  @IsOptional() @IsString() @MaxLength(40) destinationId?: string;
  @IsOptional() @IsString() @MaxLength(40) contactId?: string;
  @IsOptional() @IsString() @MaxLength(40) responsibleId?: string;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  @IsOptional() @IsString() @MaxLength(500) deliveryAddress?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}
export class FilterDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(40) warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(40) locationId?: string;
  @IsOptional() @IsString() @MaxLength(40) categoryId?: string;
  @IsOptional() @IsString() @MaxLength(40) productId?: string;
  @IsOptional() @IsEnum(OperationType) type?: OperationType;
  @IsOptional() @IsEnum(OperationStatus) status?: OperationStatus;
  @IsOptional() @IsIn(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']) stockStatus?: string;
  @IsOptional() @IsString() late?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
