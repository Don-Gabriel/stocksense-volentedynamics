import { ContactType, Unit } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
export class NameDto {
  @IsString() @Length(2, 80) @Matches(/\S/, { message: 'Name cannot be blank.' }) name!: string;
}
export class WarehouseDto extends NameDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,12}$/, {
    message: 'Code must be 2–12 letters, numbers, underscores, or hyphens.',
  })
  code!: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class LocationDto extends NameDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,20}$/) code!: string;
  @IsString() @Length(1, 40) warehouseId!: string;
}
export class ContactDto extends NameDto {
  @IsEnum(ContactType) type!: ContactType;
  @IsOptional() @ValidateIf((_o, value) => value !== '') @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class ProductDto extends NameDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,32}$/, {
    message: 'SKU must be 2–32 letters, numbers, underscores, or hyphens.',
  })
  sku!: string;
  @IsString() @Length(1, 40) categoryId!: string;
  @IsEnum(Unit) unit!: Unit;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999) unitCost!: number;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(999999999) initialStock?: number;
  @IsOptional() @IsString() @Length(1, 40) locationId?: string;
}
export class RuleDto {
  @IsString() @Length(1, 40) productId!: string;
  @IsString() @Length(1, 40) locationId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(999999999) minimum!: number;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(999999999) target!: number;
}
