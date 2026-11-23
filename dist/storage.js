export const STORAGE_KEY = 'seu-caderno-virtual:v1';
// The folder owns the workspace; there is no global notebook or page quota.
// Keep a per-notebook bound for the page navigation UI.
export const MAX_PAGES = 300;
export const DEFAULT_PROJECT_ID = 'projeto-pessoal';
export const COLORS = {
 forest: {name: 'Verde floresta', value: '#456456', light: '#e5ece6'},
 denim: {name: 'Azul denim', value: '#4c6278', light: '#e5eaf0'},
 terracotta: {name: 'Terracota', value: '#ad6c50', light: '#f3e7de'},
 plum: {name: 'Ameixa', value: '#76566e', light: '#efe5ec'},
 charcoal: {name: 'Grafite', value: '#515454', light: '#e8e9e7'},
 mustard: {name: 'Mostarda', value: '#aa8846', light: '#f4eddb'}
};
export const PAPERS = {lined: 'Pautado', dotted: 'Pontilhado', blank: 'Sem pauta'};
export function newId() { return globalThis.crypto?.randomUUID?.() || `caderno-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function makeNotebook(options = {}) {
 return {id: newId(), projectId: DEFAULT_PROJECT_ID, title: 'Novo caderno', subtitle: 'Um novo começo', color: 'forest', paper: 'lined', capacity: 100, pages: {}, ...options};
}
export function makeProject(options = {}) { return {id: newId(), title: 'Novo projeto', subtitle: '', color: 'forest', ...options}; }
export function projectNotebooks(state, projectId) { return state.notebooks.filter(book => book.projectId === projectId); }
export function moveNotebook(state, notebookId, projectId) {
 const book = state.notebooks.find(item => item.id === notebookId);
 if (!book || !state.projects.some(project => project.id === projectId)) throw new Error('Escolha um caderno e um projeto válidos.');
 book.projectId = projectId;
 return book;
}
export function removeProject(state, projectId) {
 if (!state.projects.some(project => project.id === projectId)) throw new Error('Projeto não encontrado.');
 if (projectNotebooks(state, projectId).length) throw new Error('Mova os cadernos para outro projeto antes de excluir este projeto.');
 state.projects = state.projects.filter(project => project.id !== projectId);
 if (state.activeProjectId === projectId) state.activeProjectId = state.projects[0]?.id || null;
}
export function initialState() {
 return {version: 2, desk: 'oak', lastOpened: null, activeProjectId: DEFAULT_PROJECT_ID, projects: [makeProject({id: DEFAULT_PROJECT_ID, title: 'Meu primeiro projeto', subtitle: 'Estudos, planos e ideias no seu lugar'})], notebooks: [
  makeNotebook({title: 'Meus estudos', subtitle: 'Um pouco mais a cada dia', color: 'forest'}),
  makeNotebook({title: 'Ideias & projetos', subtitle: 'Tudo começa com uma ideia', color: 'denim', paper: 'dotted'}),
  makeNotebook({title: 'Dia a dia', subtitle: 'As pequenas coisas importam', color: 'terracotta'})
 ]};
}
export function totalCapacity(state) { return state.notebooks.reduce((sum, book) => sum + book.capacity, 0); }
export function pageHasContent(page) { return !!(page && (page.title.trim() || plainText(page.html).trim())); }
export function plainText(html = '') {
 return html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
export function usedPages(book) { return Object.values(book.pages).filter(pageHasContent).length; }
export function canAddNotebook(state, capacity = 100) { return Number.isInteger(capacity) && capacity >= 100 && capacity <= MAX_PAGES; }
export function validateState(input) {
 if (!input || ![1, 2].includes(input.version) || !Array.isArray(input.notebooks)) throw new Error('Este arquivo não é um backup válido do Seu Caderno Virtual.');
 // Backups from the first prototype gain one project without changing their notes.
 if (input.version === 1) input = {...input, version: 2, projects: [makeProject({id: DEFAULT_PROJECT_ID, title: 'Meus cadernos', subtitle: 'Anotações do primeiro protótipo'})], activeProjectId: DEFAULT_PROJECT_ID, notebooks: input.notebooks.map(book => ({...book, projectId: DEFAULT_PROJECT_ID}))};
 if (!Array.isArray(input.projects)) throw new Error('Os projetos deste backup são inválidos.');
 const projectIds = new Set();
 const projects = input.projects.map(project => {
  if (!project || typeof project.id !== 'string' || !/^[\w-]{1,90}$/.test(project.id) || projectIds.has(project.id) || typeof project.title !== 'string' || !project.title.trim() || project.title.length > 60 || typeof project.subtitle !== 'string' || project.subtitle.length > 100 || !Object.hasOwn(COLORS, project.color)) throw new Error('O backup contém um projeto inválido.');
  projectIds.add(project.id);
  return {id: project.id, title: project.title.trim(), subtitle: project.subtitle, color: project.color};
 });
 const ids = new Set();
 const notebooks = input.notebooks.map(book => {
  if (!book || typeof book.id !== 'string' || !/^[\w-]{1,90}$/.test(book.id) || ids.has(book.id) || !projectIds.has(book.projectId)) throw new Error('O backup contém um caderno ou projeto inválido.');
  ids.add(book.id);
  if (typeof book.title !== 'string' || !book.title.trim() || book.title.length > 60 || typeof book.subtitle !== 'string' || book.subtitle.length > 100 || !Object.hasOwn(COLORS, book.color) || !Object.hasOwn(PAPERS, book.paper) || !Number.isInteger(book.capacity) || book.capacity < 100 || book.capacity > MAX_PAGES) throw new Error('Os dados de um dos cadernos são inválidos.');
  if (!book.pages || typeof book.pages !== 'object' || Array.isArray(book.pages)) throw new Error('As páginas deste backup são inválidas.');
  const pages = {};
  for (const [key, page] of Object.entries(book.pages)) {
   if (!/^[1-9]\d*$/.test(key) || +key > book.capacity || !page || typeof page.title !== 'string' || page.title.length > 150 || typeof page.html !== 'string' || page.html.length > 250000 || typeof page.updatedAt !== 'string' || !Number.isFinite(Date.parse(page.updatedAt))) throw new Error('O backup contém uma página inválida.');
   pages[key] = {title: page.title, html: page.html, updatedAt: page.updatedAt, starred: page.starred === true};
  }
  return {id: book.id, projectId: book.projectId, title: book.title.trim(), subtitle: book.subtitle, color: book.color, paper: book.paper, capacity: book.capacity, pages};
 });
 const result = {version: 2, desk: ['oak', 'walnut', 'light'].includes(input.desk) ? input.desk : 'oak', lastOpened: null, activeProjectId: projectIds.has(input.activeProjectId) ? input.activeProjectId : projects[0]?.id || null, projects, notebooks};
 const last = input.lastOpened;
 if (last && notebooks.some(b => b.id === last.notebookId && Number.isInteger(last.page) && last.page >= 1 && last.page <= b.capacity)) result.lastOpened = {notebookId: last.notebookId, page: last.page};
 return result;
}
export function loadState(storage = globalThis.localStorage) {
 const raw = storage.getItem(STORAGE_KEY);
 return raw ? validateState(JSON.parse(raw)) : initialState();
}
export function saveState(state, storage = globalThis.localStorage) { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
