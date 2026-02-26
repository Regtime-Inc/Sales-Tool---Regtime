export interface ParsedTxn {
  crfn?: string;
  documentId?: string;
  reelPgFile?: string;
  recordedDate?: string;
  docDate?: string;
  docType?: string;
  borough?: string;
  block?: string;
  lot?: string;
  bbl?: string;
  partial?: string;
  pages?: string;
  party1?: string;
  party2?: string;
  party3?: string;
  amount?: string;
  corrected?: boolean;
  rawLine: string;
  dedupeKey: string;
}

export type VisionPipeline = 'docai_plus_llm' | 'llm_vision_only';

export interface PipelineMeta {
  pipeline: VisionPipeline;
  ocrConfidence: number | null;
  rawOcrText: string | null;
}

export interface ParseResult {
  transactions: ParsedTxn[];
  warnings: string[];
  pipelineMeta?: PipelineMeta;
  docAiFailed?: boolean;
}

export type AssistIngestionSource = 'manual_paste' | 'screen_capture' | 'html_upload';

export type AssistMode = 'paste' | 'capture' | 'html';
