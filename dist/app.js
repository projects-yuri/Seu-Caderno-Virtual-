import {icon} from './icons.js';
import {createAccountController} from './accounts.js';
import {createFolderController} from './folders.js';
import {STORAGE_KEY, COLORS, PAPERS, initialState, validateState, makeNotebook, makeProject, projectNotebooks, moveNotebook, removeProject, totalCapacity, canAddNotebook, usedPages, pageHasContent, plainText} from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const main = $('#main');
const dialog = $('#app-dialog');
const THEME_KEY = 'seu-caderno-virtual:theme';
const themeMedia = matchMedia('(prefers-color-scheme: dark)');
let state;
let toastTimer;
let activeBook = null;
let activePage = 1;
let notesFilter = 'all';
let notesQuery = '';
let notesProjectFilter = 'all';
let editorSelection = null;
let applyingExternalChange = false;
let accounts = null;
let folders = null;

function systemTheme() { return themeMedia.matches ? 'dark' : 'light'; }
function applyTheme(theme, remember = false) {
 const dark = theme === 'dark';
 document.documentElement.dataset.theme = dark ? 'dark' : 'light';
 document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
 $('meta[name="theme-color"]').content = dark ? '#252226' : '#f8f7f2';
 const button = $('#theme-toggle');
 button.innerHTML = icon(dark ? 'sun' : 'moon');
 button.setAttribute('aria-pressed', String(dark));
 button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
 button.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
 if (remember) {
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); }
  catch { toast('Tema aplicado nesta sessão. Não foi possível guardar a preferência.', true); }
 }
}
themeMedia.addEventListener('change', () => {
 try { if (!['dark', 'light'].includes(localStorage.getItem(THEME_KEY))) applyTheme(systemTheme()); } catch {}
});

function escapeHTML(value = '') { return String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char])); }
function hydrateIcons(root = document) { $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function colorStyle(book) { const color = COLORS[book.color]; return `--book-color:${color.value};--book-light:${color.light}`; }
function dateLabel(date) { return new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: 'short'}).format(new Date(date)); }
function getBook(id) { return state.notebooks.find(book => book.id === id); }
function getProject(id) { return state.projects.find(project => project.id === id); }
function entries() {
 return state.notebooks.flatMap(book => Object.entries(book.pages).filter(([, page]) => pageHasContent(page) || page.starred).map(([number, page]) => ({book, project: getProject(book.projectId), number: +number, ...page}))).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
function toast(message, error = false) {
 const el = $('#toast');
 clearTimeout(toastTimer);
 el.textContent = message;
 el.className = `toast visible${error ? ' error' : ''}`;
 toastTimer = setTimeout(() => el.classList.remove('visible'), error ? 6500 : 3500);
}
function setSaveStatus() {
 const el = $('#save-status');
 if (!el) return;
 const phase = folders?.engine.phase;
 const failed = ['error', 'conflict', 'permission'].includes(phase);
 el.classList.toggle('failed', failed);
 el.innerHTML = `${icon(failed ? 'info' : phase === 'saved' ? 'check' : 'clock')}<span>${escapeHTML(folders?.statusText() || 'Conecte sua pasta')}</span>`;
 el.setAttribute('aria-label', el.textContent);
}
function persist() {
 if (applyingExternalChange || !folders?.engine.ready) return true;
 try { folders.save(state); setSaveStatus(); return true; }
 catch (error) { setSaveStatus(); toast(error.message || 'Não foi possível salvar. Baixe um backup.', true); return false; }
}
function scheduleSave() { persist(); }
function savePageFromDOM() {
 if (!activeBook || !$('#page-content')) return;
 const book = getBook(activeBook);
 if (!book) return;
 const old = book.pages[activePage];
 const title = $('#page-title').value.slice(0, 150);
 const html = $('#page-content').innerHTML;
 if (old?.title === title && old?.html === html || !old && !title && !plainText(html).trim()) return;
 book.pages[activePage] = {title, html, updatedAt: new Date().toISOString(), starred: old?.starred || false};
 scheduleSave();
 const row = $(`.page-item[data-page="${activePage}"]`);
 if (row) { $('.page-info strong', row).textContent = title || `Página ${activePage}`; $('.page-info small', row).textContent = pageHasContent(book.pages[activePage]) ? dateLabel(book.pages[activePage].updatedAt) : 'Em branco'; }
 updateWordCount(); updateUsage(book);
}
function updateUsage(book) {
 const count = usedPages(book);
 if ($('#book-usage')) $('#book-usage').textContent = `${count} de ${book.capacity} páginas usadas`;
 if ($('#usage-progress')) $('#usage-progress').style.width = `${count / book.capacity * 100}%`;
}
function updateWordCount() {
 const text = $('#page-content')?.textContent.trim() || '';
 const count = text ? text.split(/\s+/u).length : 0;
 if ($('#word-count')) $('#word-count').textContent = `${count} ${count === 1 ? 'palavra' : 'palavras'}`;
 if ($('#page-date')) $('#page-date').textContent = getBook(activeBook)?.pages[activePage]?.updatedAt ? `Atualizada em ${dateLabel(getBook(activeBook).pages[activePage].updatedAt)}` : 'Uma página, muitas possibilidades';
}
function sanitizedHTML(raw) {
 const doc = new DOMParser().parseFromString(raw, 'text/html');
 const allowed = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'H2', 'H3', 'BLOCKQUOTE', 'S', 'STRIKE']);
 function clean(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
  if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'IMG', 'FORM', 'INPUT', 'VIDEO', 'AUDIO', 'LINK', 'META'].includes(node.tagName)) return document.createDocumentFragment();
  const el = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : document.createDocumentFragment();
  node.childNodes.forEach(child => el.append(clean(child)));
  return el;
 }
 const container = document.createElement('div');
 doc.body.childNodes.forEach(node => container.append(clean(node)));
 return container.innerHTML;
}
function goToPage(id, page) {
 savePageFromDOM(); persist();
 const book = getBook(id);
 if (book) location.hash = `/caderno/${book.id}/${Math.min(book.capacity, Math.max(1, page))}`;
}
function renderRoute() {
 savePageFromDOM();
 activeBook = null;
 document.body.classList.remove('editor-mode');
 const route = location.hash.replace(/^#\/?/, '').split('/');
 $$('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === (route[0] === 'notas' ? 'notas' : 'projetos')));
 if (route[0] === 'caderno' && getBook(route[1])) {
  const book = getBook(route[1]);
  const page = Number(route[2]) || 1;
  if (!Number.isInteger(page) || page < 1 || page > book.capacity) { location.hash = `/caderno/${book.id}/1`; return; }
  renderEditor(book, page);
 } else if (route[0] === 'notas') renderNotes();
 else if (route[0] === 'projeto' && getProject(route[1])) { state.activeProjectId = route[1]; persist(); renderDesk(); }
 else if (route[0] === 'mesa' && getProject(state.activeProjectId)) renderDesk();
 else renderProjects();
}

function renderProjects() {
 document.title = 'Meus projetos — Seu Caderno Virtual!';
 main.innerHTML = `<section class="projects-view"><div class="hero projects-hero"><div><div class="eyebrow">CADA IDEIA NO SEU LUGAR</div><h1>Um projeto.<br><em>Muitas possibilidades.</em></h1><p class="hero-copy">Crie um projeto, separe seus cadernos e encontre espaço para cada matéria.</p></div><div class="hero-aside">${icon('folder')}<span>Da faculdade aos seus planos.<br>Cada projeto tem a sua mesa.</span></div></div><div class="section-heading projects-heading"><div><h2>Meus projetos</h2><p class="project-limits">${state.projects.length} ${state.projects.length === 1 ? 'projeto' : 'projetos'} · ${state.notebooks.length} cadernos · ${totalCapacity(state)} páginas no total</p></div><button class="button button-primary" id="new-project">${icon('plus')}Novo projeto</button></div><div class="projects-grid">${state.projects.map(project => {
  const books = projectNotebooks(state, project.id);
  return `<article class="project-card" style="${colorStyle(project)}"><button class="project-card-open" data-open-project="${project.id}" aria-label="Abrir projeto ${escapeHTML(project.title)}"><span class="project-folder">${icon('folder')}</span><h2>${escapeHTML(project.title)}</h2><p>${escapeHTML(project.subtitle) || 'Um novo espaço para suas anotações.'}</p><span class="project-mini-books">${books.length ? books.map(book => `<span style="--mini-color:${COLORS[book.color].value}" title="${escapeHTML(book.title)}">${escapeHTML(book.title)}</span>`).join('') : '<span class="project-no-books">Adicione ou mova seus cadernos para cá</span>'}</span><span class="project-card-meta"><span>${books.length} ${books.length === 1 ? 'caderno' : 'cadernos'}</span><span>${books.reduce((total, book) => total + book.capacity, 0)} páginas</span></span></button><button class="icon-button project-edit" data-edit-project="${project.id}" aria-label="Editar projeto ${escapeHTML(project.title)}" title="Editar projeto">${icon('edit')}</button></article>`;
 }).join('')}<button class="project-add-card" id="new-project-card">${icon('plus')}<strong>Um novo projeto</strong><span>Faculdade, trabalho ou uma ideia sua.</span></button></div><p class="project-guidance">${icon('info')}Crie quantos projetos e cadernos precisar. As anotações ficam na pasta escolhida no computador.</p></section>`;
 $('#new-project').onclick = () => projectDialog(); $('#new-project-card').onclick = () => projectDialog();
 $$('[data-open-project]').forEach(btn => btn.onclick = () => { location.hash = `/projeto/${btn.dataset.openProject}`; });
 $$('[data-edit-project]').forEach(btn => btn.onclick = () => projectDialog(btn.dataset.editProject));
}
function projectDialog(id) {
 const project = id ? getProject(id) : null;
 const current = project || makeProject();
 const count = project ? projectNotebooks(state, id).length : 0;
 openDialog(project ? 'Um projeto do seu jeito.' : 'Comece por um projeto.', `<p class="dialog-description">Agrupe seus cadernos por curso, trabalho ou objetivo. Ex.: Faculdade — CD.</p><form id="project-form"><div class="form-field"><label for="project-title">Nome do projeto</label><input id="project-title" name="title" maxlength="60" placeholder="Ex.: Faculdade — CD" value="${escapeHTML(project?.title || '')}" required></div><div class="form-field"><label for="project-subtitle">Descrição</label><input id="project-subtitle" name="subtitle" maxlength="100" placeholder="Ex.: Matérias do semestre" value="${escapeHTML(project?.subtitle || '')}"></div><fieldset class="project-colors"><legend class="field-label">Cor do projeto</legend><div class="color-picker">${Object.entries(COLORS).map(([key, color]) => `<label class="color-option" title="${color.name}"><input type="radio" name="color" value="${key}" ${current.color === key ? 'checked' : ''} aria-label="${color.name}"><span class="color-swatch" style="--swatch:${color.value}">${icon('check')}</span></label>`).join('')}</div></fieldset>${count ? '<p class="privacy-note">Para excluir este projeto, mova primeiro seus cadernos para outro projeto.</p>' : ''}<p id="project-error" class="dialog-error" role="alert"></p><div class="dialog-actions">${project ? `<button type="button" class="button delete-notebook" id="delete-project" ${count ? 'disabled' : ''} aria-label="Excluir projeto">${icon('trash')}<span>Excluir</span></button>` : ''}<button type="button" class="button button-outline" id="cancel-project">Cancelar</button><button type="submit" class="button button-primary">${project ? 'Salvar projeto' : 'Criar projeto'}</button></div></form>`);
 $('#cancel-project').onclick = () => dialog.close();
 $('#project-form').onsubmit = event => {
  event.preventDefault();
  const data = new FormData(event.target); const title = data.get('title').trim();
  if (!title) { $('#project-error').textContent = 'Dê um nome ao projeto.'; return; }
  Object.assign(current, {title, subtitle: data.get('subtitle').trim(), color: data.get('color')});
  if (!project) state.projects.push(current);
  state.activeProjectId = current.id;
  const saved = persist(); dialog.close();
  if (!project) location.hash = `/projeto/${current.id}`;
  renderRoute(); if (saved) toast(project ? 'Projeto atualizado.' : 'Projeto criado. Agora organize seus cadernos.');
 };
 if (project) $('#delete-project').onclick = () => confirmDialog('Excluir este projeto?', `O projeto “${project.title}” está vazio e será removido.`, 'Excluir projeto', () => {
  try { removeProject(state, id); const saved = persist(); location.hash = '/projetos'; renderRoute(); if (saved) toast('Projeto excluído.'); } catch (error) { toast(error.message, true); }
 });
}
function moveNotebookDialog(projectId = state.activeProjectId) {
 const available = state.notebooks.filter(book => book.projectId !== projectId);
 if (!available.length || !getProject(projectId)) { toast('Não há cadernos de outros projetos para mover.'); return; }
 openDialog('Trazer um caderno para cá.', `<p class="dialog-description">Escolha um caderno para mover para “${escapeHTML(getProject(projectId).title)}”. Suas páginas acompanham o caderno.</p><form id="move-book-form"><div class="form-field"><label for="move-book-select">Caderno</label><div class="select-wrap"><select id="move-book-select" name="notebook">${available.map(book => `<option value="${book.id}">${escapeHTML(book.title)} · ${escapeHTML(getProject(book.projectId).title)}</option>`).join('')}</select></div></div><div class="dialog-actions"><button type="button" class="button button-outline" id="cancel-move">Cancelar</button><button type="submit" class="button button-primary">Mover caderno</button></div></form>`);
 $('#cancel-move').onclick = () => dialog.close();
 $('#move-book-form').onsubmit = event => { event.preventDefault(); moveNotebook(state, new FormData(event.target).get('notebook'), projectId); const saved = persist(); dialog.close(); renderRoute(); if (saved) toast('Caderno movido com todas as suas anotações.'); };
}

function coverHTML(book) {
 return `<article class="notebook-item" style="${colorStyle(book)}">
  <button class="book-open" data-open="${book.id}" aria-label="Abrir ${escapeHTML(book.title)}, ${book.capacity} páginas">
   <span class="book-cover"><span class="cover-kicker">SEU CADERNO VIRTUAL</span><span class="cover-label"><span class="cover-title">${escapeHTML(book.title)}</span><span class="cover-divider"></span><span class="cover-subtitle">${escapeHTML(book.subtitle)}</span></span><span class="cover-bottom">${icon('leaf')} ${book.capacity} PÁGINAS</span><span class="book-ribbon"></span></span>
  </button>
  <div class="notebook-caption"><span>${usedPages(book)} de ${book.capacity} páginas usadas</span><button class="icon-button" data-edit="${book.id}" aria-label="Personalizar capa de ${escapeHTML(book.title)}" title="Personalizar caderno">${icon('edit')}</button></div>
 </article>`;
}
function renderDesk() {
 const project = getProject(state.activeProjectId);
 if (!project) { renderProjects(); return; }
 document.title = `${project.title} — Seu Caderno Virtual!`;
 const books = projectNotebooks(state, project.id);
 const recent = entries().filter(page => page.book.projectId === project.id).slice(0, 3);
 const canAdd = canAddNotebook(state);
 const canMove = state.notebooks.some(book => book.projectId !== project.id);
 const slot = `<div class="notebook-item"><button class="empty-book-slot" data-add-slot aria-label="Adicionar um caderno">${icon('plus')}<span>Um novo caderno</span><small>Cada matéria no seu lugar</small></button></div>`;
 main.innerHTML = `<section class="hero project-desk-hero"><div><a class="project-back" href="#/projetos">${icon('chevronLeft')}Todos os projetos</a><div class="eyebrow">SEU PROJETO, SUA MESA</div><h1>${escapeHTML(project.title)}</h1><p class="hero-copy">${escapeHTML(project.subtitle) || 'Um espaço para guardar o que você está construindo.'}</p></div><button class="button button-outline" id="edit-project">${icon('edit')}Editar projeto</button></section>
 <section aria-label="Mesa de cadernos"><div class="desk-toolbar"><div class="desk-title"><h2>Cadernos do projeto</h2><span class="counter-badge">${books.length} ${books.length === 1 ? 'caderno' : 'cadernos'}</span></div><div class="desk-controls"><button class="text-button" id="desk-settings">${icon('palette')}Personalizar mesa</button><button class="button button-primary" id="add-notebook" ${canAdd ? '' : 'disabled'} title="${canAdd ? 'Criar um caderno neste projeto' : 'Criar um caderno neste projeto'}">${icon('plus')}Novo caderno</button></div></div>
 <div class="desk-wrap"><div class="desk ${state.desk}"><div class="notebook-grid">${books.map(coverHTML).join('')}${Array.from({length: Math.max(1, 3 - books.length)}, () => slot).join('')}</div><div class="desk-note" aria-hidden="true">Escreva<br>sem pressa.</div><div class="pencil" aria-hidden="true"></div></div></div>
 <div class="project-desk-footer"><p class="desk-hint">${icon('info')}${state.notebooks.length} cadernos e ${totalCapacity(state)} páginas na pasta. Sem limite global de cadernos.</p>${canMove ? `<button class="text-button" id="move-notebook">${icon('move')}Trazer caderno de outro projeto</button>` : ''}</div></section>
 <section class="recent-section" aria-labelledby="recent-title"><div class="section-heading"><h2 id="recent-title">${icon('clock')}Continue de onde parou</h2><a href="#/notas" class="text-button">Ver todas as notas</a></div>${recent.length ? `<div class="recent-list">${recent.map(page => `<button class="recent-card" data-recent="${page.book.id}:${page.number}" style="${colorStyle(page.book)}"><span class="recent-card-icon">${icon('page')}</span><span class="recent-card-text"><strong>${escapeHTML(page.title || `Página ${page.number}`)}</strong><small>${escapeHTML(page.book.title)} · Pág. ${page.number} · ${dateLabel(page.updatedAt)}</small></span></button>`).join('')}</div>` : `<div class="empty-recent">${icon('spark')}<div><strong>Este projeto está pronto para suas anotações.</strong><p>Abra um caderno ou traga um de outro projeto para começar.</p></div></div>`}</section>`;
 $$('[data-open]').forEach(btn => btn.onclick = () => {
  const book = getBook(btn.dataset.open);
  const last = state.lastOpened;
  const firstNote = Object.entries(book.pages).find(([, page]) => pageHasContent(page));
  goToPage(book.id, last?.notebookId === book.id ? last.page : firstNote ? +firstNote[0] : 1);
 });
 $$('[data-edit]').forEach(btn => btn.onclick = () => notebookDialog(btn.dataset.edit));
 $$('[data-recent]').forEach(btn => btn.onclick = () => { const [id, number] = btn.dataset.recent.split(':'); goToPage(id, +number); });
 $('#add-notebook').onclick = () => notebookDialog();
 $$('[data-add-slot]').forEach(btn => btn.onclick = () => notebookDialog());
 $$('[data-move-slot]').forEach(btn => btn.onclick = () => moveNotebookDialog(project.id));
 if ($('#move-notebook')) $('#move-notebook').onclick = () => moveNotebookDialog(project.id);
 $('#edit-project').onclick = () => projectDialog(project.id);
 $('#desk-settings').onclick = deskDialog;
}

function renderNotes() {
 if (notesProjectFilter !== 'all' && !getProject(notesProjectFilter)) notesProjectFilter = 'all';
 document.title = 'Todas as notas — Seu Caderno Virtual!';
 main.innerHTML = `<section class="notes-view"><div class="notes-top"><div><div class="eyebrow">TUDO NO SEU LUGAR</div><h1>Todas as notas<span class="brand-dot">.</span></h1><p>Encontre aquela ideia que você guardou para depois.</p></div><label class="search-box notes-search">${icon('search')}<input id="notes-search" type="search" placeholder="Buscar nas suas anotações…" aria-label="Buscar nas anotações" value="${escapeHTML(notesQuery)}"></label></div><div class="notes-filters" aria-label="Filtrar notas"><label class="notes-project-select select-wrap"><span class="sr-only">Filtrar por projeto</span><select id="notes-project-filter" aria-label="Filtrar por projeto"><option value="all">Todos os projetos</option>${state.projects.map(project => `<option value="${project.id}" ${notesProjectFilter === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`).join('')}</select></label><button class="filter-chip ${notesFilter === 'all' ? 'active' : ''}" data-filter="all">Todas as notas</button><button class="filter-chip ${notesFilter === 'starred' ? 'active' : ''}" data-filter="starred">${icon('star')}Favoritas</button>${state.notebooks.map(book => `<button class="filter-chip ${notesFilter === book.id ? 'active' : ''}" data-filter="${book.id}">${escapeHTML(book.title)}</button>`).join('')}</div><div id="notes-results" class="notes-list" aria-live="polite"></div></section>`;
 $('#notes-project-filter').onchange = event => { notesProjectFilter = event.target.value; notesFilter = 'all'; $$('[data-filter]').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === 'all')); renderNotesResults(); };
 $('#notes-search').oninput = event => { notesQuery = event.target.value; renderNotesResults(); };
 $$('[data-filter]').forEach(btn => btn.onclick = () => { notesFilter = btn.dataset.filter; $$('[data-filter]').forEach(filter => filter.classList.toggle('active', filter === btn)); renderNotesResults(); });
 renderNotesResults();
}
function normalized(value) { return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function renderNotesResults() {
 const query = normalized(notesQuery.trim());
 const allEntries = entries();
 const results = allEntries.filter(page => (notesProjectFilter === 'all' || notesProjectFilter === page.book.projectId) && (notesFilter === 'all' || notesFilter === 'starred' && page.starred || notesFilter === page.book.id) && (!query || normalized(`${page.title} ${plainText(page.html)} ${page.book.title} ${page.project.title}`).includes(query)));
 $('#notes-results').innerHTML = results.length ? results.map(page => `<button class="note-card" data-note="${page.book.id}:${page.number}" style="${colorStyle(page.book)}"><span class="note-card-book">${icon('book')}${escapeHTML(page.book.title)}</span>${page.starred ? `<span class="star-marker">${icon('star')}</span>` : ''}<span class="note-project-name">${escapeHTML(page.project.title)}</span><h3>${escapeHTML(page.title || `Página ${page.number}`)}</h3><p>${escapeHTML(plainText(page.html)) || 'Uma ideia começa com um título.'}</p><span class="note-card-footer"><span>Página ${page.number}</span><span>${dateLabel(page.updatedAt)}</span></span></button>`).join('') : `<div class="notes-empty">${icon(query ? 'search' : 'notes')}<h2>${query ? 'Essa ideia ainda não apareceu.' : notesFilter === 'starred' ? 'Suas favoritas vão morar aqui.' : 'Um mundo de páginas em branco.'}</h2><p>${query ? 'Tente outra palavra ou escolha outro caderno no filtro.' : notesFilter === 'starred' ? 'Marque a estrela no editor para encontrar suas anotações favoritas com facilidade.' : 'Quando você começar a escrever, suas anotações vão aparecer aqui, prontinhas para reencontrar.'}</p><a href="#/projetos" class="button button-primary">${icon('folder')}Abrir meus projetos</a></div>`;
 $$('[data-note]').forEach(btn => btn.onclick = () => { const [id, number] = btn.dataset.note.split(':'); goToPage(id, +number); });
}

function renderEditor(book, page) {
 activeBook = book.id; activePage = page;
 state.activeProjectId = book.projectId;
 state.lastOpened = {notebookId: book.id, page}; persist();
 document.body.classList.add('editor-mode');
 document.title = `Página ${page} · ${book.title} — Seu Caderno Virtual!`;
 const note = book.pages[page];
 main.innerHTML = `<div class="editor-shell" style="${colorStyle(book)}"><aside class="page-sidebar" id="page-sidebar" aria-label="Páginas do caderno"><div class="sidebar-book"><a href="#/projeto/${book.projectId}" class="back-link">${icon('chevronLeft')}Voltar ao projeto</a><span class="editor-project-label">${escapeHTML(getProject(book.projectId).title)}</span><div class="sidebar-book-title"><span class="mini-book">${icon('book')}</span><h2>${escapeHTML(book.title)}</h2><button class="icon-button" id="edit-current-book" aria-label="Personalizar caderno">${icon('edit')}</button></div><p>${escapeHTML(book.subtitle)}</p></div><label class="search-box">${icon('search')}<input type="search" id="page-search" placeholder="Buscar neste caderno…" aria-label="Buscar páginas neste caderno"></label><div class="sidebar-label"><span>PÁGINAS</span><span>${book.capacity}</span></div><div class="pages-list" id="pages-list"></div><div class="sidebar-bottom"><span id="book-usage">${usedPages(book)} de ${book.capacity} páginas usadas</span><div class="progress-track"><span id="usage-progress" style="width:${usedPages(book) / book.capacity * 100}%"></span></div></div></aside>
 <section class="editor-main" aria-label="Editor de anotações"><div class="editor-topbar"><div class="editor-breadcrumb"><button class="icon-button sidebar-toggle" id="sidebar-toggle" aria-label="Mostrar páginas" aria-expanded="false">${icon('menu')}</button><span>${escapeHTML(book.title)}</span>${icon('chevronRight')}<strong>Página ${page}</strong></div><div class="editor-status"><span id="save-status" class="save-status" role="status">${icon('check')}<span>Conecte sua pasta</span></span><button class="icon-button editor-action ${note?.starred ? 'is-starred' : ''}" id="star-page" aria-label="${note?.starred ? 'Remover dos favoritos' : 'Favoritar página'}" aria-pressed="${!!note?.starred}" title="Favoritar página">${icon('star')}</button><button class="icon-button editor-action" id="print-page" aria-label="Imprimir página ou salvar como PDF" title="Imprimir / salvar PDF">${icon('print')}</button><button class="icon-button editor-action" id="clear-page" aria-label="Limpar esta página" title="Limpar página">${icon('trash')}</button></div></div>
 <div class="format-toolbar" role="toolbar" aria-label="Formatação do texto"><button class="toolbar-button" data-command="undo" aria-label="Desfazer" title="Desfazer">${icon('undo')}</button><button class="toolbar-button" data-command="redo" aria-label="Refazer" title="Refazer">${icon('redo')}</button><span class="toolbar-divider"></span><button class="toolbar-button" data-command="bold" aria-label="Negrito" title="Negrito (Ctrl+B)">${icon('bold')}</button><button class="toolbar-button" data-command="italic" aria-label="Itálico" title="Itálico (Ctrl+I)">${icon('italic')}</button><button class="toolbar-button" data-command="underline" aria-label="Sublinhado" title="Sublinhado (Ctrl+U)">${icon('underline')}</button><span class="toolbar-divider"></span><button class="toolbar-button" data-command="formatBlock" data-value="h2" aria-label="Título de seção" title="Título de seção">${icon('heading')}</button><button class="toolbar-button" data-command="insertUnorderedList" aria-label="Lista com marcadores" title="Lista com marcadores">${icon('list')}</button><span class="toolbar-divider"></span><span class="paper-select-wrap"><select class="paper-select" id="paper-select" aria-label="Tipo de papel">${Object.entries(PAPERS).map(([key, label]) => `<option value="${key}" ${book.paper === key ? 'selected' : ''}>${label}</option>`).join('')}</select></span></div>
 <div class="writing-area"><article class="paper"><div class="paper-header"><span>${escapeHTML(book.title)}</span><span>${icon('leaf')} PÁGINA ${String(page).padStart(2, '0')}</span></div><label class="sr-only" for="page-title">Título da página</label><input id="page-title" class="page-title-input" maxlength="150" placeholder="Dê um título à sua ideia…" value="${escapeHTML(note?.title || '')}" autocomplete="off"><div id="page-content" class="page-content" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Anotações da página ${page}" data-paper="${book.paper}" data-placeholder="O que você quer guardar hoje?" spellcheck="true"></div><div class="paper-footer"><span id="word-count">0 palavras</span><span>${icon('leaf')}<span id="page-date">Uma página, muitas possibilidades</span></span></div></article><div class="page-pagination"><button class="button" id="previous-page" ${page === 1 ? 'disabled' : ''}>${icon('chevronLeft')}Página anterior</button><label class="page-jump">Página <input id="page-jump" type="number" inputmode="numeric" min="1" max="${book.capacity}" value="${page}" aria-label="Ir para a página"> de ${book.capacity}</label><button class="button" id="next-page" ${page === book.capacity ? 'disabled' : ''}>Próxima página${icon('chevronRight')}</button></div></div></section></div>`;
 const content = $('#page-content');
 content.innerHTML = sanitizedHTML(note?.html || '');
 // Save only safe markup, including when restoring an older backup.
 if (note && note.html !== content.innerHTML) { note.html = content.innerHTML; persist(); }
 setSaveStatus();
 renderPageList(book); updateWordCount();
 requestAnimationFrame(() => $(`.page-item[data-page="${page}"]`)?.scrollIntoView({block: 'nearest'}));
 $('#page-title').oninput = savePageFromDOM;
 content.oninput = savePageFromDOM;
 content.onpaste = event => {
  event.preventDefault();
  const text = event.clipboardData.getData('text/plain');
  if (content.innerHTML.length + text.length > 250000) { toast('Esta página está cheia. Continue em outra página.', true); return; }
  content.focus(); document.execCommand('insertText', false, text); savePageFromDOM();
 };
 content.ondrop = event => { event.preventDefault(); toast('Cole o texto da anotação para manter a página organizada.'); };
 content.onbeforeinput = event => {
  if (content.innerHTML.length >= 249000 && !event.inputType.startsWith('delete') && !event.inputType.startsWith('history')) { event.preventDefault(); toast('Esta página está cheia. Continue em outra página.', true); }
 };
 $('#page-search').oninput = event => renderPageList(book, event.target.value);
 $('#previous-page').onclick = () => goToPage(book.id, page - 1);
 $('#next-page').onclick = () => goToPage(book.id, page + 1);
 const jumpToInputPage = () => {
  const input = $('#page-jump');
  const number = +input.value;
  if (Number.isInteger(number) && number >= 1 && number <= book.capacity) goToPage(book.id, number);
  else { input.value = page; toast(`Escolha uma página entre 1 e ${book.capacity}.`); }
 };
 $('#page-jump').onchange = jumpToInputPage;
 $('#page-jump').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); jumpToInputPage(); } };
 $('#paper-select').onchange = event => { book.paper = event.target.value; content.dataset.paper = book.paper; persist(); };
 $('#edit-current-book').onclick = () => { savePageFromDOM(); notebookDialog(book.id); };
 $('#star-page').onclick = () => {
  savePageFromDOM();
  if (!book.pages[page]) book.pages[page] = {title: '', html: '', updatedAt: new Date().toISOString(), starred: false};
  book.pages[page].starred = !book.pages[page].starred;
  const starred = book.pages[page].starred;
  $('#star-page').classList.toggle('is-starred', starred); $('#star-page').setAttribute('aria-pressed', String(starred)); $('#star-page').setAttribute('aria-label', starred ? 'Remover dos favoritos' : 'Favoritar página');
  persist(); renderPageList(book, $('#page-search').value); toast(starred ? 'Página marcada como favorita.' : 'Página removida das favoritas.');
 };
 $('#print-page').onclick = () => { savePageFromDOM(); persist(); window.print(); };
 $('#clear-page').onclick = () => {
  if (!book.pages[page] && !content.textContent.trim() && !$('#page-title').value) { toast('Esta página já está em branco.'); return; }
  confirmDialog('Deixar a página em branco?', 'O título e o conteúdo desta página serão apagados. As outras páginas ficam guardadas.', 'Limpar página', () => {
   activeBook = null; delete book.pages[page]; persist(); renderEditor(book, page); toast('Página limpa. Um novo começo.');
  });
 };
 $('#sidebar-toggle').onclick = toggleSidebar;
 $$('[data-command]').forEach(btn => {
  btn.onmousedown = event => event.preventDefault();
  btn.onclick = () => {
   content.focus();
   if (editorSelection && content.contains(editorSelection.commonAncestorContainer)) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(editorSelection); }
   let value = btn.dataset.value || null;
   if (btn.dataset.command === 'formatBlock' && document.queryCommandValue('formatBlock').toLowerCase() === 'h2') value = 'p';
   document.execCommand(btn.dataset.command, false, value); savePageFromDOM();
  };
 });
}
function renderPageList(book, query = '') {
 const filter = normalized(query.trim());
 const numbers = Array.from({length: book.capacity}, (_, i) => i + 1).filter(number => !filter || normalized(`${number} ${book.pages[number]?.title || ''} ${plainText(book.pages[number]?.html || '')}`).includes(filter));
 $('#pages-list').innerHTML = numbers.map(number => {
  const page = book.pages[number];
  return `<button class="page-item ${number === activePage ? 'active' : ''}" data-page="${number}" ${number === activePage ? 'aria-current="page"' : ''}><span class="page-number">${String(number).padStart(2, '0')}</span><span class="page-info"><strong>${escapeHTML(page?.title || `Página ${number}`)}</strong><small>${pageHasContent(page) ? dateLabel(page.updatedAt) : 'Em branco'}</small></span>${page?.starred ? icon('star') : ''}</button>`;
 }).join('') || '<p class="sidebar-empty">Nenhuma página encontrada.</p>';
 $$('.page-item').forEach(btn => btn.onclick = () => { goToPage(book.id, +btn.dataset.page); closeSidebar(); });
}
function toggleSidebar() {
 const sidebar = $('#page-sidebar');
 const opened = sidebar.classList.toggle('open');
 $('#sidebar-toggle').setAttribute('aria-expanded', String(opened));
 if (opened) { const shade = document.createElement('button'); shade.className = 'sidebar-shade'; shade.setAttribute('aria-label', 'Fechar lista de páginas'); shade.onclick = closeSidebar; $('.editor-shell').append(shade); }
 else $('.sidebar-shade')?.remove();
}
function closeSidebar() { $('#page-sidebar')?.classList.remove('open'); $('#sidebar-toggle')?.setAttribute('aria-expanded', 'false'); $('.sidebar-shade')?.remove(); }

function openDialog(title, html) {
 if (dialog.open) dialog.close();
 dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${escapeHTML(title)}</h2><button class="icon-button" id="close-dialog" aria-label="Fechar janela">${icon('close')}</button></div>${html}`;
 $('#close-dialog').onclick = () => dialog.close();
 dialog.showModal();
}
function confirmDialog(title, description, action, onConfirm) {
 openDialog(title, `<p class="dialog-description">${escapeHTML(description)}</p><div class="dialog-actions"><button class="button button-outline" id="confirm-cancel">Cancelar</button><button class="button button-danger" id="confirm-action">${escapeHTML(action)}</button></div>`);
 $('#confirm-cancel').onclick = () => dialog.close();
 $('#confirm-action').onclick = () => { dialog.close(); onConfirm(); };
 $('#confirm-cancel').focus();
}
function notebookDialog(id) {
 const book = id ? getBook(id) : null;
 if (!book && !getProject(state.activeProjectId)) { projectDialog(); return; }
 if (!book && !canAddNotebook(state)) { toast('Escolha uma quantidade válida de páginas.'); return; }
 const max = 300;
 const current = book || makeNotebook({projectId: state.activeProjectId, color: Object.keys(COLORS).find(color => !state.notebooks.some(notebook => notebook.color === color)) || 'forest'});
 openDialog(book ? 'Um caderno com a sua cara.' : 'Espaço para novas ideias.', `<p class="dialog-description">Escolha o que vai na capa. O resto, você preenche com o tempo.</p><form id="notebook-form"><div class="form-field"><label for="book-project">Projeto</label><div class="select-wrap"><select id="book-project" name="projectId">${state.projects.map(project => `<option value="${project.id}" ${project.id === current.projectId ? 'selected' : ''}>${escapeHTML(project.title)}</option>`).join('')}</select></div></div><div class="form-field"><label for="book-title">Título da capa</label><input id="book-title" name="title" maxlength="60" value="${escapeHTML(book ? current.title : '')}" placeholder="Ex.: Meus estudos" required></div><div class="form-field"><label for="book-subtitle">Subtítulo</label><input id="book-subtitle" name="subtitle" maxlength="100" value="${escapeHTML(book ? current.subtitle : '')}" placeholder="Uma frase, uma matéria, um novo começo…"></div><fieldset style="border:0;padding:0;margin:18px 0 0"><legend class="field-label">Cor da capa</legend><div class="color-picker">${Object.entries(COLORS).map(([key, color]) => `<label class="color-option" title="${color.name}"><input type="radio" name="color" value="${key}" ${current.color === key ? 'checked' : ''} aria-label="${color.name}"><span class="color-swatch" style="--swatch:${color.value}">${icon('check')}</span></label>`).join('')}</div></fieldset><div class="form-row"><div class="form-field"><label for="book-paper">Tipo de papel</label><div class="select-wrap"><select id="book-paper" name="paper">${Object.entries(PAPERS).map(([key, label]) => `<option value="${key}" ${current.paper === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><div class="form-field"><label for="book-capacity">Quantidade de páginas</label><input id="book-capacity" type="number" name="capacity" min="100" max="${max}" value="${current.capacity}" required><small>De 100 a ${max} neste caderno.</small></div></div><p class="privacy-note">${icon('info')} Crie quantos cadernos precisar. Cada caderno tem de 100 a 300 páginas; não há limite global de páginas.</p><p class="dialog-error" id="form-error" role="alert"></p><div class="dialog-actions">${book ? `<button type="button" class="button delete-notebook" id="delete-notebook" aria-label="Excluir caderno">${icon('trash')}<span>Excluir</span></button>` : ''}<button type="button" class="button button-outline" id="cancel-notebook">Cancelar</button><button class="button button-primary" type="submit">${book ? 'Salvar capa' : 'Criar caderno'}</button></div></form>`);
 $('#cancel-notebook').onclick = () => dialog.close();
 $('#notebook-form').onsubmit = event => {
  event.preventDefault();
  const data = new FormData(event.target);
  const capacity = +data.get('capacity'); const title = data.get('title').trim();
  if (!title) { $('#form-error').textContent = 'Dê um título ao seu caderno.'; return; }
  if (!Number.isInteger(capacity) || capacity < 100 || capacity > max) { $('#form-error').textContent = `Escolha de 100 a ${max} páginas.`; return; }
  if (book && Object.entries(book.pages).some(([number, page]) => +number > capacity && (pageHasContent(page) || page.starred))) { $('#form-error').textContent = 'Há anotações ou favoritas depois desse limite. Mantenha essas páginas para preservar o conteúdo.'; return; }
  savePageFromDOM();
  const projectId = data.get('projectId');
  if (!getProject(projectId)) { $('#form-error').textContent = 'Escolha um projeto válido.'; return; }
  const options = {title, projectId, subtitle: data.get('subtitle').trim(), color: data.get('color'), paper: data.get('paper'), capacity};
  if (book) Object.assign(book, options);
  else state.notebooks.push(makeNotebook(options));
  if (book) for (const key of Object.keys(book.pages)) if (+key > capacity) delete book.pages[key];
  const saved = persist(); dialog.close();
  if (book && activeBook === book.id) { const currentPage = Math.min(activePage, capacity); activeBook = null; location.hash = `/caderno/${book.id}/${currentPage}`; renderRoute(); }
  else renderRoute();
  if (saved) toast(book ? 'Capa atualizada. Ficou com a sua cara.' : 'Seu novo caderno está na mesa.');
 };
 if (book) $('#delete-notebook').onclick = () => confirmDialog('Tirar este caderno da mesa?', `O caderno “${book.title}” e todas as suas anotações serão excluídos. Baixe um backup antes se quiser guardar uma cópia.`, 'Excluir caderno', () => {
  const deletingCurrent = activeBook === book.id;
  activeBook = null;
  state.notebooks = state.notebooks.filter(notebook => notebook.id !== book.id);
  if (state.lastOpened?.notebookId === book.id) state.lastOpened = null;
  const saved = persist();
  if (deletingCurrent) location.hash = '/mesa';
  renderRoute();
  if (saved) toast('Caderno excluído. Agora há espaço para um novo começo.');
 });
}
function deskDialog() {
 const labels = {oak: 'Carvalho', walnut: 'Nogueira', light: 'Madeira clara'};
 openDialog('Sua mesa, do seu jeito.', `<p class="dialog-description">Um cenário para acompanhar suas ideias.</p><div class="desk-options">${Object.entries(labels).map(([key, label]) => `<button class="desk-option ${state.desk === key ? 'selected' : ''}" data-desk="${key}" aria-pressed="${state.desk === key}"><span class="desk-preview"></span>${label}</button>`).join('')}</div><div class="dialog-actions"><button class="button button-primary" id="done-desk">Pronto</button></div>`);
 $$('[data-desk]').forEach(btn => btn.onclick = () => { state.desk = btn.dataset.desk; persist(); $$('.desk-option').forEach(option => { option.classList.toggle('selected', option === btn); option.setAttribute('aria-pressed', String(option === btn)); }); const desk = $('.desk'); if (desk) desk.className = `desk ${state.desk}`; });
 $('#done-desk').onclick = () => dialog.close();
}
function helpDialog() {
 openDialog('Uma página de cada vez.', `<p class="dialog-description">Um espaço simples para estudar, planejar e guardar o que importa.</p><div class="help-steps"><div class="help-step">${icon('book')}<div><strong>Comece por um projeto</strong>Crie projetos como “Faculdade — CD” e organize os cadernos por matéria. Clique na pasta para abrir sua mesa. Não há limite global de cadernos ou páginas na pasta.</div></div><div class="help-step">${icon('edit')}<div><strong>Abra um caderno e escreva</strong>Crie títulos, formate o texto, navegue pelas páginas e marque suas favoritas. O salvamento é automático.</div></div><div class="help-step">${icon('search')}<div><strong>Reencontre suas ideias</strong>Use “Todas as notas” para buscar em todos os projetos e cadernos. No editor, a busca fica só no caderno aberto.</div></div><div class="help-step">${icon('download')}<div><strong>Leve suas anotações com você</strong>Baixe e importe backups no botão do topo. Você também pode imprimir uma página ou salvá-la como PDF.</div></div></div><p class="privacy-note">${icon('lock')} Clique em “Escolher pasta” e autorize a gravação. Aguarde “Salvo na pasta do computador” antes de fechar. Leve a pasta ou um backup para usar em outro aparelho. O login e a foto continuam na conta; os cadernos ficam no computador.</p><div class="dialog-actions"><button class="button button-primary" id="help-done">Hora de escrever</button></div>`);
 $('#help-done').onclick = () => dialog.close();
}
function downloadFile(content, filename, type) {
 const url = URL.createObjectURL(new Blob([content], {type}));
 const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportBackup() {
 savePageFromDOM(); persist();
 const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
 downloadFile(JSON.stringify(state, null, 2), `seu-caderno-backup-${today}.json`, 'application/json');
 toast('Backup preparado com todos os seus cadernos.');
}
function backupDialog() {
 savePageFromDOM(); persist();
 openDialog('Guarde uma cópia das suas ideias.', `<p class="dialog-description">Seu caderno vai junto, mesmo quando você muda de navegador.</p><div class="backup-options"><button class="backup-option" id="export-backup">${icon('download')}<span><strong>Baixar backup completo</strong><small>Todos os projetos, cadernos, capas e anotações em um arquivo JSON.</small></span></button><button class="backup-option" id="import-backup">${icon('upload')}<span><strong>Restaurar um backup</strong><small>Importe um arquivo exportado aqui. Você poderá revisar antes de substituir os cadernos atuais.</small></span></button></div><p class="privacy-note" style="margin-top:20px">${icon('lock')} O backup contém os projetos abertos agora. Restaurar substitui o conteúdo da pasta atual e salva uma cópia anterior. Nenhuma anotação é enviada à nuvem.</p>`);
 $('#export-backup').onclick = exportBackup;
 $('#import-backup').onclick = () => $('#import-file').click();
}
async function importBackup(event) {
 const file = event.target.files?.[0]; event.target.value = '';
 if (!file) return;
 try {
  const imported = validateState(JSON.parse(await file.text()));
  for (const book of imported.notebooks) for (const page of Object.values(book.pages)) page.html = sanitizedHTML(page.html);
  folders.reviewImport(imported, 'backup', folders.engine.owner, undefined, true);
 } catch (error) { toast(error instanceof SyntaxError ? 'Não foi possível ler o arquivo. Escolha um backup JSON válido.' : error.message, true); }
}

state = initialState();
main.inert = true;
$('#brand-icon').innerHTML = icon('book'); hydrateIcons();
applyTheme(document.documentElement.dataset.theme || systemTheme());
$('#theme-toggle').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
$('#help-button').onclick = helpDialog;
$('#backup-button').onclick = backupDialog;
$('#import-file').onchange = importBackup;
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
document.addEventListener('selectionchange', () => { const selection = window.getSelection(); const content = $('#page-content'); if (content && selection.rangeCount && content.contains(selection.anchorNode) && content.contains(selection.focusNode)) editorSelection = selection.getRangeAt(0).cloneRange(); });
window.addEventListener('hashchange', () => { editorSelection = null; renderRoute(); window.scrollTo({top: 0, behavior: 'instant'}); });
window.addEventListener('pagehide', () => { savePageFromDOM(); persist(); void folders?.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { savePageFromDOM(); persist(); void folders?.flush(); } });
window.addEventListener('beforeunload', event => { savePageFromDOM(); if (!persist() || folders?.dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => {
 if (event.key === THEME_KEY) { applyTheme(['dark', 'light'].includes(event.newValue) ? event.newValue : systemTheme()); return; }

});
document.addEventListener('keydown', event => {
 if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); savePageFromDOM(); persist(); void folders?.flush().then(saved => toast(saved ? folders.statusText() : 'Não foi possível salvar. Abra Minha pasta e baixe um backup.', !saved)); }
 if (event.key === 'Escape') closeSidebar();
});
function applyWorkspace(workspace) {
 activeBook = null; editorSelection = null;
 state = validateState(workspace); applyingExternalChange = true;
 try { renderRoute(); } finally { applyingExternalChange = false; }
}
folders = createFolderController({
 getWorkspace: () => state,
 getUser: () => accounts?.user,
 capture: () => { savePageFromDOM(); return persist(); },
 applyWorkspace,
 setLocked(locked) { main.inert = locked; main.classList.toggle('account-loading', locked); },
 onStatusChanged: setSaveStatus,
 download: downloadFile, openDialog, confirm: confirmDialog, notify: toast,
 importCloud: () => void accounts?.importCloud()
});
accounts = createAccountController({
 capture: () => { savePageFromDOM(); return persist(); },
 async beforeSwitch() {
  savePageFromDOM(); persist();
  if (folders.dirty && !await folders.flush()) {
   // The per-account emergency draft must finish before changing the owner.
   await folders.engine.draftWrite;
  }
 },
 setOwner: async owner => { applyWorkspace({version: 2, projects: [], notebooks: []}); await folders.start(owner); },
 flush: () => folders.dirty ? folders.flush() : Promise.resolve(true),
 openFolder: folders.open,
 reviewImport: folders.reviewImport,
 download: downloadFile, openDialog, notify: toast
});
renderRoute();
void accounts.start();
