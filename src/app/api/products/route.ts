// src/app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import woo from "@/lib/woo";

export const runtime = "edge";
export const preferredRegion = "auto";

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

        // Подгружаем вариации для variable products
        products = await Promise.all(
            products.map(async (product: any) => {
                if (product.type === "variable" && product.variations?.length > 0) {
                    const variationsRes = await woo.get(`products/${product.id}/variations`);
                    if (variationsRes.ok) {
                        product.variations = await variationsRes.json();
                    } else {
                        product.variations = [];
                    }
                } else {
                    product.variations = [];
                }
                return product;
            })
        );

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