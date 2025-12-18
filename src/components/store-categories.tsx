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
    <div className="flex gap-4 overflow-x-auto pb-4 px-4 scrollbar-hide">
        {/* "Все товары" */}
        <button
            onClick={() => handleSelect(null)}
            className={`
                relative whitespace-nowrap px-6 py-3 rounded-full font-bold text-sm transition-all duration-300 shadow-md
                ${isAllSelected
                    ? "bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] shadow-2xl scale-105"
                    : "bg-gray-800/70 text-gray-400 hover:bg-gray-700/70 hover:text-white hover:shadow-lg"
                }
            `}
        >
            Все товары
            {isAllSelected && (
                <div className="absolute inset-0 rounded-full ring-4 ring-[#00e6cc]/30 pointer-events-none" />
            )}
        </button>

        {/* Категории из WooCommerce */}
        {state.categories.map((category) => {
            const isSelected = state.selectedCategory?.id === category.id;
            return (
                <button
                    key={category.id}
                    onClick={() => handleSelect(category)}
                    className={`
                        relative whitespace-nowrap px-6 py-3 rounded-full font-bold text-sm transition-all duration-300 shadow-md
                        ${isSelected
                            ? "bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] shadow-2xl scale-105"
                            : "bg-gray-800/70 text-gray-400 hover:bg-gray-700/70 hover:text-white hover:shadow-lg"
                        }
                    `}
                >
                    {category.name}
                    {isSelected && (
                        <div className="absolute inset-0 rounded-full ring-4 ring-[#00e6cc]/30 pointer-events-none" />
                    )}
                </button>
            );
        })}
    </div>
);

StoreCategories.displayName = "StoreCategories";

export default StoreCategories;
