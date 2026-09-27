import type { Person } from "#shared/types";
import { formatNames } from "./format";

export function youFirst<T extends Person>(people: T[]): T[] {
  return people.toSorted((a, b) => Number(b.you === true) - Number(a.you === true));
}

export function nameOf(person: Person): string {
  return person.you ? "you" : person.name;
}

export function namesOf(people: Person[]): string {
  return formatNames(youFirst(people).map(nameOf));
}

export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
