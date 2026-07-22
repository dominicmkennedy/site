import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { streamingServices } from '../../data/musicStreaming';

export async function GET(context: { site: URL | undefined }) {
	const recommendations = (await getCollection('music')).sort(
		(a, b) => b.data.reviewed.valueOf() - a.data.reviewed.valueOf(),
	);

	return rss({
		title: 'Music recommendations from Dominic Kennedy',
		description: 'Brief album recommendations from dominicmkennedy.com.',
		site: context.site!,
		items: recommendations.map((recommendation) => {
			const recommendationHtml = recommendation.rendered?.html ?? '';
			const permalink = new URL('/music/', context.site!);
			permalink.hash = recommendation.id;
			const streamingLinks = streamingServices.flatMap(({ key, label }) => {
				const href = recommendation.data.streaming?.[key];
				return href ? [`<li><a href="${href}">${label}</a></li>`] : [];
			});
			const streamingHtml =
				streamingLinks.length > 0
					? `<h2>Listen</h2><ul>${streamingLinks.join('')}</ul>`
					: '';

			return {
				title: `${recommendation.data.album} by ${recommendation.data.artist}`,
				description: recommendationHtml,
				content: `${recommendationHtml}${streamingHtml}`,
				pubDate: recommendation.data.reviewed,
				link: permalink.href,
			};
		}),
	});
}
