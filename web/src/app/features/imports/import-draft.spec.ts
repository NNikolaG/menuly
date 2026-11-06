import type { ImportDraft } from '../../core/imports/import';
import { summarize, toDraft, toEdit } from './import-draft';

const draft: ImportDraft = {
  currency: 'RSD',
  categories: [
    {
      name: 'Roštilj',
      description: '',
      items: [
        {
          name: 'Ćevapi',
          description: '',
          page_index: 0,
          uncertain: [],
          variants: [{ label: '', price_minor: 75000, price_text: '750' }],
        },
        {
          name: 'Pljeskavica',
          description: '',
          page_index: 1,
          uncertain: ['price'],
          variants: [{ label: '', price_minor: null, price_text: '7?0' }],
        },
      ],
    },
    { name: 'Prazna', description: '', items: [] },
  ],
};

describe('import draft', () => {
  it('edits prices in major units and converts back', () => {
    const edit = toEdit(draft);
    expect(edit.categories[0].items[0].variants[0].price).toBe(750);
    expect(edit.categories[0].items[1].variants[0].price).toBeNull();
    edit.categories[0].items[1].variants[0].price = 790.5;
    const back = toDraft(edit);
    expect(back.categories[0].items[1].variants[0].price_minor).toBe(79050);
    // Empty categories are dropped; the printed text is kept.
    expect(back.categories.map((category) => category.name)).toEqual(['Roštilj']);
    expect(back.categories[0].items[1].variants[0].price_text).toBe('7?0');
  });

  it('counts what blocks the import', () => {
    expect(summarize(toEdit(draft))).toEqual({
      categories: 1,
      items: 2,
      toCheck: 1,
      missingPrices: 1,
      missingNames: 0,
    });
  });
});
