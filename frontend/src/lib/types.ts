 /** Core type definitions shared across the application. */
 
 export interface GameSummary {
   id: string;
   name: string;
   aliases: string[];
   genres: string[];
   developers: string[];
   release_date: string | null;
   cover_url: string | null;
   summary: string | null;
 }
 
export interface GameDetail extends GameSummary {
   publishers: string[];
   platforms: string[];
   ratings: Record<string, unknown>[];
   sources: Record<string, unknown>[];
   media: Record<string, unknown>[];
}

export type CrawlJobStatus = "queued" | "running" | "completed" | "partial" | "failed";

export interface CrawlJob {
  job_id: string;
  query: string;
  status: CrawlJobStatus;
  stage: string;
  progress: number;
  result_count: number;
  game_ids: string[];
  warnings: string[];
  error: string | null;
  created_at: string | null;
  updated_at: string | null;
}
 
 export interface InspirationNote {
   id: string;
   title: string;
   tags: string[];
   description: string | null;
   related_games: string[];
   ai_conversation: Record<string, unknown>[];
   created_at: string;
   updated_at: string;
 }
 
 export interface DesignProject {
   id: string;
   name: string;
   description: string | null;
   source_note_id: string | null;
   canvas_state: Record<string, unknown>;
   revision: number;
   created_at: string;
   updated_at: string;
 }
 
 export type NodeType =
   | "scene"
   | "level"
   | "character"
   | "item"
   | "skill"
   | "storyline"
   | "reference"
   | "mechanic";
 
export type AnalysisTemplate =
   | "char-tier"
   | "build-recommend"
   | "boss-guide"
   | "story-deep"
   | "mechanic";

export interface AnalysisReportSummary {
  id: string;
  game_id: string;
  game_name: string;
  report_type: AnalysisTemplate | string;
  excerpt: string;
  created_at: string;
  updated_at: string;
}

export interface RetrievalDocument {
  document_id: string;
  title: string;
  url: string | null;
  captured_at: string | null;
  snippet: string;
  score: number;
  provider: string;
  source_type: string;
}
