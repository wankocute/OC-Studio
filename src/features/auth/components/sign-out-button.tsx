import { LogOut } from "lucide-react";
import { connection } from "next/server";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { messages } from "@/i18n";

import { loadAuthConfig } from "../config";
import { LOGOUT_PATH } from "../constants";

/**
 * Sidebar sign-out. Rendered only when login is enabled (never a button that does nothing in a
 * local `pnpm dev` without a password). Reads the environment at request time: keep it under
 * `<Suspense>`.
 */
export async function SignOutButton() {
  await connection();
  if (loadAuthConfig().status !== "enabled") return null;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <form action={LOGOUT_PATH} method="post">
          <SidebarMenuButton type="submit" tooltip={messages.auth.signOut}>
            <LogOut aria-hidden />
            <span>{messages.auth.signOut}</span>
          </SidebarMenuButton>
        </form>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
