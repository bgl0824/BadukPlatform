let supabaseClient = null;

/** problems.js(IIFE)와 auth 모듈이 동일 인스턴스·세션을 쓰도록 공유 */
function publishSharedSupabaseClient(client) {
  if (typeof window !== "undefined" && client) {
    window.__BADUK_SHARED_SUPABASE_CLIENT__ = client;
  }
}

export function isSupabaseConfigured() {
  const config = window.BadukConfig ?? {};
  return Boolean(config.supabaseUrl && config.supabaseKey && window.supabase?.createClient);
}

export function getSupabaseClient() {
  if (typeof window !== "undefined" && window.__BADUK_SHARED_SUPABASE_CLIENT__) {
    supabaseClient = window.__BADUK_SHARED_SUPABASE_CLIENT__;
    return supabaseClient;
  }

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
  publishSharedSupabaseClient(supabaseClient);

  return supabaseClient;
}
