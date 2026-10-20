"use client";

import { Suspense } from "react";

import GlobalSearchView from "@/components/search/GlobalSearchView";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GlobalSearchView />
    </Suspense>
  );
}
