// src/components/store-front.tsx
"use client";

import { useEffect, useCallback, memo } from "react"; // ← Объединили импорты — ошибка исчезла
import StoreItem, { StoreItemSkeleton } from "@/components/store-item";
import { fetchProducts, useAppContext } from "@/providers/context-provider";
import StoreCategories from "@/components/store-categories";
import InfiniteScroll from "@/components/infinite-scroll";

import dynamic from "next/dynamic";

const StoreFrontInner = memo(() => {
    const { state, dispatch } = useAppContext();

    // Загрузка товаров: при первой загрузке или при смене категории
    const loadProducts = useCallback(() => {
        // Убрали state.prevCategory — его нет в контексте
        // Логика упрощена: загружаем, если товаров нет или категория изменилась
        // fetchProducts внутри обычно сам проверяет, нужно ли делать запрос
        if (state.products.length === 0 || state.selectedCategory) {
            fetchProducts(state, dispatch);
        }
    }, [
        state.products.length,
        state.selectedCategory, // Только реальные поля контекста
        dispatch,
    ]);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const isInitialLoading = state.loading && state.products.length === 0;

    const items = isInitialLoading
        ? Array(12)
              .fill(null)
              .map((_, index) => <StoreItemSkeleton key={`skeleton-${index}`} />)
        : state.products.map((product) => (
              <StoreItem key={product.id} product={product} />
          ));

    const handleLoadMore = useCallback(() => {
        fetchProducts(state, dispatch);
    }, [dispatch]); // state не нужен — он меняется часто, но fetchProducts использует актуальный state из контекста

    return (
        <section className="store-products">
            <StoreCategories />

            <div className="grid grid-cols-2 gap-4 px-4">
                {items}
            </div>

            <InfiniteScroll
                callback={handleLoadMore}
                hasMore={state.hasMore}
                loading={state.loading}
            />
        </section>
    );
});

StoreFrontInner.displayName = "StoreFrontInner";

export default dynamic(() => Promise.resolve(StoreFrontInner), {
    ssr: false,
    loading: () => (
        <section className="store-products">
            <StoreCategories />
            <div className="grid grid-cols-2 gap-4 px-4">
                {Array(12)
                    .fill(null)
                    .map((_, index) => (
                        <StoreItemSkeleton key={`initial-skeleton-${index}`} />
                    ))}
            </div>
        </section>
    ),
});