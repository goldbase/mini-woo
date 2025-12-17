// src/app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import woo from "@/lib/woo";

// Edge Runtime — максимальная скорость для Telegram Mini App (рекомендую для РФ/СНГ)
export const runtime = "edge";

// Автоматический выбор ближайшего региона (или фиксированные: ['fra1', 'waw1'] для РФ)
export const preferredRegion = "auto";
// Альтернатива для РФ/СНГ: export const preferredRegion = ['fra1', 'waw1', 'dub1'];

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;

    // Фильтр только опубликованных товаров (безопасность)
    params.set("status", "publish");

    try {
        const res = await woo.get("products", params);

        if (!res.ok) {
            const errorText = await res.text();
            console.error("WooCommerce API error:", res.status, errorText);
            return NextResponse.json(
                { error: "Failed to fetch products", details: errorText },
                { status: res.status }
            );
        }

        const products = await res.json();

        // Кэширование на Vercel Edge (5 мин) — снижает нагрузку на WooCommerce
        return NextResponse.json(products, {
            headers: {
                "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
            },
        });
    } catch (error) {
        console.error("Proxy error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}