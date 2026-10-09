import type { Route } from "next";
import {
  BookUser,
  LayoutDashboard,
  LibraryBig,
  type LucideIcon,
  NotebookTabs,
  Settings,
} from "lucide-react";

import { messages } from "@/i18n";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

export const mainNavigation: readonly NavItem[] = [
  { href: "/", label: messages.nav.dashboard, icon: LayoutDashboard },
  { href: "/characters", label: messages.nav.characters, icon: BookUser },
  { href: "/collections", label: messages.nav.collections, icon: LibraryBig },
  { href: "/templates", label: messages.nav.templates, icon: NotebookTabs },
];

export const secondaryNavigation: readonly NavItem[] = [
  { href: "/settings", label: messages.nav.settings, icon: Settings },
];

const allNavigation = [...mainNavigation, ...secondaryNavigation];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The nav item matching the current path, used for the topbar page title. */
export function findActiveNavItem(pathname: string): NavItem | undefined {
  return allNavigation.find((item) => isNavItemActive(item, pathname));
}
