const SONARR_HOST = process.env.SONARR_HOST;
const SONARR_API_KEY = process.env.SONARR_API_KEY;

export interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  status: string;
  overview: string;
  monitored: boolean;
  seasons: { seasonNumber: number }[];
  tvdbId: number;
}

async function sonarrFetch(endpoint: string): Promise<unknown> {
  if (!SONARR_HOST || !SONARR_API_KEY) {
    throw new Error(
      "SONARR_HOST and SONARR_API_KEY environment variables are required"
    );
  }

  const url = `${SONARR_HOST}/api/v3${endpoint}`;
  const response = await fetch(url, {
    headers: { "X-Api-Key": SONARR_API_KEY },
  });

  if (!response.ok) {
    throw new Error(`Sonarr API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getAllSeries(): Promise<SonarrSeries[]> {
  return sonarrFetch("/series") as Promise<SonarrSeries[]>;
}
