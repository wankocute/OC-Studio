import { Suspense } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <SmoothScroll />
      <AppSidebar
        footer={
          <Suspense fallback={null}>
            <SignOutButton />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0">
        <AppTopbar />
        <div className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
