<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	type Photo = {
		src: string;
		alt: string;
		width: number;
		height: number;
	};

	let { photos }: { photos: Photo[] } = $props();
	let current = $state(0);
	let photo = $derived(photos[current]);

	function previous() {
		current = (current - 1 + photos.length) % photos.length;
	}

	function next() {
		current = (current + 1) % photos.length;
	}
</script>

<figure
	class="relative m-0 overflow-hidden rounded-sm bg-neutral-200 dark:bg-neutral-800"
>
	<div class="aspect-3/4">
		<img
			class="h-full w-full object-cover"
			src={photo.src}
			alt={photo.alt}
			width={photo.width}
			height={photo.height}
			fetchpriority={current === 0 ? 'high' : 'auto'}
		/>
	</div>

	<div
		class="absolute inset-x-0 bottom-0 flex h-11 items-center justify-between bg-black/45 px-2 text-white backdrop-blur-xs"
	>
		<button
			class="grid size-8 cursor-pointer place-items-center rounded-sm hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
			type="button"
			onclick={previous}
			aria-label="Previous photo"
			title="Previous photo"
		>
			<ChevronLeft aria-hidden="true" size={20} strokeWidth={2} />
		</button>

		<span class="text-xs tabular-nums" aria-hidden="true">
			{current + 1} / {photos.length}
		</span>

		<button
			class="grid size-8 cursor-pointer place-items-center rounded-sm hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
			type="button"
			onclick={next}
			aria-label="Next photo"
			title="Next photo"
		>
			<ChevronRight aria-hidden="true" size={20} strokeWidth={2} />
		</button>
	</div>

	<figcaption class="sr-only" aria-live="polite">
		{photo.alt}. Photo {current + 1} of {photos.length}.
	</figcaption>
</figure>
