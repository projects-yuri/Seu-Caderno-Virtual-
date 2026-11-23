import {icon} from './icons.js';
import {FolderWorkspace, folderError} from './folder-storage.js';
import {STORAGE_KEY, validateState, usedPages} from './storage.js';

const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {loading:'Abrindo sua pasta…', choose:'Escolha uma pasta para seus cadernos', unsupported:'Use Chrome ou Edge para salvar em pasta', permission:'Autorize novamente o acesso à pasta', pending:'Alterações aguardando gravação', saving:'Salvando na pasta…', saved:'Salvo na pasta do computador', error:'Não foi possível salvar na pasta', conflict:'A pasta foi alterada fora desta aba'};
export function createFolderController(options) {
 const dialog = document.querySelector('#app-dialog');
 const indicator = document.querySelector('#cloud-indicator');
 const banner = document.querySelector('#cloud-banner');
 const button = document.querySelector('#folder-button');
 const field = selector => dialog.querySelector(selector);
 const engine = new FolderWorkspace({onApply: options.applyWorkspace, onStatus: paint});
 function statusText() { return labels[engine.phase] || labels.choose; }
 function paint() {
  indicator.innerHTML = `${icon('folder')}<span>${escape(statusText())}</span>`;
  indicator.className = `cloud-indicator cloud-${engine.phase === 'saved' ? 'synced' : engine.phase}`;
  button.querySelector('span:last-child').textContent = engine.root ? 'Minha pasta' : 'Escolher pasta';
  options.setLocked(!engine.ready || engine.phase === 'conflict');
  const needsAction = !['saved','pending','saving'].includes(engine.phase) || engine.recoveries.length || engine.message;
  banner.hidden = !needsAction;
  banner.replaceChildren();
  if (needsAction) {
   const text = document.createElement('span');
   text.textContent = engine.message || (engine.recoveries.length ? 'Há rascunhos de recuperação neste navegador. Abra Minha pasta para revisá-los.' : statusText());
   const action = document.createElement('button'); action.className = 'text-button'; action.textContent = 'Abrir minha pasta'; action.onclick = open;
   banner.append(text, action);
  }
  const live = field('#folder-live'); if (live) live.textContent = engine.message || statusText();
  options.onStatusChanged();
 }
 function download(document, name = 'backup') {
  options.download(JSON.stringify(document, null, 2), `seu-caderno-${name}-${new Date().toISOString().slice(0,10)}.json`, 'application/json');
 }
 function legacyCopies() {
  const result = [];
  try {
   const guest = localStorage.getItem(STORAGE_KEY);
   if (guest) result.push({label:'Cadernos antigos deste navegador (visitante)', document: validateState(JSON.parse(guest))});
   if (engine.owner !== 'visitante') {
    const key = `${STORAGE_KEY}:conta:${engine.owner}`;
    const cache = JSON.parse(localStorage.getItem(key) || 'null');
    if (cache?.userId === engine.owner) result.push({label: cache.pending ? 'Alterações antigas ainda não enviadas à nuvem' : 'Cópia antiga desta conta no navegador', document: validateState(cache.document)});
    const recovered = JSON.parse(localStorage.getItem(key + ':recuperacao') || 'null');
    const drafts = JSON.parse(localStorage.getItem(key + ':rascunhos') || '[]');
    for (const item of [...(recovered ? [recovered] : []), ...drafts]) result.push({label:'Versão antiga preservada desta conta', document: validateState(item.document)});
   }
  } catch { options.notify('Uma cópia antiga está inválida. Os dados originais foram preservados no navegador.', true); }
  return result;
 }
 function open() {
  options.capture();
  const copies = legacyCopies();
  const drafts = engine.recoveries;
  const owner = engine.owner;
  const epoch = engine.epoch;
  const path = engine.root ? `${engine.root.name}/${owner === 'visitante' ? 'visitante' : `conta-${owner}`}/cadernos.json` : 'Nenhuma pasta conectada';
  options.openDialog('Seus cadernos no computador.', `<p class="dialog-description">Escolha ou crie uma pasta, como Documentos/Seu-Caderno-Online. Projetos, capas e páginas ficam juntos no arquivo cadernos.json, separados por conta.</p><p class="folder-path">${escape(path)}</p><p id="folder-live" class="auth-message" role="status">${escape(engine.message || statusText())}</p>${engine.supported ? `<div class="folder-actions"><button class="button button-primary" id="choose-folder" ${owner ? '' : 'disabled'}>${icon('folder')}${engine.root ? 'Trocar pasta' : 'Escolher pasta'}</button>${engine.root ? '<button class="button button-outline" id="reconnect-folder">Reconectar / salvar</button>' : ''}${engine.phase === 'conflict' ? '<button class="button button-outline" id="reload-folder">Reabrir versão da pasta</button>' : ''}</div>` : '<p class="privacy-note">Este navegador não oferece a seleção e gravação em pasta. Abra o site no Chrome ou Edge em um computador. Você pode baixar suas cópias antigas abaixo.</p>'}<p class="privacy-note">O salvamento é automático após conectar a pasta. A indicação “Salvo na pasta do computador” aparece depois de concluir a gravação. Leve a pasta ou um backup para usar em outro aparelho. Quem tiver acesso aos arquivos poderá ler as anotações.</p><div class="account-options"><button class="backup-option" id="folder-backup">${icon('download')}<span><strong>Baixar backup do conteúdo aberto</strong><small>Guarde uma cópia em outro local.</small></span></button>${options.getUser() ? '<button class="backup-option" id="folder-cloud">'+icon('download')+'<span><strong>Importar cadernos antigos da nuvem</strong><small>A nuvem será apenas consultada. Nenhum dado será apagado.</small></span></button>' : ''}${[...copies, ...drafts.map(item => ({label: 'Rascunho de recuperação — ' + item.savedAt, ...item}))].map((item, index) => `<div class="folder-copy"><strong>${escape(item.label)}</strong><div><button class="text-button" data-copy-download="${index}">Baixar cópia</button><button class="text-button" data-copy-import="${index}">Importar para a pasta</button></div></div>`).join('')}</div><div class="dialog-actions"><button class="button button-outline" id="close-folder">Fechar</button></div>`);
  async function run(action) {
   try {
    const ok = await action();
    if (ok) { options.notify('Pasta conectada. Seus cadernos estão salvos no computador.'); open(); }
   } catch (error) { const output = field('#folder-live'); if (output) output.textContent = folderError(error); options.notify(folderError(error), true); }
  }
  if (field('#choose-folder')) field('#choose-folder').onclick = () => void run(() => engine.choose());
  if (field('#reconnect-folder')) field('#reconnect-folder').onclick = () => void run(() => engine.reconnect());
  if (field('#reload-folder')) field('#reload-folder').onclick = () => options.confirm('Reabrir a versão da pasta?', 'Suas alterações desta aba serão preservadas como rascunho de recuperação. A versão atual da pasta será aberta e você poderá importar o rascunho depois.', 'Reabrir pasta', () => void run(() => engine.reload()));
  field('#folder-backup').onclick = () => download(options.getWorkspace());
  if (field('#folder-cloud')) field('#folder-cloud').onclick = options.importCloud;
  field('#close-folder').onclick = () => dialog.close();
  const all = [...copies, ...drafts];
  dialog.querySelectorAll('[data-copy-download]').forEach(action => action.onclick = () => download(all[+action.dataset.copyDownload].document, 'recuperacao'));
  dialog.querySelectorAll('[data-copy-import]').forEach(action => action.onclick = () => { const item = all[+action.dataset.copyImport]; if (epoch === engine.epoch) reviewImport(item.document, 'cópia preservada', owner, item.key); });
 }
 function reviewImport(document, source = 'backup', owner = engine.owner, recoveryKey, replace = false) {
  if (owner !== engine.owner) return;
  if (!engine.ready || engine.phase === 'conflict') { options.notify('Conecte e salve sua pasta antes de importar. Depois repita a importação.', true); open(); return; }
  const pages = document.notebooks.reduce((sum, book) => sum + usedPages(book), 0);
  const epoch = engine.epoch;
  options.confirm(`Importar da ${source}?`, `São ${document.projects.length} projeto(s), ${document.notebooks.length} caderno(s) e ${pages} página(s) com anotações. ${replace ? 'O conteúdo aberto será substituído.' : 'Serão adicionados à pasta atual. Se um caderno tiver versões diferentes, uma cópia será criada.'} Um backup do conteúdo anterior será salvo na pasta.`, 'Importar para a pasta', async () => {
   if (owner !== engine.owner || epoch !== engine.epoch) return;
   try {
    options.capture();
    const ok = await engine.import(document, {replace, recoveryKey});
    options.notify(ok ? 'Importação concluída e salva na pasta.' : 'A gravação falhou. Guarde um backup e reconecte a pasta.', !ok);
   } catch (error) { options.notify(folderError(error), true); }
  });
 }
 button.onclick = open; indicator.onclick = open;
 return {engine, open, reviewImport, statusText, start: owner => engine.start(owner), save: document => engine.queue(document), flush: () => engine.flush(), get dirty() { return engine.dirty; }};
}
