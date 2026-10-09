"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { findActiveNavItem } from "@/config/navigation";
import { messages } from "@/i18n";

import { ThemeToggle } from "./theme-toggle";

export function AppTopbar() {
  const pathname = usePathname();
  const current = findActiveNavItem(pathname);
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-4">
      <SidebarTrigger aria-label={messages.nav.toggleSidebar} />
      <Separator
        orientation="vertical"
        className="mr-1 data-vertical:h-4 data-vertical:self-center"
      />

      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {!isHome && (
            <>
              <BreadcrumbItem className="hidden sm:inline-flex">
                <BreadcrumbLink asChild>
                  <Link href="/">{messages.app.name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
            </>
          )}
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate font-medium">
              {current?.label ?? messages.app.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <ThemeToggle />
    </header>
  );
}
