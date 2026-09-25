/**
 * Batch 03B.3 -- the ONE canonical StudioRich operator identity list.
 * Every client-side operator UX gate across MUSIC (Event Radio Control,
 * Channel Control, RADIO Program creation) imports this instead of
 * carrying its own duplicate literal -- prior to this batch each of those
 * three files (plus firestore.rules' own server-side copy, and Wall's
 * separate subwayMapPaintSurface.js runtime, which cannot import this
 * TS module) independently hardcoded the same email, and drifted.
 *
 * This is a client-side UX gate ONLY -- it decides what renders, never
 * what's authorized. The real authority boundary is firestore.rules'
 * own studioRichOperatorEmails(), enforced server-side regardless of
 * what this list contains. The two must be kept in sync by hand; there
 * is no mechanism to share a literal between TypeScript and the
 * Firestore rules language.
 */
export const STUDIO_RICH_OPERATOR_EMAILS = ["richardjlau@gmail.com"];
