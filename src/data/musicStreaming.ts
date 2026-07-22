export const streamingServices = [
	{ key: 'spotify', label: 'Spotify' },
	{ key: 'bandcamp', label: 'Bandcamp' },
	{ key: 'appleMusic', label: 'Apple Music' },
	{ key: 'youtubeMusic', label: 'YouTube Music' },
	{ key: 'tidal', label: 'TIDAL' },
	{ key: 'qobuz', label: 'Qobuz' },
] as const;

export type StreamingServiceKey = (typeof streamingServices)[number]['key'];
