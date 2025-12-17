// src/components/store-front.tsx
"use client";

import { useEffect } from "react";
import StoreItem, { StoreItemSkeleton } from "@/components/store-item";
import { fetchProducts, useAppContext } from "@/providers/context-provider";
import StoreCategories from "@/components/store-categories";
import InfiniteScroll from "@/components/infinite-scroll";

// Добавляем dynamic import с ssr: false
import dynamic from "next/dynamic";

const StoreFrontInner = () => {
    const { state, dispatch } = useAppContext();

    useEffect(() => {
        // Загружаем при первой загрузке и при смене категории
        if (state.products.length === 0 || state.selectedCategory) {
            fetchProducts(state, dispatch);
        }
    }, [state.selectedCategory, state, dispatch]);

    const items = state.loading && state.products.length === 0
        ? Array(12).fill(0).map((_, index) => <StoreItemSkeleton key={`skeleton-${index}`} />)
        : state.products.map((product) => <StoreItem key={product.id} product={product} />);

    return (
        <section className="store-products">
            <StoreCategories />
            <div className="grid grid-cols-2 gap-4">{items}</div>
            <InfiniteScroll
                callback={() => fetchProducts(state, dispatch)}
                hasMore={state.hasMore}
                loading={state.loading}
            />
        </section>
    );
};

// Отключаем SSR полностью — гидратация не будет сравниваться
export default dynamic(() => Promise.resolve(StoreFrontInner), { ssr: false });