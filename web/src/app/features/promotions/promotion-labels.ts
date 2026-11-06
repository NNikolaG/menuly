import type { PromotionStatus } from '../../core/promotions/promotion';

/** Badge text and tone of a combo's status. */
export const STATUS: Record<PromotionStatus, { label: string; tone: string }> = {
  live: { label: $localize`:@@promo.status.live:Aktivna`, tone: 'success' },
  scheduled: { label: $localize`:@@promo.status.scheduled:Zakazana`, tone: 'info' },
  expired: { label: $localize`:@@promo.status.expired:Istekla`, tone: 'warning' },
  inactive: { label: $localize`:@@promo.status.inactive:Isključena`, tone: 'danger' },
};
