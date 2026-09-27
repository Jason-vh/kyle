import type { AccountLinks } from "#shared/types";
import { apiFetch } from "./client";

export type { AccountLinks } from "#shared/types";

export interface LinkCode {
  code: string;
  expiresAt: string;
}

export function getAccountLinks(): Promise<AccountLinks> {
  return apiFetch<AccountLinks>("/api/account/links");
}

export function createLinkCode(platform: string): Promise<LinkCode> {
  return apiFetch<LinkCode>(`/api/account/links/${platform}/code`, { method: "POST" });
}

export async function unlinkAccount(linkId: string): Promise<void> {
  await apiFetch(`/api/account/links/${linkId}`, { method: "DELETE" });
}
