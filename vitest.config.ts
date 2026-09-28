import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// The logic layer is DOM-free by design, so it runs in plain node.
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
})
