import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'required_module';

export const RequireModule = (moduleKey: string) => SetMetadata(MODULE_KEY, moduleKey);
