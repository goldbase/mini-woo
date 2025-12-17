// src/components/store-categories.tsx
"use client";

import { useEffect, useCallback, memo } from "react";
import { fetchCategories, useAppContext } from "@/providers/context-provider";

// Тип категории из WooCommerce
interface Category {
    id: number;
    name: string;
}

// Скелетон для категорий (пока загружаются)
const CategoriesSkeleton = memo(() => (
    <div className="store-categories flex gap-4 overflow-x-auto pb-2 px-4">
        {Array(6)
            .fill(null)
            .map((_, i) => (
                <div
                    key={`skeleton-cat-${i}`}
                    className="animate-pulse bg-gray-300 rounded-full px-6 py-3 min-w-32"
                />
            ))}
    </div>
));

CategoriesSkeleton.displayName = "CategoriesSkeleton";

const StoreCategories = memo(() => {
    const { state, dispatch } = useAppContext();

    // Загрузка категорий один раз
    const loadCategories = useCallback(() => {
        if (state.categories.length === 0) {
            fetchCategories(dispatch);
        }
    }, [state.categories.length, dispatch]);

    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    // Выбор категории с haptic feedback
    const handleSelect = useCallback(
        (category: Category | null) => {
            // Быстрый обход TS ошибки — редьюсер принимает null, но типы не позволяют
            dispatch({
                type: "select-cat",
                category,
            } as any);

            // Haptic feedback для премиум UX в Telegram
            if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
                (globalThis as any).Telegram.WebApp.HapticFeedback.selectionChanged();
            }
        },
        [dispatch]
    );

    // "Все товары" активно, если selectedCategory null или undefined
    const isAllSelected = state.selectedCategory == null;

    // Пока категории не загружены — скелетон
    if (state.categories.length === 0) {
        return <CategoriesSkeleton />;
    }

    return (
        <div className="store-categories flex gap-3 overflow-x-auto pb-3 px-4 scrollbar-hide">
            {/* Кнопка "Все товары" — всегда первая */}
            <div
                className={`category-tab whitespace-nowrap px-5 py-2 rounded-full transition-all duration-200 cursor-pointer font-medium ${
                    isAllSelected
                        ? "bg-[var(--accent-color)] text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
                onClick={() => handleSelect(null)}
            >
                Все товары
            </div>

            {/* Остальные категории из WooCommerce */}
            {state.categories.map((category) => {
                const isSelected = state.selectedCategory?.id === category.id;

                return (
                    <div
                        key={category.id}
                        className={`category-tab whitespace-nowrap px-5 py-2 rounded-full transition-all duration-200 cursor-pointer font-medium ${
                            isSelected
                                ? "bg-[var(--accent-color)] text-white"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                        onClick={() => handleSelect(category)}
                    >
                        {category.name}
                    </div>
                );
            })}
        </div>
    );
});

StoreCategories.displayName = "StoreCategories";

export default StoreCategories;
