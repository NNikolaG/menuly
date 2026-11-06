import { inject, Injectable } from '@angular/core';
import { forkJoin, map, of, switchMap, type Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import type {
  Category,
  CategoryInput,
  Item,
  ItemCreate,
  ItemInput,
  ItemWithVariants,
  Menu,
  MenuTree,
  PriceAdjustment,
  Variant,
  VariantInput,
} from './menu';
import type { MenuTheme } from './menu-theme';

const id = encodeURIComponent;

/** Menus of a venue and everything inside them: categories, items, variants. */
@Injectable({ providedIn: 'root' })
export class MenusApi {
  private readonly api = inject(ApiClient);

  /** Menus of `venueId()` without content; idle while it is undefined. */
  venueMenusResource(venueId: () => string | undefined) {
    return this.api.resource<{ items: Menu[] }>(() => {
      const venue = venueId();
      return venue ? `/v1/venues/${id(venue)}/menus` : undefined;
    });
  }

  /** Full tree for the editor: categories → items → variants, ordered by position. */
  menuResource(menuId: () => string | undefined) {
    return this.api.resource<MenuTree>(() => {
      const menu = menuId();
      return menu ? `/v1/menus/${id(menu)}` : undefined;
    });
  }

  /** The menu's theme; defaults when it never saved one. */
  themeResource(menuId: () => string | undefined) {
    return this.api.resource<MenuTheme>(() => {
      const menu = menuId();
      return menu ? `/v1/menus/${id(menu)}/theme` : undefined;
    });
  }

  /** Every menu of a venue with its content, e.g. to pick items for a combo. */
  venueTrees(venueId: string): Observable<MenuTree[]> {
    return this.api.get<{ items: Menu[] }>(`/v1/venues/${id(venueId)}/menus`).pipe(
      map((list) => list.items),
      switchMap((menus) =>
        menus.length
          ? forkJoin(menus.map((menu) => this.api.get<MenuTree>(`/v1/menus/${id(menu.id)}`)))
          : of([]),
      ),
    );
  }

  /** Owner, manager. Fields left out keep their value. */
  saveTheme(menuId: string, theme: Partial<MenuTheme>): Observable<MenuTheme> {
    return this.api.put(`/v1/menus/${id(menuId)}/theme`, theme);
  }

  createMenu(venueId: string, name: string): Observable<Menu> {
    return this.api.post(`/v1/venues/${id(venueId)}/menus`, { name });
  }

  renameMenu(menuId: string, name: string): Observable<Menu> {
    return this.api.patch(`/v1/menus/${id(menuId)}`, { name });
  }

  deleteMenu(menuId: string): Observable<void> {
    return this.api.delete(`/v1/menus/${id(menuId)}`);
  }

  publish(menuId: string): Observable<Menu> {
    return this.api.post(`/v1/menus/${id(menuId)}/publish`);
  }

  unpublish(menuId: string): Observable<Menu> {
    return this.api.post(`/v1/menus/${id(menuId)}/unpublish`);
  }

  /** Bulk price change; exactly one of `percent` / `amount_minor`. Answers how many prices changed. */
  adjustPrices(menuId: string, input: PriceAdjustment): Observable<{ updated: number }> {
    return this.api.post(`/v1/menus/${id(menuId)}/price-adjustments`, input);
  }

  createCategory(menuId: string, input: CategoryInput & { name: string }): Observable<Category> {
    return this.api.post(`/v1/menus/${id(menuId)}/categories`, input);
  }

  updateCategory(categoryId: string, input: CategoryInput): Observable<Category> {
    return this.api.patch(`/v1/categories/${id(categoryId)}`, input);
  }

  deleteCategory(categoryId: string): Observable<void> {
    return this.api.delete(`/v1/categories/${id(categoryId)}`);
  }

  reorderCategories(menuId: string, ids: string[]): Observable<{ items: Category[] }> {
    return this.api.put(`/v1/menus/${id(menuId)}/categories/order`, { ids });
  }

  createItem(categoryId: string, input: ItemCreate): Observable<ItemWithVariants> {
    return this.api.post(`/v1/categories/${id(categoryId)}/items`, input);
  }

  updateItem(itemId: string, input: ItemInput): Observable<ItemWithVariants> {
    return this.api.patch(`/v1/items/${id(itemId)}`, input);
  }

  /** Allowed for every role, staff included. */
  setItemStatus(
    itemId: string,
    status: Pick<ItemInput, 'is_available' | 'is_visible'>,
  ): Observable<Item> {
    return this.api.patch(`/v1/items/${id(itemId)}/status`, status);
  }

  deleteItem(itemId: string): Observable<void> {
    return this.api.delete(`/v1/items/${id(itemId)}`);
  }

  reorderItems(categoryId: string, ids: string[]): Observable<void> {
    return this.api.put(`/v1/categories/${id(categoryId)}/items/order`, { ids });
  }

  createVariant(
    itemId: string,
    input: VariantInput & { price_minor: number },
  ): Observable<Variant> {
    return this.api.post(`/v1/items/${id(itemId)}/variants`, input);
  }

  updateVariant(variantId: string, input: VariantInput): Observable<Variant> {
    return this.api.patch(`/v1/variants/${id(variantId)}`, input);
  }

  deleteVariant(variantId: string): Observable<void> {
    return this.api.delete(`/v1/variants/${id(variantId)}`);
  }
}
