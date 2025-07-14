import { inject, injectable } from 'inversify';
import { IContentInteractionLogRepository } from '../../domain/repositories/contentInteractionLog.repository';
import { ContentInteractionLog } from '@domain/entities';
import { InteractionAction } from '@domain/enums';
import { DeviceType } from '@domain/enums'; // Assuming DeviceType is defined in this enum

export interface IContentInteractionLogService {
  getLogsByContentId(contentId: string): Promise<ContentInteractionLog[]>;
}

@injectable()
export class ContentInteractionLogService implements IContentInteractionLogService {
  constructor(
    @inject('IContentInteractionLogRepository')
    private readonly repository: IContentInteractionLogRepository
  ) {}

  async getLogsByContentId(contentId: string): Promise<ContentInteractionLog[]> {
    try {
      const logs = await this.repository.findByContentId(contentId);
      
      // Transform snake_case to camelCase and convert Decimal to number
      return logs.map(log => this.mapToContentInteractionLog({
        id: log.id,
        userId: log.user_id,
        contentId: log.content_id,
        sessionId: log.session_id,
        action: this.validateInteractionAction(log.action),
        actionTimestamp: log.action_timestamp,
        progressAtAction: log.progress_at_action !== null ? Number(log.progress_at_action) : null,
        timeSpentSeconds: log.time_spent_seconds !== null ? Number(log.time_spent_seconds) : null,
        deviceType: log.device_type,
        platform: log.platform,
        abandonmentReason: log.abandonment_reason,
        cameFrom: log.came_from,
        metadata: log.metadata
      }));
    } catch (error) {
      throw new Error(`Failed to get interaction logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateInteractionAction(action: string): InteractionAction {
    if (Object.values(InteractionAction).includes(action as InteractionAction)) {
      return action as InteractionAction;
    }
    throw new Error(`Invalid interaction action: ${action}`);
  }

  private mapToContentInteractionLog(raw: any): ContentInteractionLog {
    function isDeviceType(value: string | null): value is DeviceType {
      return value === null || ['mobile', 'tablet', 'desktop'].includes(value);
    }

    if (!isDeviceType(raw.deviceType)) {
      throw new Error(`Invalid device type: ${raw.deviceType}`);
    }
    
    return {
      ...raw,
      deviceType: raw.deviceType
    };
  }
}
