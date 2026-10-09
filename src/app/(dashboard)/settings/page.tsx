import { Bot, Database, Languages, type LucideIcon, Palette } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeSelector } from "@/features/settings/components/theme-selector";
import { messages } from "@/i18n";

const t = messages.settings;

export const metadata: Metadata = { title: t.title };

type SettingsSectionProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  comingSoon?: boolean;
  children?: ReactNode;
};

function SettingsSection({
  icon: Icon,
  title,
  description,
  comingSoon,
  children,
}: SettingsSectionProps) {
  return (
    <Card aria-disabled={comingSoon || undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        {comingSoon && (
          <CardAction>
            <Badge variant="outline" className="text-muted-foreground">
              {messages.common.comingSoon}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <div className="grid gap-4">
        <SettingsSection
          icon={Palette}
          title={t.appearanceTitle}
          description={t.appearanceDescription}
        >
          <ThemeSelector />
        </SettingsSection>

        <SettingsSection
          icon={Languages}
          title={t.languageTitle}
          description={t.languageDescription}
        >
          <p className="text-sm">
            <span className="font-medium">{t.languageCurrent}</span>
            <span className="text-muted-foreground"> — {messages.common.notAvailableYet}</span>
          </p>
        </SettingsSection>

        <SettingsSection icon={Bot} title={t.aiTitle} description={t.aiDescription} comingSoon />

        <SettingsSection
          icon={Database}
          title={t.dataTitle}
          description={t.dataDescription}
          comingSoon
        />
      </div>
    </div>
  );
}
