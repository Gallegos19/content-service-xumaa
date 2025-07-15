import { Prisma } from '@prisma/client';
import { Tip as PrismaTip } from '@prisma/client';
import { Tip } from '../entities/content.entity';

export class TipMapper {
  static toDomain(prismaTip: PrismaTip & { metadata?: any }): Tip {
    const parseStringArray = (value: any): string[] => {
      if (Array.isArray(value)) {
        return value.filter(item => typeof item === 'string');
      }
      
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : null;
        return Array.isArray(parsed) 
          ? parsed.filter(item => typeof item === 'string') 
          : [];
      } catch {
        return [];
      }
    };
    
    const prerequisites = parseStringArray(prismaTip.prerequisites);
    const relatedTips = parseStringArray(prismaTip.related_tips);

    return {
      id: prismaTip.id,
      title: prismaTip.title,
      description: prismaTip.description || null,
      created_by: prismaTip.created_by || null,
      updated_by: prismaTip.updated_by || null,
      content_id: prismaTip.content_id,
      action_instructions: prismaTip.action_instructions || null,
      prerequisites,
      related_tips: relatedTips,
      metadata: prismaTip.metadata || {},
      created_at: prismaTip.created_at,
      updated_at: prismaTip.updated_at,
      deleted_at: prismaTip.deleted_at
    };
  }

  static toPrisma(domainTip: Tip): Omit<PrismaTip, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
      title: domainTip.title,
      description: domainTip.description || null,
      action_instructions: domainTip.action_instructions || null,
      prerequisites: domainTip.prerequisites,
      related_tips: domainTip.related_tips,
      content_id: domainTip.content_id,
      created_by: domainTip.created_by || null,
      updated_by: domainTip.updated_by || null,
      metadata: domainTip.metadata || {},
    };
  }
}
