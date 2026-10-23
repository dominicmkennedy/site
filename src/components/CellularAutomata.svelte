<script lang="ts">
	import { ExternalLink, Pause, Play, RefreshCw } from '@lucide/svelte';
	import seedrandom from 'seedrandom';
	import init, { CellularAutomatonRenderer } from 'singing-cells';
	import { onDestroy, onMount } from 'svelte';

	type Renderer = CellularAutomatonRenderer;

	let canvas: HTMLCanvasElement;
	let renderer: Renderer | null = null;
	let frameId: number | null = null;
	let lastFrame = 0;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	let resizeObserver: ResizeObserver | null = null;

	let numCellTypes = $state(6);
	let universeWidth = $state(256);
	let ruleDensity = $state(0.66);
	let seed = $state('');
	let activeSeed = '';
	let seedWasGenerated = false;
	let animate = $state(false);
	let animationSpeed = $state(60);
	let ready = $state(false);
	let generated = $state(false);
	let running = $state(false);
	let errorMessage = $state<string | null>(null);

	onMount(() => {
		let cancelled = false;
		universeWidth = window.matchMedia('(max-width: 639px)').matches ? 128 : 256;

		void init()
			.then(() => {
				if (cancelled) return;
				ready = true;
				requestAnimationFrame(() => generate(false));
			})
			.catch((error) => {
				errorMessage = getErrorMessage(error);
			});

		resizeObserver = new ResizeObserver(() => {
			if (!generated) return;
			if (resizeTimer !== null) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => generate(true), 150);
		});
		resizeObserver.observe(canvas);

		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => {
		stopAnimation();
		resizeObserver?.disconnect();
		if (resizeTimer !== null) clearTimeout(resizeTimer);
		renderer?.free();
	});

	function getErrorMessage(error: unknown) {
		return error instanceof Error ? error.message : String(error);
	}

	function createSeed() {
		const values = crypto.getRandomValues(new Uint32Array(4));
		return Array.from(values, (value) =>
			value.toString(16).padStart(8, '0'),
		).join('');
	}

	function createRenderer() {
		const originalRandom = Math.random;
		Math.random = seedrandom(activeSeed);

		try {
			return new CellularAutomatonRenderer(
				canvas,
				numCellTypes,
				universeWidth,
				ruleDensity,
			);
		} finally {
			Math.random = originalRandom;
		}
	}

	function generate(reuseSeed: boolean) {
		if (!ready || running) return;

		running = true;
		errorMessage = null;
		stopAnimation();

		if (!reuseSeed) {
			const enteredSeed = seed.trim();
			seedWasGenerated = enteredSeed === '' || seedWasGenerated;
			activeSeed = seedWasGenerated ? createSeed() : enteredSeed;
			seed = activeSeed;
		}
		if (activeSeed === '') activeSeed = createSeed();

		try {
			renderer?.free();
			renderer = createRenderer();
			if (renderer === null) return;

			generated = true;
			if (animate) {
				startAnimation();
			} else {
				renderer.drawAll();
			}
		} catch (error) {
			errorMessage = getErrorMessage(error);
			generated = false;
			renderer = null;
		} finally {
			running = false;
		}
	}

	function drawAnimationFrame(timestamp: number) {
		if (renderer === null || !animate) {
			frameId = null;
			return;
		}

		const frameDuration = 1000 / animationSpeed;
		if (timestamp - lastFrame >= frameDuration) {
			try {
				renderer.drawFrame();
				lastFrame = timestamp - ((timestamp - lastFrame) % frameDuration);
			} catch (error) {
				errorMessage = getErrorMessage(error);
				animate = false;
				stopAnimation();
				return;
			}
		}

		frameId = requestAnimationFrame(drawAnimationFrame);
	}

	function startAnimation() {
		stopAnimation();
		if (renderer === null) return;
		animate = true;
		lastFrame = performance.now();
		frameId = requestAnimationFrame(drawAnimationFrame);
	}

	function stopAnimation() {
		if (frameId !== null) cancelAnimationFrame(frameId);
		frameId = null;
	}

	function toggleAnimation() {
		if (animate) {
			animate = false;
			stopAnimation();
		} else {
			startAnimation();
		}
	}
</script>

<div
	class="ca-renderer mt-5 grid items-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_19rem]"
>
	<section
		class="min-w-0 lg:h-full"
		aria-label="Cellular automaton visualization"
	>
		<div
			class="relative aspect-4/3 w-full overflow-hidden rounded-sm border border-neutral-300 bg-black shadow-sm lg:h-full lg:aspect-auto dark:border-white/15"
		>
			<canvas bind:this={canvas} class="block size-full"></canvas>
			{#if errorMessage}
				<div
					class="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-sm leading-6 text-red-200"
					role="alert"
				>
					{errorMessage}
				</div>
			{/if}
		</div>
	</section>

	<form
		class="space-y-4 lg:border-l lg:border-neutral-200 lg:pl-5 dark:lg:border-white/10"
		onsubmit={(event) => {
			event.preventDefault();
			generate(false);
		}}
	>
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-1">
			<label class="grid gap-1.5 text-sm font-medium" for="cell-types">
				Cell types
				<input
					id="cell-types"
					class="h-9 rounded-sm border border-neutral-300 bg-white/55 px-3 font-[var(--font-mono)] font-normal outline-none focus:border-[var(--heading-secondary-start)] focus:ring-2 focus:ring-[var(--heading-secondary-start)]/20 dark:border-white/15 dark:bg-black/20"
					type="number"
					min="2"
					max="16"
					required
					bind:value={numCellTypes}
				/>
			</label>
			<label class="grid gap-1.5 text-sm font-medium" for="universe-width">
				Grid width
				<input
					id="universe-width"
					class="h-9 rounded-sm border border-neutral-300 bg-white/55 px-3 font-[var(--font-mono)] font-normal outline-none focus:border-[var(--heading-secondary-start)] focus:ring-2 focus:ring-[var(--heading-secondary-start)]/20 dark:border-white/15 dark:bg-black/20"
					type="number"
					min="4"
					max="512"
					required
					bind:value={universeWidth}
				/>
			</label>
		</div>

		<label class="grid gap-2 text-sm font-medium" for="rule-density">
			<span class="flex items-baseline justify-between gap-3">
				Rule density
				<output class="font-[var(--font-mono)] font-normal tabular-nums"
					>{ruleDensity.toFixed(2)}</output
				>
			</span>
			<input
				id="rule-density"
				class="w-full cursor-pointer accent-[var(--heading-secondary-start)]"
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={ruleDensity}
			/>
		</label>

		<label class="grid gap-1.5 text-sm font-medium" for="seed">
			Seed
			<input
				id="seed"
				class="h-9 w-full rounded-sm border border-neutral-300 bg-white/55 px-3 font-[var(--font-mono)] text-xs outline-none placeholder:text-neutral-400 focus:border-[var(--heading-secondary-start)] focus:ring-2 focus:ring-[var(--heading-secondary-start)]/20 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-600"
				type="text"
				placeholder="Random"
				bind:value={seed}
				oninput={() => {
					seedWasGenerated = false;
				}}
			/>
		</label>

		<label class="grid gap-2 text-sm font-medium" for="animation-speed">
			<span class="flex items-baseline justify-between gap-3">
				Animation speed
				<output class="font-[var(--font-mono)] font-normal tabular-nums"
					>{animationSpeed} fps</output
				>
			</span>
			<input
				id="animation-speed"
				class="w-full cursor-pointer accent-[var(--heading-secondary-start)]"
				type="range"
				min="1"
				max="60"
				step="1"
				bind:value={animationSpeed}
			/>
		</label>

		<div class="flex flex-wrap gap-3 pt-1">
			<button
				class="light-text-button inline-flex h-9 cursor-pointer items-center gap-2 rounded-sm bg-[var(--heading-secondary-start)] px-4 font-semibold text-white transition-[filter,opacity] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--heading-secondary-start)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-950"
				type="submit"
				disabled={!ready || running}
			>
				<RefreshCw aria-hidden="true" size={18} strokeWidth={2} />
				{ready ? 'Generate' : 'Loading'}
			</button>
			{#if generated}
				<button
					class="light-text-button grid size-9 cursor-pointer place-items-center rounded-sm border border-neutral-300 text-neutral-600 transition-colors hover:border-[var(--heading-secondary-start)] hover:text-[var(--heading-secondary-start)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-white/15 dark:text-neutral-400"
					type="button"
					onclick={toggleAnimation}
					aria-label={animate ? 'Pause animation' : 'Resume animation'}
					title={animate ? 'Pause animation' : 'Resume animation'}
				>
					{#if animate}
						<Pause aria-hidden="true" size={18} strokeWidth={2} />
					{:else}
						<Play aria-hidden="true" size={18} strokeWidth={2} />
					{/if}
					<span class="light-button-text">
						{animate ? 'Pause animation' : 'Resume animation'}
					</span>
				</button>
			{/if}
		</div>

		<a
			class="text-link inline-flex w-fit items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
			href="https://github.com/dominicmkennedy/singing-cells"
		>
			<ExternalLink aria-hidden="true" size={17} strokeWidth={2} />
			Source code
		</a>
	</form>
</div>
