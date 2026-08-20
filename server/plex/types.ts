/** A time-limited PIN the user claims by signing in to the Plex Auth App. */
export interface PlexPin {
  id: number;
  code: string;
  /** Null until the user has claimed the PIN. */
  authToken: string | null;
  expiresAt: string;
}

/** The plex.tv account behind an access token. */
export interface PlexAccount {
  id: number;
  uuid: string;
  username: string;
  email: string;
  title: string;
  thumb: string;
}
