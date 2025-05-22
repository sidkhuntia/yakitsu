import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
	{
		files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
		languageOptions: { globals: globals.browser },
	},
	tseslint.configs.recommended,
	globalIgnores(['dist/**', 'node_modules/**', 'public/data/**']),
])
