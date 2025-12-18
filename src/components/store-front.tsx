"use client";

import { useAppContext } from "@/providers/context-provider";
import { memo, useCallback } from "react";

const categories = [
  { id: null, name: "Все товары" },
  { id: 1, name: "Подушки" },
  { id: 2, name: "Эргономические матрасы" },
  // Добавь реальные ID из WooCommerce
];

const StoreCategories = memo(() => {
  const { state, dispatch } = useAppContext();

const handleCategory = useCallback((id: number | null) => {
    if (id === null) {
        dispatch({ type: "select-cat", category: null });
    } else {
        // Находим объект категории по id (state.categories уже загружены)
        const category = state.categories.find(cat => cat.id === id);
        dispatch({ type: "select-cat", category: category || null });
    }
}, [dispatch, state.categories]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 px-4 scrollbar-hide">
      {categories.map((cat) => (
        <button
          key={cat.id ?? "all"}
          onClick={() => handleCategory(cat.id)}
          className={`
            relative whitespace-nowrap px-6 py-3 rounded-full font-bold text-sm transition-all duration-300
            ${state.selectedCategory === cat.id
              ? "bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] shadow-2xl scale-105"
              : "bg-gray-800/70 text-gray-400 hover:bg-gray-700/70 hover:text-white hover:shadow-lg"
            }
          `}
        >
          {cat.name}
          {state.selectedCategory === cat.id && (
            <div className="absolute inset-0 rounded-full shadow-2xl ring-4 ring-[#00e6cc]/30" />
          )}
        </button>
      ))}
    </div>
  );
});

StoreCategories.displayName = "StoreCategories";

export default StoreCategories;