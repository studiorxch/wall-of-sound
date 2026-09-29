// Type declaration for the importable surface of publish-radio-to-sites.mjs,
// consumed by vite.config.ts's /radio-publish-to-sites route. Kept separate
// from the .mjs source rather than enabling allowJs project-wide.

export class PublishToSitesError extends Error {}

export interface PublishRadioToSitesOptions {
  slug: string
  version?: number | null
  exportsRoot: string
  sitesRoot: string
  activate?: boolean
  onProgress?: (message: string) => void
}

export interface PublishRadioToSitesResult {
  slug: string
  version: number
  finalDir: string
  relativeFinalDir: string
  fileCount: number
  totalBytes: number
  activated: boolean
  manifestUrl: string | null
}

export function publishRadioToSites(options: PublishRadioToSitesOptions): Promise<PublishRadioToSitesResult>
