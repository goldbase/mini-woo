// src/app/not-found.tsx
"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-[#0b182f] to-[#0f1e3a] text-white">
      <h1 className="text-6xl font-black mb-8">404</h1>
      <p className="text-2xl mb-8">Страница не найдена</p>
      <Link href="/" className="px-8 py-4 bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] rounded-3xl font-bold text-xl shadow-2xl hover:scale-105 transition-all">
        Вернуться в каталог
      </Link>
    </div>
  );
}