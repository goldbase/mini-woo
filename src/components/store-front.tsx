"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { fetchProducts, useAppContext } from "@/providers/context-provider";
import StoreItem, { StoreItemSkeleton } from "@/components/store-item";
import StoreCategories from "@/components/store-categories";

const StoreFront = memo(() => {
  const { state, dispatch } = useAppContext();

  // Показываем только в storefront-режиме
  if (state.mode !== "storefront") return null;

  // Главная загрузка: при первом входе и при смене категории
  useEffect(() => {
    // Сброс и загрузка первой страницы при смене категории или первом входе
    if (state.products.length === 0 && state.hasMore && !state.loading) {
      fetchProducts(state, dispatch);
    }
  }, [state.selectedCategory?.id, state.hasMore, state.loading, state.products.length, dispatch]);

  // Подгрузка следующей страницы
  const loadMore = useCallback(() => {
    if (state.loading || !state.hasMore) return;
    fetchProducts(state, dispatch);
  }, [state.loading, state.hasMore, state, dispatch]);

  // Мемоизация списка товаров + скелетоны
  const items = useMemo(() => {
    const list = state.products.map((p) => <StoreItem key={p.id} product={p} />);

    // Скелетоны при подгрузке (не при первой загрузке — там уже есть)
    if (state.loading && state.products.length > 0) {
      return [
        ...list,
        ...Array.from({ length: 6 }).map((_, i) => <StoreItemSkeleton key={`load-${i}`} />),
      ];
    }

    return list;
  }, [state.products, state.loading]);

  // Обработка пустого списка
  if (state.products.length === 0 && !state.loading) {
    return (
      <section className="px-4 pt-12 text-center">
        <StoreCategories />
        <p className="text-xl text-gray-400 mt-12">Товаров не найдено</p>
      </section>
    );
  }

  return (
    <section className="px-4 pb-24">
      <StoreCategories />
      <div className="grid grid-cols-2 gap-4 mt-6">
        {items}
      </div>

      {/* Кнопка "Показать ещё" — для теста пагинации */}
      {state.hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={loadMore}
            disabled={state.loading}
            className="px-8 py-4 rounded-full font-bold bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] shadow-2xl hover:shadow-3xl hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
          >
            {state.loading ? "Загрузка..." : "Показать ещё"}
          </button>
        </div>
      )}
    </section>
  );
});

StoreFront.displayName = "StoreFront";

export default StoreFront;