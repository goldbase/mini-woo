// src/providers/context-provider.tsx
"use client";

import * as React from 'react';

type Mode = 'storefront' | 'order' | 'item';

export interface Product {
    id: number;
    name: string;
    description: string;
    short_description: string;
    price: string;
    regular_price: string;
    sale_price: string;
    price_html: string;
    images: Array<{
        src: string;
        alt?: string;
        thumbnail?: string;
    }>;
    type: 'simple' | 'variable'; // Добавлено: тип товара
    variations?: Array<{
        id: number;
        price_html: string;
        attributes: Array<{
            name: string;
            option: string;
        }>;
        image?: {
            src: string;
        };
    }>; // Добавлено: вариации для variable товаров
}

export interface Category {
    id: number;
    name: string;
    count: number;
}

export type CartItem = {
    product: Product; // Теперь может быть вариация
    count: number;
};

type Action =
    | { type: "mode"; mode: Mode }
    | { type: "storefront" }
    | { type: "order" }
    | { type: "item"; product: Product }
    | { type: "loading" }
    | { type: "products"; products: Product[]; hasMore: boolean; page: number; categoryId?: number }
    | { type: "categories"; categories: Category[] }
    | { type: "select-cat"; category: Category | null } // Теперь null для "Все товары"
    | { type: "inc"; product: Product }
    | { type: "dec"; product: Product }
    | { type: "comment"; comment: string };

type Dispatch = (action: Action) => void;

type State = {
    mode: Mode;
    loading: boolean;
    products: Product[];
    page: number;
    hasMore: boolean;
    categories: Category[];
    selectedCategory: Category | null; // null для "Все товары"
    selectedProduct?: Product;
    cart: Map<number, CartItem>;
    comment?: string;
    shippingZone: number;
};

const StateContext = React.createContext<{ state: State; dispatch: Dispatch } | undefined>(undefined);

function contextReducer(state: State, action: Action): State {
    switch (action.type) {
        case 'mode': {
            return { ...state, mode: action.mode };
        }
        case 'storefront':
        case 'order': {
            return { ...state, mode: action.type };
        }
        case 'item': {
            return { ...state, selectedProduct: action.product, mode: 'item' };
        }
        case 'loading': {
            return { ...state, loading: true };
        }
        case 'products': {
            // Если категория или страница не совпадают — игнорируем
            if (
                state.selectedCategory?.id !== action.categoryId ||
                state.page !== action.page - 1
            ) {
                return state;
            }
            return {
                ...state,
                products: [...state.products, ...action.products],
                page: action.page,
                loading: false,
                hasMore: action.hasMore,
            };
        }
        case 'categories': {
            return { ...state, categories: action.categories };
        }
        case 'select-cat': {
            const isSameCategory = state.selectedCategory?.id === action.category?.id;
            return {
                ...state,
                selectedCategory: isSameCategory ? null : action.category,
                products: [],
                page: 0,
                loading: true,
                hasMore: true,
            };
        }
        case 'inc': {
            const current = state.cart.get(action.product.id) || { product: action.product, count: 0 };
            const newCart = new Map(state.cart);
            newCart.set(action.product.id, { ...current, count: current.count + 1 });
            return { ...state, cart: newCart };
        }
        case 'dec': {
            const current = state.cart.get(action.product.id);
            if (!current || current.count <= 1) {
                const newCart = new Map(state.cart);
                newCart.delete(action.product.id);
                return { ...state, cart: newCart };
            }
            const newCart = new Map(state.cart);
            newCart.set(action.product.id, { ...current, count: current.count - 1 });
            return { ...state, cart: newCart };
        }
        case 'comment': {
            return { ...state, comment: action.comment };
        }
        default: {
            return state;
        }
    }
}

function ContextProvider({ children }: { children: React.ReactNode }) {
    const init: State = {
        mode: "storefront",
        loading: true,
        products: [],
        page: 0,
        hasMore: true,
        categories: [],
        selectedCategory: null,
        cart: new Map<number, CartItem>(),
        shippingZone: 1,
    };

    const [state, dispatch] = React.useReducer(contextReducer, init);

    const context = { state, dispatch };

    return <StateContext.Provider value={context}>{children}</StateContext.Provider>;
}

function useAppContext() {
    const context = React.useContext(StateContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within a ContextProvider');
    }
    return context;
}

const PER_PAGE = 12;

function fetchProducts(state: State, dispatch: Dispatch) {
    dispatch({ type: "loading" });

    const page = state.page + 1;
    const categoryId = state.selectedCategory?.id;

    let url = `/api/products?per_page=${PER_PAGE}&page=${page}&status=publish`;

    if (categoryId) {
        url += `&category=${categoryId}`;
    }

    fetch(url)
        .then((res) => res.json())
        .then((products) => {
            const hasMore = products.length === PER_PAGE;
            dispatch({ type: "products", products, page, hasMore, categoryId });
        })
        .catch((err) => console.error("Fetch products error:", err));
}

function fetchCategories(dispatch: Dispatch) {
    fetch("/api/categories?per_page=100")
        .then((res) => res.json())
        .then((categories) => dispatch({ type: "categories", categories }))
        .catch((err) => console.error("Fetch categories error:", err));
}

export { ContextProvider, useAppContext, fetchProducts, fetchCategories };