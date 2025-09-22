export interface Env {
	// OpenAI API
	OPENAI_API_KEY: string;

	// Slack API
	SLACK_BOT_TOKEN: string;
	SLACK_SIGNING_SECRET: string;

	// Media Service APIs
	RADARR_API_KEY: string;
	RADARR_HOST: string;
	SONARR_API_KEY: string;
	SONARR_HOST: string;
	ULTRA_API_TOKEN: string;
	ULTRA_HOST: string;

	// Server Configuration
	PORT: string;
	NODE_ENV: "production" | "development";
}
