"use client";

import { Feather } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";

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
import { MOTION } from "@/lib/motion";

/** `pathname` is `null` in the prerendered fallback (no item highlighted yet). */
function NavMenuItems({ items, pathname }: { items: readonly NavItem[]; pathname: string | null }) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = pathname !== null && isNavItemActive(item, pathname);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={item.label}
              // The sliding highlight below replaces the static active background.
              className="relative isolate data-[active=true]:bg-transparent"
            >
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    aria-hidden
                    className="absolute inset-0 -z-10 bg-sidebar-accent"
                    style={{ borderRadius: 8 }}
                    transition={MOTION.indicator}
                  />
                )}
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

function ActiveNavMenu({ items }: { items: readonly NavItem[] }) {
  return <NavMenuItems items={items} pathname={usePathname()} />;
}

/**
 * The current path is request data on dynamic routes; the Suspense boundary keeps the rest of
 * the shell prerendered and streams the active highlight in.
 */
function NavMenu({ items }: { items: readonly NavItem[] }) {
  return (
    <Suspense fallback={<NavMenuItems items={items} pathname={null} />}>
      <ActiveNavMenu items={items} />
    </Suspense>
  );
}

/** `footer` is server-rendered (e.g. sign-out, which depends on the environment). */
export function AppSidebar({ footer }: { footer?: ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      {/* One highlight shared by the main and footer menus, scoped to the sidebar. */}
      <LayoutGroup id="app-sidebar">
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
          {footer}
        </SidebarFooter>
      </LayoutGroup>
      <SidebarRail />
    </Sidebar>
  );
}
