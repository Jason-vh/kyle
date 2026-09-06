import type { IconName } from "./components/ui/types";

export interface NavLink {
  to: string;
  label: string;
  icon: IconName;
}

/** The places worth a tab. Everything else is reached from within them. */
export const NAV_LINKS: NavLink[] = [
  { to: "/home", label: "Home", icon: "home" },
  { to: "/discover", label: "Request", icon: "search" },
  { to: "/library", label: "Library", icon: "library" },
  { to: "/requests", label: "Yours", icon: "requests" },
];
