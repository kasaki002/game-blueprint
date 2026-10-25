"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Navbar } from "./navbar";
import { Sidebar } from "./sidebar";
import { api } from "@/lib/api-client";

export function MainShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (media.matches) setMobileOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    let active = true;
    api.me().then(() => { if (active) setReady(true); }).catch(() => {
      if (active) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });
    return () => { active = false; };
  }, [pathname, router]);

  if (!ready) return <div className="grid h-screen place-items-center bg-background text-sm text-muted-foreground">正在验证登录状态...</div>;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
