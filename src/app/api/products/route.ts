import { NextRequest, NextResponse } from "next/server";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

// Убираем edge — переключаем на Node.js runtime
// export const runtime = "edge"; // УДАЛИТЬ эту строку

const woo = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  params.status = "publish"; // Только опубликованные

  try {
    const { data: products } = await woo.get("products", params);

    // Подгрузка вариаций (опционально, но полезно)
    const enrichedProducts = await Promise.all(
      products.map(async (product: any) => {
        if (product.type === "variable" && product.variations?.length > 0) {
          try {
            const { data: variations } = await woo.get(`products/${product.id}/variations`);
            product.variations = variations;
          } catch (e) {
            console.error(`Variations fetch error for product ${product.id}:`, e);
            product.variations = [];
          }
        } else {
          product.variations = [];
        }
        return product;
      })
    );

    return NextResponse.json(enrichedProducts, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error: any) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    return NextResponse.json(
      { error: "Failed to fetch products", details: error.message },
      { status: 500 }
    );
  }
}