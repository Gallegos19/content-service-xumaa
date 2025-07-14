import { Tip as PrismaTip } from '@prisma/client';
import { Tip } from '../entities/content.entity';

export class TipMapper {
  static toDomain(prismaTip: PrismaTip): Tip {
    const prerequisites = typeof prismaTip.prerequisites === 'string' ? 
      JSON.parse(prismaTip.prerequisites) as string[] : 
      (Array.isArray(prismaTip.prerequisites) ? prismaTip.prerequisites as string[] : []);
      
    const relatedTips = typeof prismaTip.related_tips === 'string' ? 
      JSON.parse(prismaTip.related_tips) as string[] : 
      (Array.isArray(prismaTip.related_tips) ? prismaTip.related_tips as string[] : []);

    return {
      id: prismaTip.id,
      title: prismaTip.title,
      content: '', // Default empty content
      tip_type: 'general', // Default type
      category: null, // Default null category
      target_age_min: 0, // Default min age
      target_age_max: 100, // Default max age
      difficulty_level: 'beginner', // Default difficulty
      action_required: false, // Default false
      estimated_time_minutes: null, // Default null
      impact_level: 'medium', // Default medium impact
      source_url: null, // Default null
      image_url: null, // Default null
      is_active: true, // Default active
      is_featured: false, // Default not featured
      valid_from: null, // Default null
      valid_until: null, // Default null
      usage_count: 0, // Default 0
      description: prismaTip.description || null,
      created_by: prismaTip.created_by || null,
      updated_by: prismaTip.updated_by || null,
      content_id: prismaTip.content_id,
      action_instructions: prismaTip.action_instructions || null,
      prerequisites,
      related_tips: relatedTips,
      metadata: null, // Default null
      created_at: prismaTip.created_at,
      updated_at: prismaTip.updated_at,
      deleted_at: prismaTip.deleted_at
    };
  }

  static toPrisma(domainTip: Tip): Omit<PrismaTip, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
      title: domainTip.title,
      description: domainTip.description || null,
      created_by: domainTip.created_by || null,
      updated_by: domainTip.updated_by || null,
      content_id: domainTip.content_id,
      action_instructions: domainTip.action_instructions || null,
      prerequisites: JSON.stringify(domainTip.prerequisites || []),
      related_tips: JSON.stringify(domainTip.related_tips || [])
    };
  }
}
