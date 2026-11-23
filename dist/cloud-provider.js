export function supabaseWorkspaceApi(client) {
 async function checkUser(userId) {
  const {data, error} = await client.auth.getSession();
  if (error || data.session?.user?.id !== userId) throw new Error('Entre novamente na sua conta.');
 }
 return {
  async read(userId, signal) {
   await checkUser(userId);
   const {data, error} = await client.from('notebook_workspaces').select('document,revision,updated_at').eq('user_id', userId).abortSignal(signal).maybeSingle();
   if (error) throw error;
   return data;
  }
 };
}
