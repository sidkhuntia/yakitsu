/**
 * Fails if a file under public/ has no credit line in docs/asset-manifest.json,
 * or if the manifest names a file that is no longer there.
 *
 *   npx tsx scripts/check-assets.ts     (also: npm run check:assets)
 *
 * Exits 1 and lists every problem. CREDITS.md holds the full credit text.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const manifestPath = path.join(root, 'docs', 'asset-manifest.json')

/** Every file under `dir`, as a forward-slash path relative to `base`. */
function walk(dir: string, base: string = dir): string[] {
	const out: string[] = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === '.DS_Store') continue
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...walk(full, base))
		else out.push(path.relative(base, full).split(path.sep).join('/'))
	}
	return out
}

interface Manifest {
	files?: Record<string, string>
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest
const listed = manifest.files ?? {}
const onDisk = walk(publicDir).sort()
const onDiskSet = new Set(onDisk)

const problems: string[] = []
for (const file of onDisk) {
	if (!(file in listed)) problems.push(`no credit line: public/${file}`)
}
for (const [file, credit] of Object.entries(listed)) {
	if (!onDiskSet.has(file)) problems.push(`stale manifest entry: ${file}`)
	if (credit.trim() === '') problems.push(`empty credit line: ${file}`)
}

if (problems.length > 0) {
	console.error(`check-assets: ${problems.length} problem(s)`)
	for (const p of problems) console.error(`  - ${p}`)
	process.exitCode = 1
} else {
	console.log(
		`check-assets: ${onDisk.length} files under public/, all credited`,
	)
}
