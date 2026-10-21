"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const CampusDiscovery = dynamic(() => import("./CampusDiscovery"), { ssr: false });

/** Do not download the animation engine or fetch photos until near this section. */
export default function CampusDiscoverySection() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "450px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} style={{ minHeight: 760 }}>
    {visible ? <CampusDiscovery embedded /> : <div className="px-[5vw] py-16"><p className="text-xs text-persimmon">校园漫游</p><h2 className="mt-4 text-3xl font-medium">先被一座校园打动。</h2><Link href="/discover" prefetch={false} className="mt-5 inline-block text-sm underline">随便逛逛校园</Link></div>}
  </div>;
}
