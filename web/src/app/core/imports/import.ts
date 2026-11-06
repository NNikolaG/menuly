/** Types from backend/api/openapi.yaml (Imports): reading an existing menu from photos or PDFs. */

export type ImportStatus = 'processing' | 'ready_for_review' | 'failed' | 'committed';
export type PageStatus = 'queued' | 'processing' | 'done' | 'failed';
export type PageErrorCode =
  '' | 'not_configured' | 'not_a_menu' | 'no_items' | 'unreadable' | 'temporary' | 'gave_up';
export type PhotoQuality = '' | 'good' | 'partial' | 'poor';
export type PhotoIssue =
  'blurry' | 'cut_off' | 'glare' | 'too_dark' | 'too_far' | 'skewed' | 'not_a_menu';
export type Uncertain = 'name' | 'price' | 'duplicate';

export interface ImportPage {
  id: string;
  /** 0-based upload order; draft items point back with `page_index`. */
  page_index: number;
  /** Pages in the file (PDF), else 1. */
  page_count: number;
  status: PageStatus;
  attempts: number;
  /** English detail for logs; show our own text by `error_code`. */
  error: string;
  error_code: PageErrorCode;
  filename: string;
  mime: string;
  photo_quality: PhotoQuality;
  photo_issues: PhotoIssue[];
}

export interface DraftVariant {
  /** Size/portion, empty for a single price. */
  label: string;
  /** Null when the printed price could not be parsed. */
  price_minor: number | null;
  /** The price as printed. */
  price_text: string;
}

export interface DraftItem {
  name: string;
  description: string;
  page_index: number;
  /** What the model was unsure of; highlight for the reviewer. */
  uncertain: Uncertain[];
  variants: DraftVariant[];
}

export interface DraftCategory {
  name: string;
  description: string;
  items: DraftItem[];
}

/** What was read, as printed (no translation). */
export interface ImportDraft {
  currency: string;
  categories: DraftCategory[];
}

export interface ImportSummary {
  categories: number;
  items: number;
  /** Items with an uncertain name or price, or a possible duplicate. */
  items_to_check: number;
  /** Variants without `price_minor`; commit needs 0. */
  missing_prices: number;
}

export interface MenuImport {
  id: string;
  venue_id: string;
  status: ImportStatus;
  /** Empty, or e.g. "1 of 3 files could not be read". */
  error: string;
  draft_edited: boolean;
  committed_menu_id: string | null;
  created_at: string;
  updated_at: string;
  committed_at: string | null;
  summary?: ImportSummary;
  /** Null until a page has been read; left out of lists. */
  draft?: ImportDraft | null;
  /** Left out of lists. */
  pages?: ImportPage[];
}

export interface ImportList {
  items: MenuImport[];
  /** Imports this venue may run. */
  import_limit: number;
  /** Imports that count against the limit (all except failed). */
  imports_used: number;
}

export interface CommitResult {
  import: MenuImport;
  menu_id: string;
  items_created: number;
}
