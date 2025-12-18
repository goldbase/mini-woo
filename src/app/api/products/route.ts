import { NextRequest, NextResponse } from "next/server";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

export const runtime = "nodejs";

const woo = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
});

export async function GET(request: NextRequest) {
  const params: Record<string, any> = Object.fromEntries(request.nextUrl.searchParams);

  // только опубликованные
  params.status = "publish";
  // подстрахуем пагинацию
  if (params.per_page) params.per_page = Number(params.per_page) || 12;
  if (params.page) params.page = Number(params.page) || 1;

  try {
    const { data: products } = await woo.get("products", params);

    // Если нужен выбор вариаций + корректные цены — подтянем вариации
    const enriched = await Promise.all(
      (products || []).map(async (p: any) => {
        if (p?.type === "variable") {
          try {
            const { data: vars } = await woo.get(`products/${p.id}/variations`, {
              per_page: 100,
              status: "publish",
            });
            p.variations = vars || [];
          } catch {
            p.variations = [];
          }
        } else {
          p.variations = [];
        }
        return p;
      })
    );

    return NextResponse.json(enriched, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error: any) {
    console.error("[/api/products] WooCommerce error:", error.response?.data || error.message);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
