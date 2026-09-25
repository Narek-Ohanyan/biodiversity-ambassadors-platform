// The publishable key is designed to be public; access is enforced by row-level security in Supabase.
export const SUPABASE_URL = 'https://sdvnthgkjrculxoonbuw.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_TR9-j4Gnno3w0EDJ1BgATg_zDeuf7I0';
export const CONTACT_EMAIL = 'ace@aua.am';
// UNICEF module videos are served from Cloudflare R2 (zero egress fees) instead of the app server,
// since streaming ~900MB of video per full course run-through would blow through hosting bandwidth caps.
export const MEDIA_BASE = 'https://pub-8cb7a120360e492c95968b86996b3d60.r2.dev';
export const ACE_URL = 'https://ace.aua.am/';
// The program name is a proper noun and stays the same in every interface language.
export const BRAND_NAME = 'Biodiversity Ambassadors';
export const BRAND_SUB = 'AUCB × GYBN Armenia';
