// src/lib/woo.ts

import { OrderInfo } from "@telegraf/types";

// --- Проверка и загрузка переменных окружения ---
const WOOCOMMERCE_URL_RAW = process.env.WOOCOMMERCE_URL?.trim();
const CONSUMER_KEY_RAW = process.env.WOOCOMMERCE_CONSUMER_KEY?.trim();
const CONSUMER_SECRET_RAW = process.env.WOOCOMMERCE_CONSUMER_SECRET?.trim();

if (!WOOCOMMERCE_URL_RAW || !CONSUMER_KEY_RAW || !CONSUMER_SECRET_RAW) {
    throw new Error(
        `WooCommerce env variables missing!\n` +
        `WOOCOMMERCE_URL: ${WOOCOMMERCE_URL_RAW ? 'OK' : 'MISSING'}\n` +
        `CONSUMER_KEY: ${CONSUMER_KEY_RAW ? 'OK' : 'MISSING'}\n` +
        `CONSUMER_SECRET: ${CONSUMER_SECRET_RAW ? 'OK' : 'MISSING'}\n` +
        `Check Vercel Environment Variables (Production environment).`
    );
}

// После проверки гарантируем, что значения — строки
const WOOCOMMERCE_URL = WOOCOMMERCE_URL_RAW!;
const CONSUMER_KEY = CONSUMER_KEY_RAW!;
const CONSUMER_SECRET = CONSUMER_SECRET_RAW!;

// --- Вспомогательные методы для HTTP-запросов ---
function put(api: string, body?: any, query?: URLSearchParams) {
    return call("PUT", api, query, body);
}

function post(api: string, body?: any, query?: URLSearchParams) {
    return call("POST", api, query, body);
}

function get(api: string, query?: URLSearchParams) {
    return call("GET", api, query);
}

// --- Основная функция выполнения запроса к WooCommerce REST API ---
async function call(
    method: string,
    api: string,
    query?: URLSearchParams,
    body?: any
): Promise<Response> {
    const headers: HeadersInit = {
        "Content-Type": "application/json",
    };

    // Надёжное формирование базового URL
    const baseUrl = new URL(`/wp-json/wc/v3/${api}`, WOOCOMMERCE_URL).toString();

    // Параметры запроса — аутентификация всегда добавляется
    const params = query ?? new URLSearchParams();
    params.set("consumer_key", CONSUMER_KEY);
    params.set("consumer_secret", CONSUMER_SECRET);

    const url = `${baseUrl}?${params.toString()}`;

    const init: RequestInit = {
        method,
        headers,
    };

    if (body !== undefined) {
        init.body = JSON.stringify(body);
    }

    console.log(`Proxy woo: ${method} ${url}`);

    const response = await fetch(url, init);

    // Обработка ошибок от WooCommerce (401, 403, 404 и т.д.)
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`WooCommerce API error ${response.status}: ${errorText}`);
        throw new Error(
            `WooCommerce API error: ${response.status} ${response.statusText}\n${errorText}`
        );
    }

    return response;
}

// --- Создание заказа ---
async function createOrder(line_items: any[], customer_note: string) {
    const body = {
        set_paid: false,
        line_items,
        customer_note,
    };
    const res = await post("orders", body);
    return await res.json();
}

// --- Обновление заказа (универсальная функция) ---
function updateOrder(orderId: number, update: any) {
    return put(`orders/${orderId}`, update);
}

// --- Заполнение данных покупателя и доставки из Telegram ---
function updateOrderInfo(orderId: number, orderInfo: OrderInfo) {
    const update = {
        shipping: {
            first_name: orderInfo.name ?? "",
            last_name: orderInfo.name ?? "",
            address_1: orderInfo.shipping_address?.street_line1 ?? "",
            address_2: orderInfo.shipping_address?.street_line2 ?? "",
            city: orderInfo.shipping_address?.city ?? "",
            state: orderInfo.shipping_address?.state ?? "",
            postcode: orderInfo.shipping_address?.post_code ?? "",
            country: orderInfo.shipping_address?.country_code ?? "",
        },
        billing: {
            first_name: orderInfo.name ?? "",
            last_name: orderInfo.name ?? "",
            email: orderInfo.email ?? "",
            phone: orderInfo.phone_number ?? "",
            address_1: orderInfo.shipping_address?.street_line1 ?? "",
            address_2: orderInfo.shipping_address?.street_line2 ?? "",
            city: orderInfo.shipping_address?.city ?? "",
            state: orderInfo.shipping_address?.state ?? "",
            postcode: orderInfo.shipping_address?.post_code ?? "",
            country: orderInfo.shipping_address?.country_code ?? "",
        },
    };
    return updateOrder(orderId, update);
}

// --- Установка статуса "Оплачено" ---
function setOrderPaid(orderId: number) {
    const update = {
        set_paid: true,
    };
    return updateOrder(orderId, update);
}

// --- Получение доступных методов доставки ---
async function getShippingOptions(zoneId: number) {
    const res = await get(`shipping/zones/${zoneId}/methods`);
    const methods: any[] = await res.json();

    return methods
        .filter((method) => method.enabled)
        .map((method) => ({
            id: method.method_id,
            title: method.method_title,
            // TODO: реализовать реальный расчёт стоимости доставки
            prices: [{ label: "Free", amount: 0 }],
        }));
}

// --- Экспорт объекта с методами ---
const woo = {
    get,
    createOrder,
    updateOrderInfo,
    setOrderPaid,
    getShippingOptions,
};

export default woo;