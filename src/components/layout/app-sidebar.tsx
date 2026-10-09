"use client";

import { Feather } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  isNavItemActive,
  mainNavigation,
  secondaryNavigation,
  type NavItem,
} from "@/config/navigation";
import { messages } from "@/i18n";

function NavMenu({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <item.icon aria-hidden />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={messages.app.name}>
              <Link href="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Feather className="size-4" aria-hidden />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-heading text-base font-semibold">
                    {messages.app.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {messages.app.tagline}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={messages.nav.mainNavigation}>
          <SidebarGroup>
            <SidebarGroupLabel>{messages.nav.groupLabel}</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavMenu items={mainNavigation} />
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <NavMenu items={secondaryNavigation} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
