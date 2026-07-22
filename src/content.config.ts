import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blogPostSchema = z.object({
	title: z.string(),
	description: z.string(),
	published: z.coerce.date(),
	draft: z.boolean().optional().default(false),
});

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
	schema: blogPostSchema,
});

const streamingSchema = z
	.object({
		spotify: z.url().optional(),
		bandcamp: z.url().optional(),
		appleMusic: z.url().optional(),
		youtubeMusic: z.url().optional(),
		tidal: z.url().optional(),
		qobuz: z.url().optional(),
	})
	.strict();

const music = defineCollection({
	loader: glob({ base: './src/content/music', pattern: '**/*.md' }),
	schema: z.object({
		album: z.string().min(1),
		artist: z.string().min(1),
		artistUrl: z.url().optional(),
		mbAlbumUrl: z.url(),
		releaseDate: z.coerce.date(),
		reviewed: z.coerce.date(),
		streaming: streamingSchema.optional(),
	}),
});

export const collections = { blog, music };
