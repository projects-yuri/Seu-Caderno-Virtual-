export function publicConfiguration(env) {
 const supabaseUrl = (env.SUPABASE_URL || '').trim();
 const supabasePublishableKey = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
 if (!supabaseUrl && !supabasePublishableKey) return {enabled: false, supabaseUrl: '', supabasePublishableKey: ''};
 if (!supabaseUrl || !supabasePublishableKey) throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY juntas.');
 const url = new URL(supabaseUrl);
 if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('SUPABASE_URL deve ser a URL HTTPS do projeto, sem caminhos ou parâmetros.');
 if (supabasePublishableKey.startsWith('sb_secret_')) throw new Error('Use uma chave publishable, nunca uma chave secret ou service_role.');
 if (!supabasePublishableKey.startsWith('sb_publishable_')) {
  let payload;
  try { payload = JSON.parse(Buffer.from(supabasePublishableKey.split('.')[1], 'base64url').toString('utf8')); } catch {}
  if (payload?.role !== 'anon') throw new Error('A chave deve ser publishable ou uma chave anon legada. Chaves de administrador não são permitidas no site.');
 }
 return {enabled: true, supabaseUrl: url.origin, supabasePublishableKey};
}
