import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';

export type ImagePurpose = 'item' | 'logo' | 'cover' | 'promotion';

/** `POST /v1/media/images` answer; `url` is public and never changes. */
export interface StoredImage {
  id: string;
  url: string;
  mime: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  size_bytes: number;
}

@Injectable({ providedIn: 'root' })
export class MediaApi {
  private readonly api = inject(ApiClient);

  /** JPEG, PNG or WebP up to 10 MB; the server rotates, scales down by purpose and re-encodes. */
  uploadImage(file: File, purpose: ImagePurpose): Observable<StoredImage> {
    const data = new FormData();
    data.append('file', file, file.name);
    data.append('purpose', purpose);
    return this.api.post('/v1/media/images', data);
  }
}
