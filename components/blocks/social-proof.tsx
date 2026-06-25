import { IconStarFilled } from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const proofAvatars = [
  { img: 12, initials: "JB" },
  { img: 32, initials: "CM" },
  { img: 5, initials: "AL" },
  { img: 24, initials: "SK" },
];

function Stars() {
  return (
    <span className="flex text-foreground">
      {Array.from({ length: 5 }).map((_, i) => (
        <IconStarFilled key={i} className="size-3.5" />
      ))}
    </span>
  );
}

// Logo Shopify officiel deux-tons (sac vert + S blanc).
function ShopifyLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 292"
      aria-label="Shopify"
      role="img"
      className={className}
    >
      <path
        fill="#95BF47"
        d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.185-6.32-.805-.19.056-3.388 1.043-8.678 2.68-5.18-14.906-14.322-28.604-30.405-28.604-.444 0-.901.018-1.358.044C129.31 3.407 123.644.779 118.75.779c-37.465 0-55.364 46.835-60.976 70.635-14.558 4.511-24.9 7.718-26.221 8.133-8.126 2.549-8.383 2.805-9.45 10.462C21.3 95.806.157 259.234.157 259.234l164.741 30.864 89.255-19.302S223.976 58.801 223.774 57.34zM156.49 40.848l-14.019 4.339c.005-.988.01-1.96.01-3.023 0-9.264-1.286-16.723-3.349-22.636 8.287 1.04 13.806 10.469 17.358 21.32zm-27.638-19.483c2.304 5.773 3.802 14.058 3.802 25.238 0 .572-.005 1.095-.01 1.624-9.117 2.824-19.024 5.89-28.953 8.966 5.575-21.516 16.025-31.908 25.161-35.828zm-11.131-10.537c1.617 0 3.246.549 4.805 1.622-12.007 5.65-24.877 19.88-30.312 48.297l-22.886 7.088C75.694 46.16 90.81 10.828 117.72 10.828z"
      />
      <path
        fill="#5E8E3E"
        d="M221.237 54.983c-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.634-1.496-.959-2.394-1.099l-12.527 256.233 89.255-19.302S223.976 58.801 223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357z"
      />
      <path
        fill="#FFF"
        d="M135.242 104.585l-11.0 32.736s-9.643-5.147-21.461-5.147c-17.332 0-18.203 10.87-18.203 13.612 0 14.969 39.012 20.7 39.012 55.751 0 27.587-17.493 45.337-41.085 45.337-28.311 0-42.785-17.616-42.785-17.616l7.582-25.055s14.88 12.778 27.45 12.778c8.212 0 11.554-6.466 11.554-11.184 0-19.544-32.024-20.417-32.024-52.487 0-26.987 19.385-53.107 58.49-53.107 15.078 0 22.521 4.319 22.521 4.319z"
      />
    </svg>
  );
}

function Avatars() {
  return (
    <div className="flex -space-x-2">
      {proofAvatars.map((a) => (
        <Avatar key={a.img} className="size-8 ring-2 ring-background">
          <AvatarImage src={`https://i.pravatar.cc/64?img=${a.img}`} alt="" />
          <AvatarFallback>{a.initials}</AvatarFallback>
        </Avatar>
      ))}
      <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground ring-2 ring-background">
        +196
      </span>
    </div>
  );
}

export function SocialProof() {
  return (
    <div className="flex items-center gap-3">
      <Avatars />
      <div className="flex flex-col text-sm">
        <Stars />
        <span className="flex items-center gap-1.5 text-muted-foreground">
          Rejoint par 200+ marques
          <ShopifyLogo className="size-5" />
        </span>
      </div>
    </div>
  );
}
