let supabaseClient = null;

export function isSupabaseConfigured() {
  const config = window.BadukConfig ?? {};
  return Boolean(config.supabaseUrl && config.supabaseKey && window.supabase?.createClient);
}

export function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = window.BadukConfig ?? {};
  if (!window.supabase?.createClient) {
    throw new Error("Supabase 라이브러리를 불러오지 못했습니다.");
  }

  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error("Supabase URL 또는 KEY가 설정되지 않았습니다.");
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}
