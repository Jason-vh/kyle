const TRAILING_YEAR = /\s+\((\d{4})\)$/;

export interface TitleAndYear {
  title: string;
  year?: number;
}

export function titleAndYear(title: string, year?: number): TitleAndYear {
  const match = TRAILING_YEAR.exec(title);
  if (!match) return { title, year };
  return { title: title.slice(0, match.index), year: year ?? Number(match[1]) };
}
