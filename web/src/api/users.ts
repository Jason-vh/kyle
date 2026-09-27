import type { AdminUser } from "#shared/types";
import { apiFetch } from "./client";

export type { AdminUser } from "#shared/types";

export async function getUsers(): Promise<AdminUser[]> {
  const { users } = await apiFetch<{ users: AdminUser[] }>("/api/users");
  return users;
}

export async function renameUser(input: { id: string; displayName: string }): Promise<void> {
  await apiFetch(`/api/users/${input.id}`, {
    method: "PATCH",
    body: JSON.stringify({ displayName: input.displayName }),
  });
}

export async function mergeUsers(input: { from: string; into: string }): Promise<void> {
  await apiFetch(`/api/users/${input.into}/merge`, {
    method: "POST",
    body: JSON.stringify({ from: input.from }),
  });
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch(`/api/users/${id}`, { method: "DELETE" });
}

export async function unlinkIdentity(input: { userId: string; linkId: string }): Promise<void> {
  await apiFetch(`/api/users/${input.userId}/links/${input.linkId}`, { method: "DELETE" });
}
