import { inject, injectable } from 'inversify';
import { PrismaClient, Prisma, ContentType, DifficultyLevel, UserProgressStatus, Tip, Topic } from '@prisma/client';
import { IContentRepository } from '../../../domain/repositories/content.repository';
import { 
  Content, 
  ContentWithTopics, 
  ContentFilters, 
  UserProgress, 
  ContentAnalytics, 
  AbandonmentAnalytics, 
  EffectivenessAnalytics, 
  ProblematicContent, 
  ContentInteractionLog, 
  InteractionAction, 
  DeviceType, 
  PlatformType, 
  AbandonmentReason,
  CameFromType,
  ProgressStatus
} from '../../../domain/entities/content.entity';
import { PaginatedResult, TYPES } from '@shared/constants/types';
import { logger } from '@shared/utils/logger';
import * as crypto from 'crypto';
import { TipMapper } from '../../../domain/utils/tip.mapper';

type SimpleTip = {
  id: string;
  title: string;
  content_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@injectable()
export class ContentRepository implements IContentRepository {
  constructor(
    @inject(TYPES.PrismaClient) private readonly prisma: PrismaClient
  ) {}

  // ===== CONTENT CRUD OPERATIONS =====
  async create(data: Omit<Content, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> & { topic_ids?: string[] }): Promise<ContentWithTopics> {
    try {
      console.log(data.topic_id);
      const topicIds = data.topic_ids || [];
      if (data.topic_id && !topicIds.includes(data.topic_id)) {
        topicIds.push(data.topic_id);
      }

      const createData: Prisma.ContentCreateInput = {
        title: data.title,
        description: data.description,
        content_type: data.content_type,
        main_media_id: data.main_media_id,
        thumbnail_media_id: data.thumbnail_media_id,
        difficulty_level: data.difficulty_level,
        target_age_min: data.target_age_min,
        target_age_max: data.target_age_max,
        reading_time_minutes: data.reading_time_minutes,
        duration_minutes: data.duration_minutes,
        is_downloadable: data.is_downloadable,
        is_featured: data.is_featured,
        is_published: data.is_published,
        published_at: data.published_at ? new Date(data.published_at) : null,
        view_count: data.view_count,
        completion_count: data.completion_count,
        rating_average: data.rating_average,
        rating_count: data.rating_count,
        metadata: typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata || {}),
        created_by: data.created_by,
        updated_by: data.updated_by,
      };

      // Add relations only if they exist
      if (data.topic_id) {
        createData.primaryTopic = { connect: { id: data.topic_id } };
      }

      if (topicIds.length > 0) {
        createData.contentTopics = {
          create: topicIds.map(topicId => ({
            topic: { connect: { id: topicId } },
            is_primary: topicId === data.topic_id
          }))
        };
      }

      console.log(createData);

      const result = await this.prisma.content.create({
        data: createData,
        include: {
          contentTopics: {
            include: {
              topic: true
            }
          }
        }
      });
      
      return this.transformToContentWithTopics(result);
    } catch (error) {
      logger.error('Error creating content:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<ContentWithTopics | null> {
    try {
      const result = await this.prisma.content.findUnique({
        where: { id },
        include: {
          contentTopics: {
            include: {
              topic: true
            }
          }
        }
      });
      
      if (!result) return null;
      return this.transformToContentWithTopics(result);
    } catch (error) {
      logger.error(`Error finding content by id ${id}:`, error);
      throw error;
    }
  }

  async findMany(filters: ContentFilters): Promise<PaginatedResult<ContentWithTopics>> {
    try {
      const page = filters.page ?? 1;
      const itemsPerPage = filters.limit ?? 10;
      const skip = (page - 1) * itemsPerPage;

      const where = this.buildWhereClause(filters);

      const [items, totalItems] = await Promise.all([
        this.prisma.content.findMany({
          where,
          include: {
            contentTopics: {
              include: {
                topic: true
              }
            }
          },
          skip,
          take: itemsPerPage,
          orderBy: this.buildOrderBy(filters),
        }),
        this.prisma.content.count({ where }),
      ]);

      return {
        items: items.map(item => this.transformToContentWithTopics(item)),
        meta: {
          totalItems,
          itemCount: items.length,
          itemsPerPage,
          totalPages: Math.ceil(totalItems / itemsPerPage),
          currentPage: page,
        },
      };
    } catch (error) {
      logger.error('Error finding content with filters:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<Omit<Content, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>> & {
      topic_ids?: string[];
    }
  ): Promise<ContentWithTopics> {
    try {
      const { topic_ids, tips, moduleContent, ...contentData } = data;
      
      // Handle topic_id if present
      let topicUpdate = {};
      if ('topic_id' in contentData) {
        topicUpdate = { topic_id: contentData.topic_id || null };
        delete contentData.topic_id;
      }

      const updateData: Prisma.ContentUpdateInput = {
        ...contentData,
        ...topicUpdate,
        metadata: contentData.metadata ? JSON.stringify(contentData.metadata) : undefined,
        updated_at: new Date(),
        contentTopics: topic_ids ? {
          set: topic_ids.map(id => ({ id }))
        } : undefined,
        tips: tips ? {
          set: tips.map(tip => ({ id: tip.id }))
        } : undefined,
        moduleContent: moduleContent ? {
          set: moduleContent.map(item => ({ id: item.id }))
        } : undefined
      };
      
      const updated = await this.prisma.content.update({
        where: { id },
        data: updateData,
        include: {
          contentTopics: {
            include: {
              topic: true
            }
          }
        }
      });

      return this.transformToContentWithTopics(updated);
    } catch (error) {
      logger.error(`Error updating content ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.content.delete({ where: { id } });
      return true;
    } catch (error) {
      logger.error(`Error deleting content ${id}:`, error);
      throw error;
    }
  }

  // ===== CONTENT-TOPIC RELATIONSHIP =====
  async addTopicToContent(contentId: string, topicId: string, isPrimary = false): Promise<void> {
    try {
      if (isPrimary) {
        await this.prisma.contentTopic.updateMany({
          where: { content_id: contentId },
          data: { is_primary: false }
        });
      }

      await this.prisma.contentTopic.upsert({
        where: {
          content_id_topic_id: {
            content_id: contentId,
            topic_id: topicId
          }
        },
        update: { is_primary: isPrimary },
        create: {
          content_id: contentId,
          topic_id: topicId,
          is_primary: isPrimary
        }
      });
    } catch (error) {
      logger.error(`Error adding topic ${topicId} to content ${contentId}:`, error);
      throw error;
    }
  }

  async removeTopicFromContent(contentId: string, topicId: string): Promise<void> {
    try {
      await this.prisma.contentTopic.delete({
        where: {
          content_id_topic_id: {
            content_id: contentId,
            topic_id: topicId
          }
        }
      });
    } catch (error) {
      logger.error(`Error removing topic ${topicId} from content ${contentId}:`, error);
      throw error;
    }
  }

  async setPrimaryTopic(contentId: string, topicId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.contentTopic.updateMany({
          where: { content_id: contentId },
          data: { is_primary: false }
        });

        await tx.contentTopic.update({
          where: {
            content_id_topic_id: {
              content_id: contentId,
              topic_id: topicId
            }
          },
          data: { is_primary: true }
        });
      });
    } catch (error) {
      logger.error(`Error setting primary topic ${topicId} for content ${contentId}:`, error);
      throw error;
    }
  }

  // ===== PROGRESS TRACKING =====
  async getUserProgress(userId: string, contentId: string): Promise<UserProgress | null> {
    try {
      const progress = await this.prisma.contentProgress.findUnique({
        where: {
          user_id_content_id: {
            user_id: userId,
            content_id: contentId
          }
        },
        include: {
          content: true
        }
      });

      if (!progress) return null;

      return {
        contentId: progress.content_id,
        title: progress.content.title,
        status: progress.status.toLowerCase() as ProgressStatus,
        progressPercentage: progress.progress_percentage,
        timeSpentSeconds: progress.time_spent_seconds,
        lastPositionSeconds: progress.last_position_seconds,
        lastAccessedAt: progress.last_accessed_at,
        completedAt: progress.completed_at,
        completionRating: progress.completion_rating ? Number(progress.completion_rating) : null,
        completionFeedback: progress.completion_feedback,
      };
    } catch (error) {
      logger.error(`Error getting user progress for user ${userId} and content ${contentId}:`, error);
      throw error;
    }
  }

  async trackProgress(userId: string, contentId: string, data: {
    status?: 'not_started' | 'in_progress' | 'completed' | 'paused';
    progressPercentage?: number;
    timeSpentSeconds?: number;
    lastPositionSeconds?: number;
    completionRating?: number;
    completionFeedback?: string;
  }): Promise<UserProgress> {
    try {
      const now = new Date();
      
      const updateData: any = {
        last_accessed_at: now
      };
      
      const statusMap = {
        'not_started': UserProgressStatus.NOT_STARTED,
        'in_progress': UserProgressStatus.IN_PROGRESS,
        'completed': UserProgressStatus.COMPLETED,
        'paused': UserProgressStatus.PAUSED
      };
      
      if (data.status) {
        updateData.status = statusMap[data.status];
      }
      
      if (data.progressPercentage !== undefined) updateData.progress_percentage = data.progressPercentage;
      if (data.timeSpentSeconds !== undefined) updateData.time_spent_seconds = data.timeSpentSeconds;
      if (data.lastPositionSeconds !== undefined) updateData.last_position_seconds = data.lastPositionSeconds;
      if (data.completionRating !== undefined) updateData.completion_rating = data.completionRating;
      if (data.completionFeedback !== undefined) updateData.completion_feedback = data.completionFeedback;
      if (data.status === 'completed') updateData.completed_at = now;
      
      const progress = await this.prisma.contentProgress.upsert({
        where: {
          user_id_content_id: {
            user_id: userId,
            content_id: contentId
          }
        },
        update: updateData,
        create: {
          user_id: userId,
          content_id: contentId,
          status: data.status ? statusMap[data.status] : UserProgressStatus.NOT_STARTED,
          progress_percentage: data.progressPercentage || 0,
          time_spent_seconds: data.timeSpentSeconds || 0,
          last_position_seconds: data.lastPositionSeconds || 0,
          completion_rating: data.completionRating,
          completion_feedback: data.completionFeedback,
          first_accessed_at: now,
          last_accessed_at: now,
          completed_at: data.status === 'completed' ? now : null,
        },
        include: {
          content: {
            select: {
              id: true,
              title: true
            }
          }
        }
      });

      return {
        contentId: progress.content_id,
        title: progress.content?.title || '',
        status: progress.status.toLowerCase() as ProgressStatus,
        progressPercentage: progress.progress_percentage,
        timeSpentSeconds: progress.time_spent_seconds,
        lastPositionSeconds: progress.last_position_seconds,
        lastAccessedAt: progress.last_accessed_at,
        completedAt: progress.completed_at,
        completionRating: progress.completion_rating ? Number(progress.completion_rating) : null,
        completionFeedback: progress.completion_feedback,
      };
    } catch (error) {
      logger.error(`Error tracking progress for user ${userId} and content ${contentId}:`, error);
      throw error;
    }
  }

  async logInteraction(interaction: Omit<ContentInteractionLog, 'id' | 'actionTimestamp'>): Promise<ContentInteractionLog> {
    try {
      const logged = await this.prisma.contentInteractionLog.create({
        data: {
          user_id: interaction.userId,
          content_id: interaction.contentId,
          session_id: interaction.sessionId,
          action: interaction.action,
          action_timestamp: new Date(),
          progress_at_action: interaction.progressAtAction ? new Prisma.Decimal(interaction.progressAtAction) : null,
          time_spent_seconds: interaction.timeSpentSeconds || 0,
          device_type: interaction.deviceType,
          platform: interaction.platform,
          abandonment_reason: interaction.abandonmentReason,
          came_from: interaction.cameFrom,
          metadata: interaction.metadata ? interaction.metadata : undefined,
        }
      });

      return {
        id: logged.id,
        userId: logged.user_id,
        contentId: logged.content_id,
        sessionId: logged.session_id,
        action: logged.action as InteractionAction,
        actionTimestamp: logged.action_timestamp,
        progressAtAction: logged.progress_at_action ? Number(logged.progress_at_action) : null,
        timeSpentSeconds: Number(logged.time_spent_seconds),
        deviceType: logged.device_type as DeviceType | null,
        platform: logged.platform as PlatformType | null,
        abandonmentReason: logged.abandonment_reason as AbandonmentReason | null,
        cameFrom: logged.came_from as CameFromType | null,
        metadata: logged.metadata ? JSON.parse(logged.metadata as string) : null,
      };
    } catch (error) {
      logger.error('Error logging interaction:', error);
      throw error;
    }
  }

  // ===== CONTENT DISCOVERY =====
  async getContentForTopic(topicId: string): Promise<Content[]> {
    return this.findContentByTopic(topicId);
  }

  async findContentByTopic(topicId: string): Promise<Content[]> {
    try {
      const contents = await this.prisma.content.findMany({
        where: {
          topic_id: topicId
        },
        include: {
          contentTopics: {
            include: { topic: true }
          }
        },
        orderBy: { created_at: 'desc' }
      });
      console.log(contents);
      return contents.map(c => this.transformToContentWithTopics(c));
    } catch (error) {
      logger.error(`Error finding content by topic ${topicId}:`, error);
      throw error;
    }
  }
  
  async findContentByAge(age: number): Promise<ContentWithTopics[]> {
    try {
      const contents = await this.prisma.content.findMany({
        where: {
          target_age_min: { lte: age },
          target_age_max: { gte: age },
          is_published: true
        },
        include: {
          contentTopics: {
            include: {
              topic: true
            }
          }
        },
        orderBy: { created_at: 'desc' }
      });

      return contents.map(content => this.transformToContentWithTopics(content));
    } catch (error) {
      logger.error(`Error finding content by age ${age}:`, error);
      throw error;
    }
  }

  async findFeaturedContent(limit = 10): Promise<ContentWithTopics[]> {
    try {
      const contents = await this.prisma.content.findMany({
        where: {
          is_featured: true,
          is_published: true
        },
        include: {
          contentTopics: {
            include: {
              topic: true
            }
          }
        },
        take: limit,
        orderBy: { created_at: 'desc' }
      });

      return contents.map(content => this.transformToContentWithTopics(content));
    } catch (error) {
      logger.error('Error finding featured content:', error);
      throw error;
    }
  }

  async findRelatedContent(contentId: string, limit = 5): Promise<ContentWithTopics[]> {
    try {
      const contentTopics = await this.prisma.contentTopic.findMany({
        where: { content_id: contentId },
        select: { topic_id: true }
      });

      const topicIds = contentTopics.map(ct => ct.topic_id);

      const contents = await this.prisma.content.findMany({
        where: {
          id: { not: contentId },
          contentTopics: {
            some: {
              topic_id: { in: topicIds }
            }
          },
          is_published: true
        },
        include: {
          contentTopics: {
            include: {
              topic: true
            }
          }
        },
        take: limit,
        orderBy: { view_count: 'desc' }
      });

      return contents.map(content => this.transformToContentWithTopics(content));
    } catch (error) {
      logger.error(`Error finding related content for ${contentId}:`, error);
      throw error;
    }
  }

  // ===== USER PROGRESS =====
  async getUserProgressHistory(userId: string): Promise<UserProgress[]> {
    try {
      const progressList = await this.prisma.contentProgress.findMany({
        where: { user_id: userId },
        include: { content: true },
        orderBy: { last_accessed_at: 'desc' }
      });

      return progressList.map(progress => ({
        contentId: progress.content_id,
        title: progress.content.title,
        status: progress.status.toLowerCase() as ProgressStatus,
        progressPercentage: progress.progress_percentage,
        timeSpentSeconds: progress.time_spent_seconds,
        lastPositionSeconds: progress.last_position_seconds,
        lastAccessedAt: progress.last_accessed_at,
        completedAt: progress.completed_at,
        completionRating: progress.completion_rating ? Number(progress.completion_rating) : null,
        completionFeedback: progress.completion_feedback,
      }));
    } catch (error) {
      logger.error(`Error getting user progress history for user ${userId}:`, error);
      throw error;
    }
  }

  async getCompletedContent(userId: string): Promise<ContentWithTopics[]> {
    try {
      const completedProgress = await this.prisma.contentProgress.findMany({
        where: {
          user_id: userId,
          status: 'COMPLETED'
        },
        include: {
          content: {
            include: {
              contentTopics: {
                include: {
                  topic: true
                }
              }
            }
          }
        },
        orderBy: { completed_at: 'desc' }
      });

      return completedProgress.map(progress => this.transformToContentWithTopics(progress.content));
    } catch (error) {
      logger.error(`Error getting completed content for user ${userId}:`, error);
      throw error;
    }
  }

  async getInProgressContent(userId: string): Promise<ContentWithTopics[]> {
    try {
      const inProgressContent = await this.prisma.contentProgress.findMany({
        where: {
          user_id: userId,
          status: 'IN_PROGRESS'
        },
        include: {
          content: {
            include: {
              contentTopics: {
                include: {
                  topic: true
                }
              }
            }
          }
        },
        orderBy: { last_accessed_at: 'desc' }
      });

      return inProgressContent.map(progress => this.transformToContentWithTopics(progress.content));
    } catch (error) {
      logger.error(`Error getting in-progress content for user ${userId}:`, error);
      throw error;
    }
  }

  // ===== ANALYTICS =====
  async getContentAnalytics(contentId: string): Promise<ContentAnalytics> {
    try {
      const content = await this.prisma.content.findUnique({
        where: { id: contentId },
        include: {
          contentProgress: true,
          contentTopics: {
            include: { topic: true }
          }
        }
      });

      if (!content) {
        throw new Error('Content not found');
      }

      const totalViews = content.view_count;
      const totalCompletions = content.completion_count;
      const completionRate = totalViews > 0 ? (totalCompletions / totalViews) * 100 : 0;

      return {
        content_id: contentId,
        title: content.title,
        total_views: totalViews,
        total_completions: totalCompletions,
        completion_rate: completionRate,
        average_time_spent: content.contentProgress.reduce((acc, p) => acc + p.time_spent_seconds, 0) / content.contentProgress.length || 0,
        average_rating: content.rating_average || 0,
        last_updated: content.updated_at,
        engagement_score: (completionRate + (content.rating_average || 0) * 20) / 2,
        abandonment_rate: 100 - completionRate,
        popular_topics: content.contentTopics.map(ct => ({
          topic_id: ct.topic_id,
          name: ct.topic.name,
          view_count: totalViews,
          completion_rate: completionRate
        }))
      };
    } catch (error) {
      logger.error(`Error getting content analytics for ${contentId}:`, error);
      throw error;
    }
  }

  async getAbandonmentAnalytics(contentId: string): Promise<AbandonmentAnalytics> {
    try {
      const interactions = await this.prisma.contentInteractionLog.findMany({
        where: { content_id: contentId }
      });

      const starts = interactions.filter(i => i.action === 'start').length;
      const completions = interactions.filter(i => i.action === 'complete').length;
      const abandons = interactions.filter(i => i.action === 'abandon');

      const avgAbandonmentPoint = abandons.length > 0 
        ? abandons.reduce((acc, a) => acc + (Number(a.progress_at_action) || 0), 0) / abandons.length 
        : 0;

      const abandonmentByDevice = abandons.reduce((acc, a) => {
        const device = a.device_type || 'unknown';
        acc[device] = (acc[device] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        contentId,
        totalStarts: starts,
        totalCompletions: completions,
        completionRate: starts > 0 ? (completions / starts) * 100 : 0,
        avgAbandonmentPoint,
        abandonmentByDevice
      };
    } catch (error) {
      logger.error(`Error getting abandonment analytics for ${contentId}:`, error);
      throw error;
    }
  }

  async getEffectivenessAnalytics(topicId: string): Promise<EffectivenessAnalytics> {
    try {
      const topic = await this.prisma.topic.findUnique({
        where: { id: topicId },
        include: {
          contentTopics: {
            include: {
              content: {
                include: {
                  contentProgress: true
                }
              }
            }
          }
        }
      });

      if (!topic) {
        throw new Error('Topic not found');
      }

      const contents = topic.contentTopics.map(ct => ct.content);
      const totalContent = contents.length;
      const totalViews = contents.reduce((acc, c) => acc + c.view_count, 0);
      const totalCompletions = contents.reduce((acc, c) => acc + c.completion_count, 0);
      const averageCompletionRate = totalViews > 0 ? (totalCompletions / totalViews) * 100 : 0;

      const allProgress = contents.flatMap(c => c.contentProgress);
      const averageTimeSpent = allProgress.length > 0 
        ? allProgress.reduce((acc, p) => acc + p.time_spent_seconds, 0) / allProgress.length 
        : 0;

      const averageRating = contents.reduce((acc, c) => acc + (c.rating_average || 0), 0) / totalContent || 0;

      return {
        topicId,
        topicName: topic.name,
        totalContent,
        totalViews,
        totalCompletions,
        averageCompletionRate,
        averageTimeSpent,
        averageRating,
        mostEngagedContent: contents
          .sort((a, b) => (b.rating_average || 0) - (a.rating_average || 0))
          .slice(0, 5)
          .map(c => ({
            id: c.id,
            title: c.title,
            completionRate: c.view_count > 0 ? (c.completion_count / c.view_count) * 100 : 0,
            averageRating: c.rating_average || 0
          })),
        leastEngagedContent: contents
          .sort((a, b) => (a.rating_average || 0) - (b.rating_average || 0))
          .slice(0, 5)
          .map(c => ({
            id: c.id,
            title: c.title,
            completionRate: c.view_count > 0 ? (c.completion_count / c.view_count) * 100 : 0,
            averageRating: c.rating_average || 0
          }))
      };
    } catch (error) {
      logger.error(`Error getting effectiveness analytics for topic ${topicId}:`, error);
      throw error;
    }
  }

  async findProblematicContent(threshold: number, limit: number): Promise<ProblematicContent[]> {
    try {
      const contents = await this.prisma.content.findMany({
        where: { is_published: true },
        include: {
          _count: {
            select: {
              contentProgress: {
                where: { status: 'COMPLETED' }
              }
            }
          }
        },
        take: limit
      });

      const problematicContent = contents
        .map(content => {
          const completionRate = content.view_count > 0 
            ? (content._count.contentProgress / content.view_count) * 100 
            : 0;
          
          return {
            contentId: content.id,
            title: content.title,
            completionRate,
            avgAbandonmentPoint: 50,
            priority: completionRate < 20 ? 'CRÍTICO' as const :
                     completionRate < 40 ? 'ALTO' as const :
                     completionRate < 60 ? 'MEDIO' as const : 'BAJO' as const,
            recommendation: completionRate < 20 
              ? 'Revisión urgente necesaria'
              : completionRate < 40 
                ? 'Considerar rediseñar contenido'
                : 'Revisar para mejoras menores'
          };
        })
        .filter(content => content.completionRate < threshold);

      return problematicContent;
    } catch (error) {
      logger.error('Error finding problematic content:', error);
      throw error;
    }
  }

  // ===== MODULE OPERATIONS =====
  async findAllModules(): Promise<Array<{ id: string; name: string }>> {
    try {
      return await this.prisma.module.findMany({
        select: { id: true, name: true },
      });
    } catch (error) {
      logger.error('Error finding all modules:', error);
      throw error;
    }
  }

  async findModuleById(id: string): Promise<{ id: string; name: string } | null> {
    try {
      return await this.prisma.module.findUnique({
        where: { id },
        select: { id: true, name: true }
      });
    } catch (error) {
      logger.error(`Error finding module by id ${id}:`, error);
      throw error;
    }
  }

  // ===== TIP OPERATIONS =====
  async getAllTips(): Promise<Tip[]> {
    try {
      return await this.prisma.tip.findMany();
    } catch (error) {
      logger.error('Error finding all tips:', error);
      throw error;
    }
  }

  async getTip(id: string): Promise<Tip> {
    try {
      const tip = await this.prisma.tip.findUnique({
        where: { id },
      });
      
      if (!tip) {
        throw new Error(`Tip with id ${id} not found`);
      }
      
      return TipMapper.toDomain(tip);
    } catch (error) {
      logger.error(`Error finding tip by id ${id}:`, error);
      throw error;
    }
  }

  async getTipById(id: string): Promise<Tip | null> {
    return this.getTip(id);
  }

  async createTip(contentId: string, data: Omit<Tip, 'id' | 'content_id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Tip> {
    if (!contentId) {
      throw new Error('contentId is required');
    }
    try {
      const tipData = {
        id: crypto.randomUUID(),
        content_id: contentId,
        ...data,
        prerequisites: data.prerequisites ? JSON.stringify(data.prerequisites) : Prisma.JsonNull,
        related_tips: data.related_tips ? JSON.stringify(data.related_tips) : Prisma.JsonNull,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        created_by: null,
        updated_by: null
      };
    
      const result = await this.prisma.tip.create({ 
        data: tipData 
      });
      return TipMapper.toDomain(result);
    } catch (error) {
      logger.error(`Error creating tip:`, error);
      throw error;
    }
  }

  async updateTip(id: string, data: Partial<Tip>): Promise<Tip> {
    try {
      // Validate required fields
      if (data.title === undefined) {
        throw new Error('Title is required for tip updates');
      }
      
      // Create validated tip data with all required fields
      const validatedTip: Tip = {
        title: data.title,
        description: data.description || null,
        created_by: data.created_by || null,
        updated_by: data.updated_by || null,
        content_id: data.content_id || '',
        action_instructions: data.action_instructions || null,
        prerequisites: data.prerequisites || null,
        related_tips: data.related_tips || null,
        created_at: data.created_at || new Date(),
        updated_at: data.updated_at || new Date(),
        deleted_at: data.deleted_at || null,
        id
      };
      
      const prismaData = TipMapper.toPrisma(validatedTip);
      
      // Properly handle all Prisma update input types
      const updateData: Prisma.TipUpdateInput = {
        title: { set: prismaData.title },
        description: prismaData.description === null ? { set: null } : { set: prismaData.description },
        content: { connect: { id: prismaData.content_id } },
        action_instructions: prismaData.action_instructions === null ? { set: null } : { set: prismaData.action_instructions },
        prerequisites: { set: prismaData.prerequisites },
        related_tips: { set: prismaData.related_tips },
        created_by: prismaData.created_by === null ? { set: null } : { set: prismaData.created_by },
        updated_by: prismaData.updated_by === null ? { set: null } : { set: prismaData.updated_by }
      };
      
      const updatedTip = await this.prisma.tip.update({
        where: { id },
        data: updateData
      });
      
      return TipMapper.toDomain(updatedTip);
    } catch (error) {
      logger.error(`Error updating tip with id ${id}:`, error);
      throw error;
    }
  }

  async deleteTip(id: string): Promise<boolean> {
    try {
      await this.prisma.tip.delete({ where: { id } });
      return true;
    } catch (error) {
      logger.error(`Error deleting tip ${id}:`, error);
      throw error;
    }
  }

  async findTipsByContentId(contentId: string): Promise<Tip[]> {
    try {
      return await this.prisma.tip.findMany({
        where: { content_id: contentId },
        orderBy: { created_at: 'asc' }
      });
    } catch (error) {
      logger.error(`Error finding tips for content ${contentId}:`, error);
      throw error;
    }
  }

  // ===== TOPIC OPERATIONS =====
  async getAllTopics(): Promise<Topic[]> {
    try {
      return await this.prisma.topic.findMany();
    } catch (error) {
      logger.error('Error finding all topics:', error);
      throw error;
    }
  }

  
  async createTopic(data: Omit<Topic, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Topic> {
    try {
      // First check if topic with this slug already exists
      const existingTopic = await this.prisma.topic.findUnique({
        where: { slug: data.slug }
      });
      
      if (existingTopic) {
        throw new Error(`A topic with slug '${data.slug}' already exists`);
      }
      
      return await this.prisma.topic.create({ 
        data: { 
          ...data, 
          prerequisites: data.prerequisites ? JSON.stringify(data.prerequisites) : undefined 
        } 
      });
    } catch (error) {
      logger.error('Error creating topic:', error);
      throw error;
    }
  }

  async getTopicById(id: string): Promise<Topic | null> {
    try {
      return await this.prisma.topic.findUnique({ where: { id } });
    } catch (error) {
      logger.error(`Error finding topic by id ${id}:`, error);
      throw error;
    }
  }

  async updateTopic(id: string, data: Partial<Omit<Topic, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>): Promise<Topic> {
    try {
      return await this.prisma.topic.update({ where: { id }, data: { ...data, prerequisites: data.prerequisites ? JSON.stringify(data.prerequisites) : undefined } });
    } catch (error) {
      logger.error(`Error updating topic ${id}:`, error);
      throw error;
    }
  }

  async deleteTopic(id: string): Promise<boolean> {
    try {
      await this.prisma.topic.delete({ where: { id } });
      return true;
    } catch (error) {
      logger.error(`Error deleting topic ${id}:`, error);
      throw error;
    }
  }

  // ===== BULK OPERATIONS =====
  async bulkTrackProgress(progressData: Array<{
    userId: string;
    contentId: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'paused';
    progressPercentage: number;
    timeSpentSeconds: number;
  }>): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const data of progressData) {
          await tx.contentProgress.upsert({
            where: {
              user_id_content_id: {
                user_id: data.userId,
                content_id: data.contentId
              }
            },
            update: {
              status: data.status.toUpperCase().replace(/-/g, '_') as keyof typeof UserProgressStatus,
              progress_percentage: data.progressPercentage,
              time_spent_seconds: data.timeSpentSeconds,
              last_accessed_at: new Date(),
              updated_at: new Date(),
            },
            create: {
              user_id: data.userId,
              content_id: data.contentId,
              status: data.status.toUpperCase().replace(/-/g, '_') as keyof typeof UserProgressStatus,
              progress_percentage: data.progressPercentage,
              time_spent_seconds: data.timeSpentSeconds,
              first_accessed_at: new Date(),
              last_accessed_at: new Date(),
            }
          });
        }
      });
    } catch (error) {
      logger.error('Error bulk tracking progress:', error);
      throw error;
    }
  }

  async bulkLogInteractions(interactions: Array<Omit<ContentInteractionLog, 'id' | 'actionTimestamp'>>): Promise<void> {
    try {
      await this.prisma.contentInteractionLog.createMany({
        data: interactions.map(interaction => ({
          user_id: interaction.userId,
          content_id: interaction.contentId,
          session_id: interaction.sessionId,
          action: interaction.action,
          action_timestamp: new Date(),
          progress_at_action: interaction.progressAtAction ? new Prisma.Decimal(interaction.progressAtAction) : null,
          time_spent_seconds: interaction.timeSpentSeconds || 0,
          device_type: interaction.deviceType,
          platform: interaction.platform,
          abandonment_reason: interaction.abandonmentReason,
          came_from: interaction.cameFrom,
          metadata: interaction.metadata ? interaction.metadata : undefined,
        }))
      });
    } catch (error) {
      logger.error('Error bulk logging interactions:', error);
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====
  private transformToContent(content: any): Content {
    return {
      ...content,
      topic_id: content.topic_id || null,
      metadata: content.metadata
        ? (typeof content.metadata === 'string'
            ? JSON.parse(content.metadata)
            : (content.metadata as Record<string, any>))
        : null,
      contentTopics: content.contentTopics || [],
      moduleContent: content.moduleContent || [],
      progress: content.progress || [],
      tips: content.tips || []
    };
  }

  private transformToContentWithTopics(content: any): ContentWithTopics {
    const baseContent = this.transformToContent(content);
    
    return {
      ...baseContent,
      metadata: baseContent.metadata ? JSON.parse(JSON.stringify(baseContent.metadata)) : null,
      contentTopics: content.contentTopics ?? [],
    };
  }

  private buildWhereClause(filters: ContentFilters): any {
    const where: any = {};

    if (filters.topicId) {
      where.primaryTopic = { id: filters.topicId };
    }

    if (filters.age !== undefined) {
      where.target_age_min = { lte: filters.age };
      where.target_age_max = { gte: filters.age };
    }

    if (filters.difficultyLevel) {
      where.difficulty_level = filters.difficultyLevel;
    }

    if (filters.contentType) {
      where.content_type = filters.contentType;
    }

    if (filters.isPublished !== undefined) {
      where.is_published = filters.isPublished;
    }

    if (filters.searchTerm) {
      where.OR = [
        { title: { contains: filters.searchTerm, mode: 'insensitive' } },
        { description: { contains: filters.searchTerm, mode: 'insensitive' } }
      ];
    }

    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) {
        where.created_at.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.created_at.lte = filters.endDate;
      }
    }

    return where;
  }

  private buildOrderBy(filters: ContentFilters): any {
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'desc';
    return { [sortBy]: sortOrder };
  }
}