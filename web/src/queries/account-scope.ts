import type { EntryKey } from "@pinia/colada";
import type { AuthUser } from "#web/api/auth";

export function scopedKey(key: EntryKey, user: AuthUser | null | undefined): EntryKey {
  return [...key, user?.id ?? null, user?.admin ?? false];
}

export function isScopedTo(key: EntryKey, user: AuthUser | null | undefined): boolean {
  return key.at(-2) === (user?.id ?? null) && key.at(-1) === (user?.admin ?? false);
}
