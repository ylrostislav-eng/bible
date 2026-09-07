import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { ContactPolicyService } from './contact-policy.service';

/** Правило «кто может дотянуться до кого» — общее для заявок, вызовов и
 * приглашений, поэтому живёт отдельно от каждого из них. */
@Module({
  imports: [ModerationModule],
  providers: [ContactPolicyService],
  exports: [ContactPolicyService],
})
export class ContactModule {}
