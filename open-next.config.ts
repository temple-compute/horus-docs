// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default {
	...defineCloudflareConfig({
		// For best results consider enabling R2 caching
		// See https://opennext.js.org/cloudflare/caching for more details
		// incrementalCache: r2IncrementalCache
	}),
	// OpenNext shells out to the package manager's `build` script to produce the
	// Next output, and `build` is `opennextjs-cloudflare build` so that Workers
	// Builds emits `.open-next/worker.js`. Point OpenNext at the raw Next build
	// instead, or the two would call each other forever.
	buildCommand: "bun run build:next",
};
