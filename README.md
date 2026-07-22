# dominicmkennedy.com

## Dev

Install dependencies and start Astro's development server:

```sh
npm install
npm run dev
# runs on `http://localhost:4321`.
```

Run the project checks with:

```sh
npm run format:check
npm run check
npm run build
```

## Pages

- `src/pages/index.astro` for the homepage.
- `src/pages/directory.astro` for the directory.
- `src/pages/blog/index.astro` and `src/pages/music/index.astro` for the content indexes.
- `src/pages/brainfuck.astro` and `src/components/BrainfuckCompiler.svelte` for the Brainfuck compiler.
- `src/pages/cellular-automata.astro` and `src/components/CellularAutomata.svelte` for the cellular automata renderer.
- `src/layouts/PostLayout.astro` for blog-post presentation.
- `src/layouts/BaseLayout.astro` for the shared document shell and metadata.
- `src/styles/global.css` for global styles, fonts, and theme colors.

## Blog Posts

Create blog posts in `src/content/blog/`. The filename becomes the URL.
For example, `src/content/blog/my-post.md` is published at `/blog/my-post/`.

Every blog post starts with this frontmatter:

```
---
title: My post title
description: A short description used in lists, metadata, and RSS.
published: 2026-07-15
draft: false
---
```

`draft` is optional and defaults to `false`.
Drafts are excluded from the blog index, routes, and RSS feed.

## Music Recommendations

Create one Markdown file per album in `src/content/music/`.
The filename becomes the card's stable anchor on `/music/`.

```
---
album: Crooked Tree
artist: Molly Tuttle & Golden Highway
artistUrl: https://www.mollytuttlemusic.com/
mbAlbumUrl: https://musicbrainz.org/release/example
releaseDate: 2022-04-01
reviewed: 2026-07-21
streaming:
  spotify: https://open.spotify.com/album/example
  bandcamp: https://example.bandcamp.com/album/example
---
```

`artistUrl` and the entire `streaming` section are optional.
Supported streaming keys are `spotify`, `bandcamp`, `appleMusic`, `youtubeMusic`, `tidal`, and `qobuz`.

Recommendations appear as cards rather than separate pages.
The music RSS feed includes the rendered recommendation and available streaming links.

## Svelte Components

Svelte components are used only for interactive browser features.
Import a component into an Astro page and add a client directive when it requires browser JavaScript:

```astro
<MyComponent client:load />
```

The photo carousel, Brainfuck compiler, and cellular automata renderer are the current hydrated components.

## RSS

- Blog feed: `/blog/rss.xml`
- Music feed: `/music/rss.xml`

Feed configuration lives in the corresponding `rss.xml.ts` file under `src/pages/`.
