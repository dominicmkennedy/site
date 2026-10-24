import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import type { Element, Root } from 'hast';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

/** Wrap each <table> in a div so it can scroll horizontally on narrow screens. */
function rehypeWrapTables() {
	return (tree: Root) => {
		const walk = (node: Root | Element) => {
			node.children.forEach((child, i) => {
				if (child.type !== 'element') return;
				if (child.tagName === 'table') {
					node.children[i] = {
						type: 'element',
						tagName: 'div',
						properties: { className: ['table-wrap'] },
						children: [child],
					};
				} else {
					walk(child);
				}
			});
		};
		walk(tree);
	};
}

// https://astro.build/config
export default defineConfig({
	site: 'https://dominicmkennedy.com',
	compressHTML: true,
	integrations: [svelte()],
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex, rehypeWrapTables],
		}),
	},
	vite: {
		plugins: [tailwindcss()],
	},
});
