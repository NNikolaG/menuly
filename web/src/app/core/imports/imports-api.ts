import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import type { CommitResult, ImportDraft, ImportList, MenuImport } from './import';

const id = encodeURIComponent;

/** Photo/PDF import of an existing menu: upload, poll, fix pages, review the draft, commit. */
@Injectable({ providedIn: 'root' })
export class ImportsApi {
  private readonly api = inject(ApiClient);

  /** Newest first, with the venue's quota. */
  listResource(venueId: () => string | undefined) {
    return this.api.resource<ImportList>(() => {
      const venue = venueId();
      return venue ? `/v1/venues/${id(venue)}/imports` : undefined;
    });
  }

  /** One import with pages and draft. Call `reload()` to poll while it is processing. */
  importResource(importId: () => string | undefined) {
    return this.api.resource<MenuImport>(() => {
      const value = importId();
      return value ? `/v1/imports/${id(value)}` : undefined;
    });
  }

  /** Files in reading order. 202, still `processing`. */
  create(venueId: string, files: readonly File[]): Observable<MenuImport> {
    return this.api.post(`/v1/venues/${id(venueId)}/imports`, formData('files', files));
  }

  /** Forgotten photos, appended after the others. */
  addPages(importId: string, files: readonly File[]): Observable<MenuImport> {
    return this.api.post(`/v1/imports/${id(importId)}/pages`, formData('files', files));
  }

  /** Retake: replaces the page's file and reads it again. */
  replacePage(importId: string, pageId: string, file: File): Observable<MenuImport> {
    return this.api.put(
      `/v1/imports/${id(importId)}/pages/${id(pageId)}/file`,
      formData('file', [file]),
    );
  }

  /** Read a failed page again. */
  retryPage(importId: string, pageId: string): Observable<MenuImport> {
    return this.api.post(`/v1/imports/${id(importId)}/pages/${id(pageId)}/retry`);
  }

  /** Remove a wrong photo and its items; answers the import without it. */
  deletePage(importId: string, pageId: string): Observable<MenuImport> {
    return this.api.deleteWith<MenuImport>(`/v1/imports/${id(importId)}/pages/${id(pageId)}`);
  }

  /** The uploaded file, for the original-vs-draft view. */
  pageFile(importId: string, pageId: string): Observable<Blob> {
    return this.api.blob(`/v1/imports/${id(importId)}/pages/${id(pageId)}/file`);
  }

  /** Replaces the whole draft; nothing is checked until commit. */
  saveDraft(importId: string, draft: ImportDraft): Observable<MenuImport> {
    return this.api.put(`/v1/imports/${id(importId)}/draft`, draft);
  }

  /** Into an existing menu (`menu_id`) or a new draft menu (`menu_name`). */
  commit(
    importId: string,
    target: { menu_id: string } | { menu_name: string },
  ): Observable<CommitResult> {
    return this.api.post(`/v1/imports/${id(importId)}/commit`, target);
  }
}

function formData(field: string, files: readonly File[]): FormData {
  const data = new FormData();
  for (const file of files) data.append(field, file, file.name);
  return data;
}
