import { Module } from '@nestjs/common';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';
import { LettersController } from './letters.controller';
import { LettersService } from './letters.service';

@Module({
  imports: [TenantConfigurationModule],
  controllers: [LettersController],
  providers: [LettersService],
})
export class LettersModule {}
