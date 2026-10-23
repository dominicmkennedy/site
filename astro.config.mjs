// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

/** Wrap each <table> in a div so it can scroll horizontally on narrow screens. */
function rehypeWrapTables() {
	return (tree) => {
		const walk = (node) => {
			if (!node.children) return;
			node.children = node.children.map((child) => {
				if (child.type === 'element' && child.tagName === 'table') {
					return {
						type: 'element',
						tagName: 'div',
						properties: { className: ['table-wrap'] },
						children: [child],
					};
				}
				walk(child);
				return child;
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
