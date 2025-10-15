export interface OdesliPlatformLink {
	url: string;
	nativeAppUriMobile?: string;
	nativeAppUriDesktop?: string;
	entityUniqueId: string;
}

export interface OdesliEntity {
	id: string;
	type: string;
	title?: string;
	artistName?: string;
	thumbnailUrl?: string;
	thumbnailWidth?: number;
	thumbnailHeight?: number;
	apiProvider: string;
	platforms: string[];
}

export interface OdesliResponse {
	entityUniqueId: string;
	userCountry: string;
	pageUrl: string;
	linksByPlatform: {
		spotify?: OdesliPlatformLink;
		appleMusic?: OdesliPlatformLink;
		youtube?: OdesliPlatformLink;
		youtubeMusic?: OdesliPlatformLink;
		deezer?: OdesliPlatformLink;
		tidal?: OdesliPlatformLink;
		amazonMusic?: OdesliPlatformLink;
		soundcloud?: OdesliPlatformLink;
		napster?: OdesliPlatformLink;
		yandex?: OdesliPlatformLink;
		pandora?: OdesliPlatformLink;
		[key: string]: OdesliPlatformLink | undefined;
	};
	entitiesByUniqueId: {
		[key: string]: OdesliEntity;
	};
}
