import {icon} from './icons.js';
import {ProfilePhoto} from './profile-photo.js';
import {publicConfig} from './public-config.js';
import {WorkspaceSync, accountCacheKey, emptyWorkspace} from './cloud-sync.js';
import {supabaseWorkspaceApi} from './cloud-provider.js';
import {loadState, usedPages, validateState} from './storage.js';

const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {local:'Somente neste navegador', loading:'Carregando a conta…', pending:'Neste aparelho · aguardando a nuvem', syncing:'Salvando na nuvem…', synced:'Salvo na nuvem', offline:'Aguardando conexão com a nuvem', conflict:'Há versões diferentes para revisar', error:'Não foi possível carregar a conta'};

export function createAccountController(options) {
 const dialog = document.querySelector('#app-dialog');
 const button = document.querySelector('#account-button');
 const indicator = document.querySelector('#cloud-indicator');
 const banner = document.querySelector('#cloud-banner');
 let client = null; let engine = null; let user = null; let phase = 'local'; let recovery = false;
 let eventNumber = 0; let migrationOffered = false; let statusMessage = ''; let subscription; let refreshTimer;
 const photo = new ProfilePhoto({getClient: () => client, onChange: paintPhoto});
 const refresh = () => { if (user && document.visibilityState === 'visible') void engine.refresh(); };
 const redirectTo = () => location.origin + location.pathname;
 const field = selector => dialog.querySelector(selector);
 function statusText() { return phase === 'synced' && engine?.revision === 0 ? 'Conta pronta' : labels[phase] || labels.local; }
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
  photo.setUser(user?.id || null);
  paintPhoto();
  button.setAttribute('aria-label', user ? `Abrir conta de ${user.email || 'usuário'}` : 'Entrar ou criar conta');
  button.title = user ? 'Minha conta' : 'Entrar ou criar conta';
  indicator.innerHTML = `${icon(user ? 'cloud' : 'lock')}<span>${escape(user ? statusText() : labels.local)}</span>`;
  indicator.title = user ? statusText() : labels.local;
  indicator.className = `cloud-indicator cloud-${phase}`;
  const blocked = !!user && (!engine?.ready || phase === 'loading');
  options.setLocked(blocked);
  const showBanner = !!user && ['loading','offline','error','conflict'].includes(phase);
  banner.hidden = !showBanner;
  banner.replaceChildren();
  if (showBanner) {
   const text = document.createElement('span');
   text.textContent = phase === 'conflict' ? 'Existem alterações de outro aparelho. Suas duas versões foram preservadas para revisão.' : statusMessage || statusText();
   banner.append(text);
   if (phase !== 'loading') {
    const action = document.createElement('button'); action.type = 'button'; action.className = 'text-button';
    action.textContent = phase === 'conflict' ? 'Revisar versões' : 'Tentar novamente';
    action.onclick = () => phase === 'conflict' ? openAccount() : void retry(); banner.append(action);
   }
  }
  const live = field('#account-live-status'); if (live) live.textContent = statusText();
  options.onStatusChanged();
 }
 async function changeSession(session, event = '') {
  const next = session?.user || null;
  if (event === 'PASSWORD_RECOVERY') recovery = true;
  if (next?.id === user?.id) { if (next) user = next; draw(); if (recovery && user) openRecovery(); return; }
  const serial = ++eventNumber;
  options.beforeSwitch();
  engine?.stop();
  user = next; migrationOffered = false;
  if (dialog.open) dialog.close();
  if (!user) { phase = 'local'; options.restoreGuest(); draw(); return; }
  phase = 'loading'; statusMessage = ''; options.applyWorkspace(emptyWorkspace()); draw();
  await engine.start(user.id);
  if (serial !== eventNumber) return;
  if (recovery) openRecovery();
  else if (engine.ready && engine.revision === 0 && !engine.pending && !engine.conflict && !migrationOffered) {
   migrationOffered = true;
   const guest = readGuest();
   if (guest?.projects.length) openMigration(guest);
  }
 }
 function readGuest() { try { return loadState(); } catch { return null; } }
 async function retry() {
  if (!engine || !user) return;
  options.capture();
  await engine.refresh();
 }
 function writeBackup(document, suffix = 'conta') {
  options.download(JSON.stringify(document, null, 2), `seu-caderno-${suffix}-${new Date().toISOString().slice(0,10)}.json`, 'application/json');
 }
 function openMigration(guest) {
  const ownerId = user.id;
  const pages = guest.notebooks.reduce((total, book) => total + usedPages(book), 0);
  options.openDialog('Trazer seus projetos para a conta?', `<p class="dialog-description">Há ${guest.projects.length} projeto(s), ${guest.notebooks.length} caderno(s) e ${pages} página(s) com anotações neste navegador.</p><p class="privacy-note">Eles serão enviados para a conta <strong>${escape(user.email)}</strong>. A cópia local continua guardada.</p><p class="dialog-error" id="migration-message" role="alert"></p><div class="dialog-actions"><button class="button button-outline" id="skip-migration">Agora não</button><button class="button button-primary" id="confirm-migration">Trazer meus projetos</button></div>`);
  field('#skip-migration').onclick = () => dialog.close();
  field('#confirm-migration').onclick = async event => {
   const action = event.currentTarget; action.disabled = true;
   try {
    if (options.getWorkspace().projects.length) writeBackup(options.getWorkspace(), 'antes-da-importacao');
    options.applyWorkspace(validateState(guest));
    engine.queue(guest);
    const synced = await engine.flush();
    if (user?.id !== ownerId) return;
    if (dialog.open) dialog.close();
    options.notify(synced ? 'Seus projetos chegaram à sua conta.' : 'Projetos guardados neste aparelho. A nuvem ainda precisa confirmar o envio.', !synced);
   } catch { const output = field('#migration-message'); if (output) output.textContent = 'Não foi possível concluir. A cópia local foi preservada.'; }
   finally { action.disabled = false; }
  };
 }
 function openAuth(mode = 'signin', previousEmail = '') {
  const creating = mode === 'signup'; const resetting = mode === 'reset';
  const title = resetting ? 'Recupere o acesso.' : creating ? 'Um espaço só seu.' : 'Suas ideias vão com você.';
  options.openDialog(title, `<p class="dialog-description">${resetting ? 'Enviaremos um link para você escolher uma nova senha.' : 'Entre com seu e-mail para guardar projetos e cadernos na sua conta.'}</p><div class="auth-tabs" role="tablist" aria-label="Acesso à conta"><button type="button" role="tab" aria-selected="${mode === 'signin'}" data-auth-mode="signin">Entrar</button><button type="button" role="tab" aria-selected="${creating}" data-auth-mode="signup">Criar conta</button></div><form id="auth-form"><div class="form-field"><label for="auth-email">E-mail</label><input id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" value="${escape(previousEmail)}" placeholder="voce@exemplo.com" required></div>${!resetting ? `<div class="form-field"><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" autocomplete="${creating ? 'new-password' : 'current-password'}" minlength="8" maxlength="200" placeholder="Pelo menos 8 caracteres" required></div>` : ''}${creating ? '<div class="form-field"><label for="auth-password-confirm">Confirme a senha</label><input id="auth-password-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="200" required></div>' : ''}<p id="auth-message" class="auth-message" role="status" aria-live="polite"></p><div class="dialog-actions"><button type="button" class="text-button" id="reset-password">${resetting ? 'Voltar para entrar' : 'Esqueci minha senha'}</button><button type="submit" class="button button-primary">${resetting ? 'Enviar link' : creating ? 'Criar conta' : 'Entrar'}</button></div></form><p class="account-footnote">${icon('lock')}Cada conta acessa apenas os próprios projetos. Confirme seu e-mail após o cadastro.</p>`);
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
   options.openDialog('Suas ideias, sempre com você.', '<p class="dialog-description">As contas ainda não foram ativadas pelo responsável por este site. Por enquanto, seus projetos ficam neste navegador.</p><p class="privacy-note">Continue usando o caderno e baixe um backup para guardar suas anotações.</p><div class="dialog-actions"><button class="button button-primary" id="account-local-done">Continuar escrevendo</button></div>');
   field('#account-local-done').onclick = () => dialog.close(); return;
  }
  if (!client) { options.notify('O acesso à conta está carregando. Tente novamente em instantes.'); return; }
  if (!user) { openAuth(); return; }
  const conflict = engine.conflict;
  const guest = readGuest();
  let archived = false;
  try { archived = !!(localStorage.getItem(accountCacheKey(user.id) + ':recuperacao') || localStorage.getItem(accountCacheKey(user.id) + ':rascunhos')); } catch {}
  options.openDialog('Sua conta, suas ideias.', `<div class="account-identity"><span class="profile-photo profile-photo-large" data-profile-photo aria-hidden="true"></span><div><strong>${escape(user.email)}</strong><span id="account-live-status">${escape(statusText())}</span></div></div><div class="profile-photo-controls"><input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><button type="button" class="button button-outline" id="choose-profile-photo">Adicionar foto</button><button type="button" class="text-button" id="remove-profile-photo" hidden>Remover foto</button></div><p class="photo-hint">JPG, PNG ou WebP · até 8 MB. A foto será ajustada para o círculo e salva nesta conta.</p><p id="photo-message" class="auth-message" role="status" aria-live="polite"></p><p class="dialog-description">Projetos e páginas ficam vinculados a esta conta. Entre com ela em outro aparelho para recuperar o que já chegou à nuvem.</p>${conflict ? '<div class="account-conflict"><strong>Há duas versões para revisar.</strong><p>Uma edição em outro aparelho mudou a nuvem. Baixe as duas cópias antes de escolher qual deve continuar.</p><div class="account-conflict-actions"><button class="button button-outline" id="download-local-conflict">Baixar deste aparelho</button><button class="button button-outline" id="download-cloud-conflict">Baixar da nuvem</button><button class="button button-outline" id="use-cloud-version">Usar versão da nuvem</button><button class="button button-primary" id="use-local-version">Usar versão deste aparelho</button></div></div>' : ''}<div class="account-options"><button class="backup-option" id="sync-account">${icon('cloud')}<span><strong>Sincronizar agora</strong><small>Conferir e enviar as alterações pendentes.</small></span></button><button class="backup-option" id="account-backup">${icon('download')}<span><strong>Baixar backup desta conta</strong><small>Guarde uma cópia dos projetos e anotações.</small></span></button>${guest?.projects.length && engine.ready && !engine.conflict ? `<button class="backup-option" id="bring-local-projects">${icon('upload')}<span><strong>Trazer para esta conta</strong><small>Você poderá revisar antes de substituir os projetos da conta.</small></span></button>` : ''}</div>${archived ? '<button class="button button-outline" id="account-recovery-download">Baixar versões preservadas neste aparelho</button>' : ''}<p id="account-action-message" class="auth-message" role="status"></p><div class="dialog-actions"><button class="button button-outline" id="close-account">Fechar</button><button class="button button-outline" id="signout-account">Sair da conta</button></div>`);
  paintPhoto();
  void photo.refresh();
  field('#choose-profile-photo').onclick = () => field('#profile-photo-file').click();
  field('#profile-photo-file').onchange = event => {
   const file = event.target.files?.[0]; event.target.value = '';
   if (file) void photo.save(file);
  };
  field('#remove-profile-photo').onclick = () => void photo.remove();
  const output = field('#account-action-message');
  field('#close-account').onclick = () => dialog.close();
  if (field('#account-recovery-download')) field('#account-recovery-download').onclick = () => {
   try {
    const key = accountCacheKey(user.id);
    const recovered = JSON.parse(localStorage.getItem(key + ':recuperacao') || 'null');
    const drafts = JSON.parse(localStorage.getItem(key + ':rascunhos') || '[]');
    const documents = [...(recovered ? [recovered] : []), ...drafts];
    documents.forEach((item, index) => writeBackup(validateState(item.document), `versao-preservada-${index + 1}`));
    output.textContent = `${documents.length} cópia(s) preparada(s). Se o navegador pedir, permita os downloads.`;
   } catch { output.textContent = 'Não foi possível abrir as cópias preservadas. A cópia atual continua disponível em Baixar backup.'; }
  };
  field('#sync-account').onclick = async event => { const action = event.currentTarget; action.disabled = true; await retry(); if (output.isConnected) output.textContent = statusText(); action.disabled = false; };
  field('#account-backup').onclick = () => {
   if (engine.document) writeBackup(options.getWorkspace());
   else { const raw = localStorage.getItem(accountCacheKey(user.id)); if (raw) options.download(raw, 'seu-caderno-recuperacao-conta.json', 'application/json'); else output.textContent = 'Não há uma cópia carregada desta conta neste aparelho.'; }
  };
  if (field('#bring-local-projects')) field('#bring-local-projects').onclick = () => {
   const current = options.getWorkspace();
   options.openDialog('Trazer os projetos deste navegador?', `<p class="dialog-description">Os projetos locais substituirão os projetos desta conta. Uma cópia do conteúdo atual da conta será baixada antes da troca.</p><div class="dialog-actions"><button class="button button-outline" id="cancel-bring">Cancelar</button><button class="button button-primary" id="review-bring">Continuar</button></div>`);
   field('#cancel-bring').onclick = openAccount;
   field('#review-bring').onclick = () => { if (current.projects.length) writeBackup(current, 'antes-da-importacao'); openMigration(guest); };
  };
  field('#signout-account').onclick = async event => {
   const action = event.currentTarget; action.disabled = true;
   try {
    options.capture();
    if (engine.pending || engine.conflict) { const synced = await engine.flush(); if (!synced) throw new Error('Há alterações que ainda não chegaram à nuvem. Reconecte e sincronize antes de sair. Você também pode baixar um backup.'); }
    const {error} = await client.auth.signOut({scope: 'local'}); if (error) throw new Error('Não foi possível sair. Tente novamente.');
   } catch (error) { output.textContent = error.message; }
   finally { action.disabled = false; }
  };
  if (conflict) {
   field('#download-local-conflict').onclick = () => writeBackup(engine.document, 'versao-deste-aparelho');
   field('#download-cloud-conflict').onclick = () => writeBackup(conflict.document, 'versao-da-nuvem');
   const resolve = async (choice, action) => {
    action.disabled = true;
    try { const synced = await engine.resolve(choice); if (synced) { dialog.close(); options.notify('Versão escolhida e sincronizada. A outra cópia foi preservada neste aparelho.'); } else output.textContent = 'A sincronização ainda precisa ser concluída. Confira o estado da conta.'; }
    catch { output.textContent = 'Não foi possível preservar as cópias. Baixe os backups antes de continuar.'; }
    finally { action.disabled = false; }
   };
   field('#use-cloud-version').onclick = event => resolve('remote', event.currentTarget);
   field('#use-local-version').onclick = event => resolve('local', event.currentTarget);
  }
 }
 async function start() {
  draw();
  if (!publicConfig.enabled) return;
  try {
   const {createClient} = await import('./vendor/supabase.js');
   client = createClient(publicConfig.supabaseUrl, publicConfig.supabasePublishableKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit'}});
   engine = new WorkspaceSync({api: supabaseWorkspaceApi(client), onApply: options.applyWorkspace, onStatus: status => { phase = status.phase; statusMessage = status.message; draw(); }});
   const result = client.auth.onAuthStateChange((event, session) => {
    if (['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','PASSWORD_RECOVERY','USER_UPDATED'].includes(event)) setTimeout(() => { void changeSession(session, event).catch(() => { phase = 'error'; statusMessage = 'Não foi possível carregar a conta. Tente novamente.'; draw(); }); }, 0);
   });
   subscription = result.data.subscription;
   const {data, error} = await client.auth.getSession(); if (error) throw error;
   await changeSession(data.session);
   refreshTimer = setInterval(refresh, 15000);
   window.addEventListener('online', refresh);
   window.addEventListener('focus', refresh);
  } catch { if (user) { phase = 'error'; statusMessage = 'Não foi possível carregar sua conta. Tente novamente.'; draw(); } options.notify('As contas estão indisponíveis no momento. A cópia local foi preservada.', true); }
 }
 button.onclick = openAccount; indicator.onclick = openAccount;
 return {
  start, open: openAccount, get user() { return user; }, get phase() { return phase; }, get ready() { return !!engine?.ready; },
  statusText, save(document) { return engine.queue(document); },
  handleStorage(event) { if (user && event.key === accountCacheKey(user.id)) engine.externalChange(); },
  dispose() { photo.dispose(); subscription?.unsubscribe(); clearInterval(refreshTimer); window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); engine?.stop(); }
 };
}
