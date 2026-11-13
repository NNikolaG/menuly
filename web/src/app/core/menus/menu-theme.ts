/**
 * How a menu's public page is drawn: `MenuTheme` in backend/api/openapi.yaml.
 * Every value is a key of the Receipt design system, never a raw color or font,
 * so any combination a venue picks stays readable.
 */
export type MenuTemplate = 'racun' | 'galerija' | 'tabla' | 'etiketa' | 'plakat' | 'pastel';
export type MenuAccent =
  | 'tinta'
  | 'narandza'
  | 'espresso'
  | 'bordo'
  | 'maslina'
  | 'teget'
  | 'kobalt'
  | 'smaragd'
  | 'senf'
  | 'roze';
export type MenuFont = 'onest' | 'manrope' | 'plex';
export type MenuColorMode = 'auto' | 'light' | 'dark';
/**
 * Generated header band: Bauhaus shapes, "trake" (color bars), "mozaik" (animated glyph tiles),
 * "zrno" (drifting grain waves under a white header card) or "leptiri" (butterflies in a pastel sky).
 */
export type MenuPattern = 'bauhaus' | 'trake' | 'mozaik' | 'zrno' | 'leptiri';

export interface MenuTheme {
  template: MenuTemplate;
  accent: MenuAccent;
  font: MenuFont;
  color_mode: MenuColorMode;
  show_images: boolean;
  show_descriptions: boolean;
  show_pattern: boolean;
  pattern: MenuPattern;
  show_illustrations: boolean;
  logo_url: string;
  cover_url: string;
}

/** Same as the backend defaults (a menu that never saved a theme). */
export const DEFAULT_MENU_THEME: MenuTheme = {
  template: 'racun',
  accent: 'tinta',
  font: 'onest',
  color_mode: 'auto',
  show_images: true,
  show_descriptions: true,
  show_pattern: true,
  pattern: 'bauhaus',
  show_illustrations: false,
  logo_url: '',
  cover_url: '',
};

export interface MenuTemplateOption {
  value: MenuTemplate;
  label: string;
  description: string;
}

export const MENU_TEMPLATES: readonly MenuTemplateOption[] = [
  {
    value: 'racun',
    label: $localize`:@@theme.template.racun:Račun`,
    description: $localize`:@@theme.template.racunBody:Jedna kolona, isprekidane linije i cene desno. Najčitljiviji, za kafiće i barove.`,
  },
  {
    value: 'galerija',
    label: $localize`:@@theme.template.galerija:Galerija`,
    description: $localize`:@@theme.template.galerijaBody:Kartice sa velikom slikom. Za restorane sa fotografijama jela.`,
  },
  {
    value: 'tabla',
    label: $localize`:@@theme.template.tabla:Tabla`,
    description: $localize`:@@theme.template.tablaBody:Gusta lista sa krupnim tekstom i varijantama u kolonama. Za pića i duge menije.`,
  },
  {
    value: 'etiketa',
    label: $localize`:@@theme.template.etiketa:Etiketa`,
    description: $localize`:@@theme.template.etiketaBody:Svaka stavka kao etiketa sa šifrom i bojom kategorije, kombo kao ulaznica. Za moderne barove i bistroe.`,
  },
  {
    value: 'plakat',
    label: $localize`:@@theme.template.plakat:Plakat`,
    description: $localize`:@@theme.template.plakatBody:Crne kapsule za kategorije, krem papir i jedna tačka boje za preporuke. Za lokale sa jakim karakterom.`,
  },
  {
    value: 'pastel',
    label: $localize`:@@theme.template.pastel:Pastel`,
    description: $localize`:@@theme.template.pastelBody:Krem papir sa zrnom krede, tanka krupna slova, kombo kao list iz sveske i naslovna slika kao crtež pastelom. Za mirne bašte i kafiće.`,
  },
];

export const MENU_ACCENTS: readonly { value: MenuAccent; label: string }[] = [
  { value: 'tinta', label: $localize`:@@theme.accent.tinta:Tinta` },
  { value: 'narandza', label: $localize`:@@theme.accent.narandza:Pečena narandža` },
  { value: 'espresso', label: $localize`:@@theme.accent.espresso:Espresso` },
  { value: 'bordo', label: $localize`:@@theme.accent.bordo:Bordo` },
  { value: 'maslina', label: $localize`:@@theme.accent.maslina:Maslina` },
  { value: 'teget', label: $localize`:@@theme.accent.teget:Teget` },
  { value: 'kobalt', label: $localize`:@@theme.accent.kobalt:Kobalt` },
  { value: 'smaragd', label: $localize`:@@theme.accent.smaragd:Smaragd` },
  { value: 'senf', label: $localize`:@@theme.accent.senf:Senf` },
  { value: 'roze', label: $localize`:@@theme.accent.roze:Roze` },
];

/** `family` is the Google Fonts family, loaded only when a menu uses it. */
export const MENU_FONTS: readonly { value: MenuFont; label: string; family: string }[] = [
  { value: 'onest', label: 'Onest', family: 'Onest' },
  { value: 'manrope', label: 'Manrope', family: 'Manrope' },
  { value: 'plex', label: 'IBM Plex Sans', family: 'IBM Plex Sans' },
];

export const MENU_PATTERNS: readonly { value: MenuPattern; label: string }[] = [
  { value: 'bauhaus', label: $localize`:@@theme.pattern.bauhaus:Bauhaus` },
  { value: 'trake', label: $localize`:@@theme.pattern.trake:Trake` },
  { value: 'mozaik', label: $localize`:@@theme.pattern.mozaik:Mozaik` },
  { value: 'zrno', label: $localize`:@@theme.pattern.zrno:Zrno` },
  { value: 'leptiri', label: $localize`:@@theme.pattern.leptiri:Leptiri` },
];

/** "Zrno" follows the accent: warm accents get warm waves, the rest cool ones. */
export function grainMood(accent: MenuAccent): 'cool' | 'warm' {
  return ['narandza', 'espresso', 'bordo', 'senf', 'roze'].includes(accent) ? 'warm' : 'cool';
}

export const MENU_COLOR_MODES: readonly { value: MenuColorMode; label: string }[] = [
  { value: 'auto', label: $localize`:@@theme.mode.auto:Po telefonu` },
  { value: 'light', label: $localize`:@@theme.mode.light:Svetla` },
  { value: 'dark', label: $localize`:@@theme.mode.dark:Tamna` },
];
