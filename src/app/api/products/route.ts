import { NextRequest, NextResponse } from "next/server";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const woo = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
  axiosConfig: {
    headers: {
      "User-Agent": "Next.js Mini App",
    },
  },
});

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);

  // Принудительно только опубликованные
  params.status = "publish";

  try {
    const response = await woo.get("products", params);

    let products = response.data;

    // Подгрузка вариаций для variable товаров
    products = await Promise.all(
      products.map(async (product: any) => {
        if (product.type === "variable" && product.variations?.length > 0) {
          try {
            const varsRes = await woo.get(`products/${product.id}/variations`);
            product.variations = varsRes.data;
          } catch (e) {
            console.error(`Variations error for product ${product.id}:`, e);
            product.variations = [];
          }
        } else {
          product.variations = [];
        }
        return product;
      })
    );

    return NextResponse.json(products, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error: any) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    return NextResponse.json(
      { error: "Failed to fetch products", details: error.response?.data || error.message },
      { status: 500 }
    );
  }
}