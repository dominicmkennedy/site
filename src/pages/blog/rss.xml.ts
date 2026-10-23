import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: { site: URL | undefined }) {
	const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
		(a, b) => b.data.published.valueOf() - a.data.published.valueOf(),
	);

	return rss({
		title: 'Dominic Kennedy',
		description: 'Blog posts from dominicmkennedy.com.',
		site: context.site!,
		items: posts.map((post) => {
			const permalink = new URL(`/blog/${post.id}/`, context.site!);
			return {
				title: post.data.title,
				description: `<p>${post.data.description}</p><p><a href="${permalink.href}">Read the post</a></p>`,
				pubDate: post.data.published,
				link: permalink.href,
			};
		}),
	});
}
