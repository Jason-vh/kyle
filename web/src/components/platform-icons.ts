import type { Component } from "vue";
import IconDiscord from "~icons/cib/discord";
import IconPlex from "~icons/cib/plex";
import IconSlack from "~icons/cib/slack";

export const PLATFORM_ICONS: Record<string, Component> = {
  plex: IconPlex,
  slack: IconSlack,
  discord: IconDiscord,
};
