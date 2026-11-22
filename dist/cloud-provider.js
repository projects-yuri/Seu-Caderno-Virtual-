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
  },
  async write(userId, document, revision, signal) {
   await checkUser(userId);
   const {data, error} = await client.rpc('save_notebook_workspace', {p_user_id: userId, p_document: document, p_expected_revision: revision}).abortSignal(signal);
   if (error) throw error;
   if (!Array.isArray(data) || data.length !== 1) throw new Error('A nuvem não confirmou o salvamento.');
   return data[0];
  }
 };
}
