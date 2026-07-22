import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: { site: URL | undefined }) {
	const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
		(a, b) => b.data.published.valueOf() - a.data.published.valueOf(),
	);

	return rss({
		title: 'Blog',
		description: 'Blog posts from dominicmkennedy.com.',
		site: context.site!,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.published,
			link: `/blog/${post.id}/`,
		})),
	});
}
