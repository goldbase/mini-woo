export const runtime = 'edge'; // или 'nodejs' (по умолчанию)
export const preferredRegion = 'auto'; // распределяет по ближайшим регионам
// import {NextRequest, NextResponse} from "next/server";
import woo from "@/lib/woo";

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams
    params.set('status', 'publish')
    const res = await woo.get('products', params)
    return NextResponse.json(await res.json())
}