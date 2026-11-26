/**
 * Import this FIRST in a test that reaches lib/supabase.ts (the browser client), which refuses to start
 * without an address. Nothing is ever sent there: the tests replace the network.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
export {};
