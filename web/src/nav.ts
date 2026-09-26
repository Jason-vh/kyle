import type { Component } from "vue";
import IconFilmStrip from "~icons/ph/film-strip";
import IconFilmStripFill from "~icons/ph/film-strip-fill";
import IconHouse from "~icons/ph/house";
import IconHouseFill from "~icons/ph/house-fill";
import IconMagnifyingGlass from "~icons/ph/magnifying-glass";
import IconMagnifyingGlassFill from "~icons/ph/magnifying-glass-fill";
import IconTray from "~icons/ph/tray";
import IconTrayFill from "~icons/ph/tray-fill";

export interface NavLink {
  to: string;
  label: string;
  icon: Component;
  activeIcon: Component;
}

/** The places worth a tab. Everything else is reached from within them. */
export const NAV_LINKS: NavLink[] = [
  { to: "/home", label: "Home", icon: IconHouse, activeIcon: IconHouseFill },
  {
    to: "/discover",
    label: "Request",
    icon: IconMagnifyingGlass,
    activeIcon: IconMagnifyingGlassFill,
  },
  { to: "/library", label: "Library", icon: IconFilmStrip, activeIcon: IconFilmStripFill },
  { to: "/requests", label: "Requests", icon: IconTray, activeIcon: IconTrayFill },
];
