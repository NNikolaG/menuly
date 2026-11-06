import type {
  ImportStatus,
  PageErrorCode,
  PageStatus,
  PhotoIssue,
  PhotoQuality,
  Uncertain,
} from '../../core/imports/import';

/** Accepted uploads. Listing the types (not `image/*`) makes iPhone Safari convert HEIC to JPEG. */
export const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
export const ACCEPT_PHOTO = 'image/jpeg,image/png,image/webp';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PAGES = 20;

export const IMPORT_STATUS: Record<ImportStatus, { label: string; tone: string }> = {
  processing: { label: $localize`:@@import.status.processing:Čita se`, tone: 'info' },
  ready_for_review: { label: $localize`:@@import.status.ready:Čeka pregled`, tone: 'warning' },
  failed: { label: $localize`:@@import.status.failed:Nije uspelo`, tone: 'danger' },
  committed: { label: $localize`:@@import.status.committed:Uvezeno`, tone: 'success' },
};

export const PAGE_STATUS: Record<PageStatus, { label: string; tone: string }> = {
  queued: { label: $localize`:@@import.page.queued:Na redu`, tone: 'info' },
  processing: { label: $localize`:@@import.page.processing:Čita se`, tone: 'info' },
  done: { label: $localize`:@@import.page.done:Pročitano`, tone: 'success' },
  failed: { label: $localize`:@@import.page.failed:Nije pročitano`, tone: 'danger' },
};

/** Our own text per `error_code`; the API's `error` is English detail for logs. */
export const PAGE_ERROR: Record<Exclude<PageErrorCode, ''>, string> = {
  not_configured: $localize`:@@import.error.notConfigured:Čitanje menija trenutno nije dostupno. Pokušaj kasnije.`,
  not_a_menu: $localize`:@@import.error.notAMenu:Na slici nije prepoznat meni. Slikaj ponovo.`,
  no_items: $localize`:@@import.error.noItems:Nije pročitana nijedna stavka. Slikaj ponovo, bliže i oštrije.`,
  unreadable: $localize`:@@import.error.unreadable:Fajl ne može da se otvori. Slikaj ponovo ili pošalji drugi fajl.`,
  temporary: $localize`:@@import.error.temporary:Privremena greška, pokušavamo ponovo…`,
  gave_up: $localize`:@@import.error.gaveUp:Čitanje nije uspelo ni posle više pokušaja. Pokušaj ponovo.`,
};

export const QUALITY: Record<Exclude<PhotoQuality, ''>, { label: string; tone: string }> = {
  good: { label: $localize`:@@import.quality.good:Dobra slika`, tone: 'success' },
  partial: { label: $localize`:@@import.quality.partial:Delimično čitljivo`, tone: 'warning' },
  poor: { label: $localize`:@@import.quality.poor:Loša slika`, tone: 'danger' },
};

export const ISSUE: Record<PhotoIssue, string> = {
  blurry: $localize`:@@import.issue.blurry:mutno`,
  cut_off: $localize`:@@import.issue.cutOff:odsečeno`,
  glare: $localize`:@@import.issue.glare:odsjaj`,
  too_dark: $localize`:@@import.issue.tooDark:pretamno`,
  too_far: $localize`:@@import.issue.tooFar:predaleko`,
  skewed: $localize`:@@import.issue.skewed:iskrivljeno`,
  not_a_menu: $localize`:@@import.issue.notAMenu:nije meni`,
};

export const UNCERTAIN: Record<Uncertain, string> = {
  name: $localize`:@@import.uncertain.name:Proveri naziv`,
  price: $localize`:@@import.uncertain.price:Proveri cenu`,
  duplicate: $localize`:@@import.uncertain.duplicate:Moguć duplikat`,
};

/** Upload/page errors by API code. */
export function importError(code: string): string {
  switch (code) {
    case 'import_limit_reached':
      return $localize`:@@import.error.limit:Iskorišćeni su svi uvozi za ovaj objekat. Neuspeli uvozi se ne računaju.`;
    case 'unsupported_file':
      return $localize`:@@import.error.unsupported:Taj format nije podržan. Pošalji JPEG, PNG, WebP ili PDF.`;
    case 'validation_failed':
      return $localize`:@@import.error.validation:Fajl je prevelik ili ima previše stranica (najviše 20, do 15 MB po fajlu).`;
    case 'imports_unavailable':
      return $localize`:@@import.error.unavailable:Uvoz trenutno nije dostupan na serveru.`;
    case 'invalid_import_state':
      return $localize`:@@import.error.state:Sačekaj da se stranica pročita, pa pokušaj ponovo.`;
    case 'forbidden':
      return $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`;
    default:
      return $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
  }
}
