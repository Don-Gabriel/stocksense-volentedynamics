import {
  IsByteLength,
  IsEmail,
  IsEnum,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { AccountStatus, Role } from '@prisma/client';
export class LoginDto {
  @IsString() @Length(1, 254) identity!: string;
  @IsString() @Length(1, 128) password!: string;
}
export class RegisterDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{6,12}$/, {
    message: 'Login ID must be 6–12 letters, numbers, or underscores.',
  })
  username!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(2, 80) @Matches(/\S/, { message: 'Name cannot be blank.' }) name!: string;
  @IsString()
  @Length(9, 72)
  @IsByteLength(9, 72, { message: 'Password must fit within 72 UTF-8 bytes.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Password must include uppercase, lowercase, and a special character.',
  })
  password!: string;
}
export class ForgotDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class ResetDto extends ForgotDto {
  @IsString() @Matches(/^\d{6}$/, { message: 'Enter the six-digit code.' }) code!: string;
  @IsString()
  @Length(9, 72)
  @IsByteLength(9, 72, { message: 'Password must fit within 72 UTF-8 bytes.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Password must include uppercase, lowercase, and a special character.',
  })
  password!: string;
}
export class ProfileDto {
  @IsString() @Length(2, 80) @Matches(/\S/, { message: 'Name cannot be blank.' }) name!: string;
}
export class VerifyDto extends ForgotDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
  @IsString() @Length(1, 128) password!: string;
}
export class AccessDto {
  @IsEnum(AccountStatus) status!: AccountStatus;
  @IsEnum(Role) role!: Role;
}
