<script lang="ts">
	import init, { compile_align } from 'bf-wasm-compiler';
	import { Play, RotateCcw } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';

	type Props = {
		initialProgram: string;
	};

	type ProgramExports = WebAssembly.Exports & {
		main: () => void;
	};

	const maxOutputLength = 1_000_000;
	const inputRequired = new Error('Brainfuck program requested input');

	let { initialProgram }: Props = $props();
	let program = $state(initialProgram);
	let output = $state('');
	let outputBuffer = '';
	let ready = $state(false);
	let running = $state(false);
	let errorMessage = $state<string | null>(null);
	let compilationTime = $state<number | null>(null);
	let executionTime = $state<number | null>(null);
	let inputWaitTime = $state<number | null>(null);
	let inputBuffer = '';
	let inputDraft = $state('');
	let inputStartedAt = 0;
	let collectedInput = '';
	let compiledProgram: Uint8Array | null = null;
	let inputDialog: HTMLDialogElement;
	let inputField: HTMLTextAreaElement;

	onMount(async () => {
		try {
			await init();
			ready = true;
		} catch (error) {
			errorMessage = getErrorMessage(error);
		}
	});

	function getErrorMessage(error: unknown) {
		return error instanceof Error ? error.message : String(error);
	}

	function formatTime(milliseconds: number) {
		return (milliseconds / 1000).toLocaleString(undefined, {
			minimumFractionDigits: 3,
			maximumFractionDigits: 3,
		});
	}

	function readInput() {
		if (inputBuffer.length === 0) throw inputRequired;

		const character = inputBuffer[0];
		inputBuffer = inputBuffer.slice(1);
		return character.charCodeAt(0);
	}

	function writeOutput(value: number) {
		if (outputBuffer.length >= maxOutputLength) {
			throw new Error('Output exceeded the 1,000,000 character limit.');
		}

		outputBuffer += String.fromCharCode(value & 0xff);
	}

	function publishNewOutput() {
		output += outputBuffer.slice(output.length);
	}

	function clearExecutionState(initialInputWait: number | null) {
		output = '';
		outputBuffer = '';
		errorMessage = null;
		compilationTime = null;
		executionTime = null;
		inputWaitTime = initialInputWait;
		collectedInput = '';
		compiledProgram = null;
	}

	async function runProgram() {
		if (!ready || running) return;

		clearExecutionState(0);

		await executeProgram();
	}

	async function submitInput() {
		inputWaitTime = (inputWaitTime ?? 0) + (performance.now() - inputStartedAt);
		collectedInput += inputDraft.length > 0 ? inputDraft : '\n';
		inputDialog.close();
		await executeProgram();
	}

	function cancelInput() {
		inputDialog.close();
		inputWaitTime = null;
	}

	async function executeProgram() {
		running = true;
		outputBuffer = '';
		inputBuffer = collectedInput;
		await tick();
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => resolve()),
		);

		let needsInput = false;

		try {
			if (compiledProgram === null) {
				const compilationStart = performance.now();
				compiledProgram = compile_align(program);
				compilationTime = performance.now() - compilationStart;
			}

			const { instance } = await WebAssembly.instantiate(compiledProgram, {
				env: {
					write: writeOutput,
					read: readInput,
					debug_terminate: () => {},
				},
			});

			const executionStart = performance.now();
			(instance.exports as ProgramExports).main();
			executionTime = performance.now() - executionStart;
			publishNewOutput();
		} catch (error) {
			if (error === inputRequired) {
				publishNewOutput();
				needsInput = true;
			} else {
				errorMessage = getErrorMessage(error);
			}
		} finally {
			running = false;
		}

		if (needsInput) {
			inputDraft = '';
			inputStartedAt = performance.now();
			inputDialog.showModal();
			await tick();
			inputField.focus();
		}
	}

	function resetProgram() {
		program = initialProgram;
		clearExecutionState(null);
	}
</script>

<div class="mt-6 space-y-10">
	<section aria-labelledby="program-heading">
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 id="program-heading" class="section-heading">Program</h2>
			<button
				class="grid size-10 cursor-pointer place-items-center rounded-sm text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
				type="button"
				onclick={resetProgram}
				aria-label="Restore Mandelbrot program"
				title="Restore Mandelbrot program"
			>
				<RotateCcw aria-hidden="true" size={21} strokeWidth={2} />
			</button>
		</div>

		<label class="sr-only" for="brainfuck-program">Brainfuck program</label>
		<textarea
			id="brainfuck-program"
			class="w-full resize-y rounded-sm border border-neutral-300 bg-white/55 p-4 font-[var(--font-mono)] text-sm leading-6 whitespace-pre text-neutral-950 shadow-inner outline-none transition-[height] duration-200 focus:border-[var(--heading-secondary-start)] focus:ring-2 focus:ring-[var(--heading-secondary-start)]/20 dark:border-white/15 dark:bg-black/20 dark:text-neutral-100"
			class:h-40={output !== ''}
			class:h-52={output === ''}
			bind:value={program}
			spellcheck="false"
			autocapitalize="none"
			autocomplete="off"
			wrap="off"></textarea>

		<div class="mt-4 flex flex-wrap items-center gap-3">
			<button
				class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm bg-[var(--heading-secondary-start)] px-4 font-semibold text-white transition-[filter,opacity] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--heading-secondary-start)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-950"
				type="button"
				onclick={runProgram}
				disabled={!ready || running}
			>
				<Play aria-hidden="true" size={18} strokeWidth={2} />
				{running ? 'Running' : ready ? 'Run' : 'Loading compiler'}
			</button>

			{#if compilationTime !== null && executionTime !== null}
				<dl
					class="flex flex-wrap items-center gap-x-3 gap-y-1 text-base"
					aria-live="polite"
				>
					<div class="flex items-baseline gap-1.5">
						<dt class="text-neutral-500 dark:text-neutral-400">Compilation</dt>
						<dd class="font-[var(--font-mono)] text-sm tabular-nums">
							{formatTime(compilationTime)}s
						</dd>
					</div>
					{#if inputWaitTime !== null && inputWaitTime > 0}
						<span
							class="text-neutral-400 dark:text-neutral-600"
							aria-hidden="true">|</span
						>
						<div class="flex items-baseline gap-1.5">
							<dt class="text-neutral-500 dark:text-neutral-400">Input wait</dt>
							<dd class="font-[var(--font-mono)] text-sm tabular-nums">
								{formatTime(inputWaitTime)}s
							</dd>
						</div>
					{/if}
					<span
						class="text-neutral-400 dark:text-neutral-600"
						aria-hidden="true">|</span
					>
					<div class="flex items-baseline gap-1.5">
						<dt class="text-neutral-500 dark:text-neutral-400">Execution</dt>
						<dd class="font-[var(--font-mono)] text-sm tabular-nums">
							{formatTime(executionTime)}s
						</dd>
					</div>
				</dl>
			{/if}
		</div>

		{#if errorMessage}
			<p
				class="mt-5 border-l-2 border-red-500 pl-4 text-sm leading-6 text-red-700 dark:text-red-300"
				role="alert"
			>
				{errorMessage}
			</p>
		{/if}
	</section>

	{#if output !== ''}
		<section aria-labelledby="output-heading">
			<h2 id="output-heading" class="section-heading">Output</h2>
			<pre
				class="mt-4 min-h-40 overflow-auto rounded-sm border border-neutral-300 bg-white/40 p-4 font-[var(--font-mono)] text-xs leading-5 whitespace-pre text-neutral-900 dark:border-white/15 dark:bg-black/20 dark:text-neutral-100"
				aria-live="polite">{output}</pre>
		</section>
	{/if}
</div>

<dialog
	bind:this={inputDialog}
	class="m-auto w-[min(32rem,calc(100%-2rem))] rounded-sm border border-neutral-300 bg-neutral-50 p-0 text-neutral-950 shadow-2xl backdrop:bg-neutral-950/55 backdrop:backdrop-blur-xs dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-100"
	oncancel={cancelInput}
>
	<form
		class="p-6"
		onsubmit={(event) => {
			event.preventDefault();
			submitInput();
		}}
	>
		<h2 class="section-heading text-2xl">Program input</h2>
		<label class="sr-only" for="brainfuck-input">Program input</label>
		<textarea
			bind:this={inputField}
			bind:value={inputDraft}
			id="brainfuck-input"
			class="mt-5 h-20 w-full resize-y rounded-sm border border-neutral-300 bg-white/60 p-3 font-[var(--font-mono)] text-sm leading-6 text-neutral-950 shadow-inner outline-none focus:border-[var(--heading-secondary-start)] focus:ring-2 focus:ring-[var(--heading-secondary-start)]/20 dark:border-white/15 dark:bg-black/20 dark:text-neutral-100"
			spellcheck="false"
			autocapitalize="none"
			autocomplete="off"></textarea>
		<div class="mt-5 flex justify-end gap-3">
			<button
				class="h-10 cursor-pointer rounded-sm px-4 font-medium text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
				type="button"
				onclick={cancelInput}>Cancel</button
			>
			<button
				class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm bg-[var(--heading-secondary-start)] px-4 font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--heading-secondary-start)] dark:text-neutral-950"
				type="submit"
			>
				<Play aria-hidden="true" size={18} strokeWidth={2} />
				Run
			</button>
		</div>
	</form>
</dialog>
