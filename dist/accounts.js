import {icon} from './icons.js';
import {ProfilePhoto} from './profile-photo.js';
import {publicConfig} from './public-config.js';
import {supabaseWorkspaceApi} from './cloud-provider.js';
import {validateState} from './storage.js';

const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function createAccountController(options) {
 const dialog = document.querySelector('#app-dialog');
 const button = document.querySelector('#account-button');
 let client = null; let user; let recovery = false; let subscription; let sessionQueue = Promise.resolve();
 const photo = new ProfilePhoto({getClient: () => client, onChange: paintPhoto});
 const redirectTo = () => location.origin + location.pathname;
 const field = selector => dialog.querySelector(selector);
 function paintPhoto() {
  document.querySelectorAll('[data-profile-photo]').forEach(slot => {
   slot.replaceChildren();
   if (photo.url) {
    const image = document.createElement('img'); image.src = photo.url; image.alt = ''; slot.append(image);
   } else slot.innerHTML = icon('user');
  });
  const choose = field('#choose-profile-photo');
  if (choose) { choose.disabled = photo.busy; choose.textContent = photo.url ? 'Trocar foto' : 'Adicionar foto'; }
  const remove = field('#remove-profile-photo');
  if (remove) { remove.disabled = photo.busy; remove.hidden = !photo.url; }
  const output = field('#photo-message');
  if (output) { output.textContent = photo.message; output.classList.toggle('error', photo.failed); }
 }
 function draw() {
  button.innerHTML = `<span class="profile-photo profile-photo-header" data-profile-photo aria-hidden="true"></span><span>${user ? 'Minha conta' : 'Entrar'}</span>`;
  photo.setUser(user?.id || null); paintPhoto();
  button.setAttribute('aria-label', user ? `Abrir conta de ${user.email || 'usuário'}` : 'Entrar ou criar conta');
 }
 async function changeSession(session, event = '') {
  const next = session?.user || null;
  if (event === 'PASSWORD_RECOVERY') recovery = true;
  if (user !== undefined && next?.id === user?.id) { user = next; draw(); if (recovery && user) openRecovery(); return; }
  await options.beforeSwitch();
  user = next;
  if (dialog.open) dialog.close();
  draw();
  await options.setOwner(user?.id || 'visitante');
  if (recovery && user) openRecovery();
 }
 function enqueueSession(session, event) {
  sessionQueue = sessionQueue.then(() => changeSession(session, event)).catch(() => options.notify('Não foi possível abrir a pasta desta conta. Reconecte sua pasta.', true));
  return sessionQueue;
 }
 function openAuth(mode = 'signin', previousEmail = '') {
  const creating = mode === 'signup'; const resetting = mode === 'reset';
  const title = resetting ? 'Recupere o acesso.' : creating ? 'Um espaço só seu.' : 'Seu acesso ao caderno.';
  options.openDialog(title, `<p class="dialog-description">${resetting ? 'Enviaremos um link para você escolher uma nova senha.' : 'Entre com seu e-mail. Seus projetos e cadernos são salvos na pasta deste computador.'}</p><div class="auth-tabs" role="tablist" aria-label="Acesso à conta"><button type="button" role="tab" aria-selected="${mode === 'signin'}" data-auth-mode="signin">Entrar</button><button type="button" role="tab" aria-selected="${creating}" data-auth-mode="signup">Criar conta</button></div><form id="auth-form"><div class="form-field"><label for="auth-email">E-mail</label><input id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" value="${escape(previousEmail)}" placeholder="voce@exemplo.com" required></div>${!resetting ? `<div class="form-field"><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" autocomplete="${creating ? 'new-password' : 'current-password'}" minlength="8" maxlength="200" placeholder="Pelo menos 8 caracteres" required></div>` : ''}${creating ? '<div class="form-field"><label for="auth-password-confirm">Confirme a senha</label><input id="auth-password-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="200" required></div>' : ''}<p id="auth-message" class="auth-message" role="status" aria-live="polite"></p><div class="dialog-actions"><button type="button" class="text-button" id="reset-password">${resetting ? 'Voltar para entrar' : 'Esqueci minha senha'}</button><button type="submit" class="button button-primary">${resetting ? 'Enviar link' : creating ? 'Criar conta' : 'Entrar'}</button></div></form><p class="account-footnote">${icon('lock')}Login e foto ficam na conta. As anotações ficam na pasta escolhida. Confirme seu e-mail após o cadastro.</p>`);
  const form = field('#auth-form'); const output = field('#auth-message');
  dialog.querySelectorAll('[data-auth-mode]').forEach(tab => tab.onclick = () => openAuth(tab.dataset.authMode, field('#auth-email')?.value));
  field('#reset-password').onclick = () => openAuth(resetting ? 'signin' : 'reset', field('#auth-email')?.value);
  form.onsubmit = async event => {
   event.preventDefault();
   const data = new FormData(form); const email = data.get('email').trim(); const password = data.get('password');
   output.classList.remove('error'); output.textContent = '';
   if (creating && password !== data.get('confirmation')) { output.classList.add('error'); output.textContent = 'As senhas precisam ser iguais.'; return; }
   const action = form.querySelector('[type="submit"]'); action.disabled = true;
   try {
    let result;
    if (resetting) result = await client.auth.resetPasswordForEmail(email, {redirectTo: redirectTo()});
    else if (creating) result = await client.auth.signUp({email, password, options: {emailRedirectTo: redirectTo()}});
    else result = await client.auth.signInWithPassword({email, password});
    if (result.error) throw result.error;
    if (resetting) output.textContent = 'Se houver uma conta com esse endereço, você receberá um link. Confira também o spam.';
    else if (creating && !result.data.session) output.textContent = 'Confira seu e-mail e confirme o cadastro. Depois volte e entre com sua senha.';
    else if (field('#auth-form') === form) dialog.close();
   } catch (error) {
    output.classList.add('error');
    output.textContent = error.code === 'email_not_confirmed' ? 'Confirme o cadastro no seu e-mail antes de entrar.' : error.code === 'over_email_send_rate_limit' ? 'Aguarde um pouco antes de pedir outro e-mail.' : resetting || creating ? 'Não foi possível concluir. Confira os dados ou tente novamente mais tarde.' : 'Não foi possível entrar. Confira o e-mail, a senha e a confirmação do cadastro.';
   } finally { action.disabled = false; }
  };
 }
 function openRecovery() {
  options.openDialog('Escolha sua nova senha.', '<p class="dialog-description">Use uma senha de pelo menos oito caracteres.</p><form id="recovery-form"><div class="form-field"><label for="new-password">Nova senha</label><input id="new-password" name="password" type="password" minlength="8" maxlength="200" autocomplete="new-password" required></div><div class="form-field"><label for="confirm-new-password">Confirme a nova senha</label><input id="confirm-new-password" name="confirmation" type="password" minlength="8" maxlength="200" autocomplete="new-password" required></div><p id="recovery-message" class="auth-message" role="status"></p><div class="dialog-actions"><button class="button button-primary" type="submit">Salvar nova senha</button></div></form>');
  const form = field('#recovery-form'); const output = field('#recovery-message');
  form.onsubmit = async event => {
   event.preventDefault(); const data = new FormData(form);
   if (data.get('password') !== data.get('confirmation')) { output.textContent = 'As senhas precisam ser iguais.'; return; }
   const action = form.querySelector('[type=submit]'); action.disabled = true;
   try { const {error} = await client.auth.updateUser({password: data.get('password')}); if (error) throw error; recovery = false; dialog.close(); options.notify('Sua nova senha foi salva.'); }
   catch { output.textContent = 'Não foi possível salvar a nova senha. Solicite um novo link se ele tiver expirado.'; }
   finally { action.disabled = false; }
  };
 }
 function openAccount() {
  options.capture();
  if (!publicConfig.enabled) {
   options.openDialog('Seu caderno neste computador.', '<p class="dialog-description">O login ainda não foi configurado. Escolha uma pasta para salvar seus projetos e cadernos neste computador.</p><div class="dialog-actions"><button class="button button-primary" id="open-folder-account">Minha pasta</button></div>');
   field('#open-folder-account').onclick = options.openFolder; return;
  }
  if (!client) { options.notify('O acesso à conta está carregando. Tente novamente em instantes.'); return; }
  if (!user) { openAuth(); return; }
  options.openDialog('Sua conta.', `<div class="account-identity"><span class="profile-photo profile-photo-large" data-profile-photo aria-hidden="true"></span><div><strong>${escape(user.email)}</strong><span>Login e foto de perfil no Supabase</span></div></div><div class="profile-photo-controls"><input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><button type="button" class="button button-outline" id="choose-profile-photo">Adicionar foto</button><button type="button" class="text-button" id="remove-profile-photo" hidden>Remover foto</button></div><p class="photo-hint">JPG, PNG ou WebP · até 8 MB.</p><p id="photo-message" class="auth-message" role="status" aria-live="polite"></p><p class="dialog-description">Projetos e cadernos são salvos na pasta escolhida neste computador. Entrar em outro aparelho exige levar essa pasta ou importar um backup.</p><div class="account-options"><button class="backup-option" id="account-folder">${icon('folder')}<span><strong>Minha pasta</strong><small>Salvar, reconectar e importar anotações antigas.</small></span></button><button class="backup-option" id="import-cloud-account">${icon('download')}<span><strong>Importar cadernos antigos da nuvem</strong><small>Copiar para a pasta, preservando os dados do Supabase.</small></span></button></div><p id="account-action-message" class="auth-message" role="status"></p><div class="dialog-actions"><button class="button button-outline" id="close-account">Fechar</button><button class="button button-outline" id="signout-account">Sair da conta</button></div>`);
  paintPhoto(); void photo.refresh();
  field('#choose-profile-photo').onclick = () => field('#profile-photo-file').click();
  field('#profile-photo-file').onchange = event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void photo.save(file); };
  field('#remove-profile-photo').onclick = () => void photo.remove();
  field('#account-folder').onclick = options.openFolder;
  field('#close-account').onclick = () => dialog.close();
  field('#import-cloud-account').onclick = () => void importCloud();
  field('#signout-account').onclick = async event => {
   const action = event.currentTarget; action.disabled = true;
   try {
    options.capture();
    if (!await options.flush()) throw new Error('Salve as alterações na pasta antes de sair. Se houver falha, baixe um backup.');
    const {error} = await client.auth.signOut({scope: 'local'}); if (error) throw error;
   } catch (error) { const output = field('#account-action-message'); if (output) output.textContent = error.message; }
   finally { action.disabled = false; }
  };
 }
 async function importCloud() {
  if (!client || !user) { openAccount(); return; }
  const owner = user.id;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
  try {
   options.notify('Consultando os cadernos antigos da nuvem…');
   const row = await supabaseWorkspaceApi(client).read(owner, controller.signal);
   if (user?.id !== owner) return;
   if (!row) { options.notify('Não há cadernos antigos na nuvem para esta conta.'); return; }
   options.reviewImport(validateState(row.document), 'nuvem', owner);
  } catch { options.notify('Não foi possível ler a nuvem. Os dados foram preservados; tente novamente.', true); }
  finally { clearTimeout(timeout); }
 }
 async function start() {
  draw();
  if (!publicConfig.enabled) { await enqueueSession(null); return; }
  try {
   const {createClient} = await import('./vendor/supabase.js');
   client = createClient(publicConfig.supabaseUrl, publicConfig.supabasePublishableKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit'}});
   const result = client.auth.onAuthStateChange((event, session) => {
    if (['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','PASSWORD_RECOVERY','USER_UPDATED'].includes(event)) setTimeout(() => { void enqueueSession(session, event); }, 0);
   });
   subscription = result.data.subscription;
   const {data, error} = await client.auth.getSession(); if (error) throw error;
   await enqueueSession(data.session);
  } catch { if (user === undefined) await enqueueSession(null); options.notify('O login está indisponível. Você pode usar a pasta como visitante.', true); }
 }
 button.onclick = openAccount;
 return {start, open: openAccount, importCloud, get user() { return user; }, dispose() { photo.dispose(); subscription?.unsubscribe(); }};
}
