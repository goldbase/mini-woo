// src/app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import woo from "@/lib/woo";

// Edge Runtime — максимальная скорость для Telegram Mini App
export const runtime = "edge";
export const preferredRegion = "auto"; // или ['fra1', 'waw1'] для РФ/СНГ

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
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

        let products = await res.json();

        // Fallback: если scaled-изображение битое или отсутствует — используем thumbnail
        products = products.map((product: any) => {
            if (product.images && product.images.length > 0) {
                const primary = product.images[0];

                // Если src пустой или содержит "placeholder" / 404 — меняем на thumbnail
                if (
                    !primary.src ||
                    primary.src.includes("placeholder") ||
                    primary.src.includes("woocommerce-placeholder")
                ) {
                    primary.src = primary.thumbnail || "/no-image.png"; // крайний fallback
                }
            }
            return product;
        });

        // Кэширование на Edge (5 мин)
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