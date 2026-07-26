import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';
import { EmailModule } from '../email/email.module';
import { LettersController } from './letters.controller';
import { LettersService } from './letters.service';

@Module({
  imports: [TenantConfigurationModule, EmailModule, ConfigModule],
  controllers: [LettersController],
  providers: [LettersService],
})
export class LettersModule {}
