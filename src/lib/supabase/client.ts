import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://bjurlhpvjknfsqmibyjb.supabase.co'
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqdXJsaHB2amtuZnNxbWlieWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1OTEwMDAsImV4cCI6MjEwNTE2NzAwMH0.cVPCkZddukOTK_V5FO1xs2XR30EUiuI09790HIqeZNc'

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

const url = (rawUrl && !rawUrl.includes('YOUR_PROJECT')) ? rawUrl : DEFAULT_SUPABASE_URL
const publishableKey = (rawKey && !rawKey.includes('YOUR_PUBLISHABLE_KEY') && rawKey.length > 20) ? rawKey : DEFAULT_SUPABASE_KEY

export const hasSupabaseConfig = /^https?:\/\//.test(url) && publishableKey.length > 20

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.')
  return supabase
}
