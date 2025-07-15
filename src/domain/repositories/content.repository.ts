// src/domain/repositories/content.repository.ts

import { PaginatedResult } from '@shared/constants/types';
import { 
  Content, 
  ContentAnalytics, 
  ContentFilters, 
  ContentWithTopics, 
  UserProgress, 
  AbandonmentAnalytics, 
  ProblematicContent, 
  ContentInteractionLog,
  EffectivenessAnalytics,
  Tip as DomainTip,
} from '../entities/content.entity';
import { Tip, Topic } from '@prisma/client';
import { JsonValue } from '@prisma/client/runtime/library';

type SimpleTip = {
  id: string;
  title: string;
  content_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export interface IContentRepository {
  // ===== CONTENT CRUD OPERATIONS =====
  create(data: Omit<Content, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> & { topic_ids?: string[] }): Promise<ContentWithTopics>;
  findById(id: string): Promise<ContentWithTopics | null>;
  findMany(filters: ContentFilters): Promise<PaginatedResult<ContentWithTopics>>;
  update(
    id: string,
    data: Partial<Omit<Content, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>> & { topic_ids?: string[] }
  ): Promise<Content>;
  delete(id: string): Promise<boolean>;

  // ===== CONTENT-TOPIC RELATIONSHIP =====
  addTopicToContent(contentId: string, topicId: string, isPrimary: boolean): Promise<void>;
  removeTopicFromContent(contentId: string, topicId: string): Promise<void>;
  setPrimaryTopic(contentId: string, topicId: string): Promise<void>;

  // ===== CONTENT PROGRESS TRACKING =====
  getUserProgress(userId: string, contentId: string): Promise<UserProgress | null>;
  trackProgress(userId: string, contentId: string, data: {
    status?: 'not_started' | 'in_progress' | 'completed' | 'paused';
    progressPercentage?: number;
    timeSpentSeconds?: number;
    lastPositionSeconds?: number;
    completionRating?: number;
    completionFeedback?: string;
  }): Promise<UserProgress>;

  // ===== INTERACTION LOGGING =====
  logInteraction(interactionData: Omit<ContentInteractionLog, 'id' | 'actionTimestamp'>): Promise<ContentInteractionLog>;

  // ===== CONTENT DISCOVERY =====
  findContentByTopic(topicId: string): Promise<Content[]>;
  findContentByAge(age: number): Promise<ContentWithTopics[]>;
  findFeaturedContent(limit?: number): Promise<ContentWithTopics[]>;
  findRelatedContent(contentId: string, limit?: number): Promise<ContentWithTopics[]>;

  // ===== USER PROGRESS =====
  getUserProgressHistory(userId: string): Promise<UserProgress[]>;
  getCompletedContent(userId: string): Promise<ContentWithTopics[]>;
  getInProgressContent(userId: string): Promise<ContentWithTopics[]>;

  // ===== TIP OPERATIONS =====\
  getAllTips(): Promise<SimpleTip[]>;
  getTipsByContentId(contentId: string): Promise<Tip[]>;
  getTip(id: string): Promise<Tip>;
  getTipById(id: string): Promise<DomainTip | null>;
  createTip(contentId: string, data: Omit<DomainTip, 'id' | 'content_id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<DomainTip>;
  updateTip(
    id: string, 
    data: Partial<Omit<Tip, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>> 
  ): Promise<Omit<Tip, 'metadata'> & { metadata?: JsonValue }>;
  deleteTip(id: string): Promise<void>;

  // ===== ANALYTICS =====
  getContentAnalytics(contentId: string): Promise<ContentAnalytics>;
  getAbandonmentAnalytics(contentId: string): Promise<AbandonmentAnalytics>;
  getEffectivenessAnalytics(topicId: string): Promise<EffectivenessAnalytics>;
  findProblematicContent(threshold: number, limit: number): Promise<ProblematicContent[]>;

  // ===== MODULE OPERATIONS =====
  findAllModules(): Promise<Array<{ id: string; name: string }>>;
  findModuleById(id: string): Promise<{ id: string; name: string } | null>;

  // ===== TOPIC OPERATIONS =====
  getAllTopics(): Promise<Topic[]>;
  createTopic(data: Omit<Topic, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Topic>;
  getTopicById(id: string): Promise<Topic | null>;
  updateTopic(id: string, data: Partial<Omit<Topic, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>): Promise<Topic>;
  deleteTopic(id: string): Promise<boolean>;
  getContentForTopic(topicId: string): Promise<Content[]>;

  // ===== BULK OPERATIONS =====
  bulkTrackProgress(progressData: Array<{
    userId: string;
    contentId: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'paused';
    progressPercentage: number;
    timeSpentSeconds: number;
  }>): Promise<void>;
  
  bulkLogInteractions(interactions: Array<Omit<ContentInteractionLog, 'id' | 'actionTimestamp'>>): Promise<void>;
}
