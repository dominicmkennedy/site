const dateFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
	timeZone: 'UTC',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
});

export function formatDate(date: Date) {
	return dateFormatter.format(date);
}

export function formatShortDate(date: Date) {
	return shortDateFormatter.format(date);
}
