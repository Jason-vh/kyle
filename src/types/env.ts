export interface Env {
	// OpenAI API
	OPENAI_API_KEY: string;

	// Slack API
	SLACK_BOT_TOKEN: string;
	SLACK_SIGNING_SECRET: string;

	// Logging
	AXIOM_DATASET: string;

	// Media Service APIs
	RADARR_API_KEY: string;
	RADARR_HOST: string;
	SONARR_API_KEY: string;
	SONARR_HOST: string;
	ULTRA_API_TOKEN: string;
	ULTRA_HOST: string;
	QBITTORRENT_HOST: string;
	QBITTORRENT_USERNAME: string;
	QBITTORRENT_PASSWORD: string;
	AXIOM_TOKEN: string;
	TMDB_API_TOKEN: string;

	// Server Configuration
	PORT: string;
	NODE_ENV: "production" | "development";
}
