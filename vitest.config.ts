import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// The logic layer is DOM-free by design, so it runs in plain node.
		environment: 'node',
		include: ['src/**/*.test.ts'],
		// Other agents' git worktrees live under .claude/ and carry their own copies.
		exclude: [...configDefaults.exclude, '.claude/**'],
	},
})
