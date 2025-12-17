// src/app/not-found.tsx
"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-[#0b182f] to-[#0f1e3a] text-white px-8">
      <h1 className="text-8xl font-black mb-8 text-[#00e6cc] drop-shadow-lg">404</h1>
      <p className="text-3xl font-bold mb-12 text-center">Страница не найдена</p>
      <Link 
        href="/" 
        className="px-12 py-6 bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] rounded-3xl font-black text-2xl shadow-2xl hover:scale-105 transition-all"
      >
        Вернуться в каталог
      </Link>
    </div>
  );
}