// src/components/store-front.tsx
"use client";

import { useEffect, useCallback, useMemo, memo } from "react";
import StoreItem, { StoreItemSkeleton } from "@/components/store-item";
import { fetchProducts, useAppContext } from "@/providers/context-provider";
import StoreCategories from "@/components/store-categories";
import InfiniteScroll from "@/components/infinite-scroll";
import dynamic from "next/dynamic";

const StoreFrontInner = memo(() => {
    const { state, dispatch } = useAppContext();

    // Загрузка товаров при первой загрузке или смене категории
    const loadProducts = useCallback(() => {
        // Если товаров нет или выбрана категория — загружаем
        if (state.products.length === 0 || state.selectedCategory !== null) {
            fetchProducts(state, dispatch);
        }
    }, [state.products.length, state.selectedCategory, dispatch]);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    // Скелетоны только при первой загрузке
    const isInitialLoading = state.loading && state.products.length === 0;

    // Мемоизация списка товаров — избегаем лишних ререндеров при скролле
    const items = useMemo(() => {
        return isInitialLoading
            ? Array(12)
                  .fill(null)
                  .map((_, index) => <StoreItemSkeleton key={`skeleton-${index}`} />)
            : state.products.map((product) => (
                  <StoreItem key={product.id} product={product} />
              ));
    }, [isInitialLoading, state.products]);

    // Подгрузка при скролле
    const handleLoadMore = useCallback(() => {
        fetchProducts(state, dispatch);
    }, [state, dispatch]);

    return (
        <section className="store-products pb-24"> {/* pb-24 — отступ для нижней панели */}
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

// Полностью клиентский компонент — нет hydration mismatch в Telegram
export default dynamic(() => Promise.resolve(StoreFrontInner), {
    ssr: false,
    loading: () => (
        <section className="store-products pb-24">
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