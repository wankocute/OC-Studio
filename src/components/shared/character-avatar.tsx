import Image from "next/image";

import { getInitials } from "@/features/characters/initials";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "size-9 text-sm", pixels: 36 },
  md: { box: "size-12 text-base", pixels: 48 },
  lg: { box: "size-20 text-2xl", pixels: 80 },
  xl: { box: "size-28 text-3xl md:size-32", pixels: 128 },
} as const;

type CharacterAvatarProps = {
  name: string;
  /** Media id of the avatar, served by `/media/[id]`. */
  mediaId?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Avatar image, or the character's initials on a tinted disc. */
export function CharacterAvatar({ name, mediaId, size = "md", className }: CharacterAvatarProps) {
  const { box, pixels } = SIZES[size];
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-heading font-semibold text-accent-foreground ring-1 ring-foreground/10",
        box,
        className,
      )}
    >
      {mediaId ? (
        <Image
          src={`/media/${mediaId}`}
          alt={messages.media.avatarAlt(name)}
          width={pixels * 2}
          height={pixels * 2}
          // Served by our own route with long-lived caching; no optimizer needed.
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden>{getInitials(name) || "?"}</span>
      )}
    </span>
  );
}
