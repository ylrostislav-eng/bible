import { Module } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, AllExceptionsFilter],
  exports: [TelemetryService, AllExceptionsFilter],
})
export class TelemetryModule {}
