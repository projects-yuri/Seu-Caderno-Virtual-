import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, makeNotebook, makeProject, projectNotebooks, moveNotebook, removeProject, validateState, totalCapacity, canAddNotebook, usedPages, loadState, saveState, plainText, STORAGE_KEY, DEFAULT_PROJECT_ID} from '../dist/storage.js';

test('a primeira mesa oferece três cadernos de 100 páginas e IDs únicos', () => {
 const state = initialState();
 assert.equal(state.notebooks.length, 3);
 assert.equal(totalCapacity(state), 300);
 assert.equal(new Set(state.notebooks.map(book => book.id)).size, 3);
 assert.equal(canAddNotebook(state), false);
 assert.deepEqual(validateState(state), state);
});
test('um novo caderno precisa respeitar ambos os limites', () => {
 const state = initialState(); state.notebooks.pop();
 assert.equal(canAddNotebook(state), true);
 assert.equal(canAddNotebook(state, 101), false);
 state.notebooks[0].capacity = 200;
 assert.equal(canAddNotebook(state), false);
 state.notebooks.pop();
 assert.equal(canAddNotebook(state), true);
 state.notebooks = [makeNotebook({capacity: 300})];
 assert.equal(canAddNotebook(state), false);
});
test('o backup rejeita um quarto caderno e mais de 300 páginas', () => {
 const fourth = initialState(); fourth.notebooks.push(makeNotebook());
 assert.throws(() => validateState(fourth));
 const tooManyPages = initialState(); tooManyPages.notebooks[0].capacity = 101;
 assert.throws(() => validateState(tooManyPages), /300/);
});
test('o backup rejeita páginas fora do caderno, IDs duplicados e protótipos como cores', () => {
 const invalidPage = initialState();
 invalidPage.notebooks[0].pages['101'] = {title: 'Fora', html: '', updatedAt: new Date().toISOString()};
 assert.throws(() => validateState(invalidPage));
 const duplicated = initialState(); duplicated.notebooks[1].id = duplicated.notebooks[0].id;
 assert.throws(() => validateState(duplicated));
 const invalidColor = initialState(); invalidColor.notebooks[0].color = '__proto__';
 assert.throws(() => validateState(invalidColor));
});
test('salvar e carregar preserva anotações, capas e a última página', () => {
 const state = initialState(); const book = state.notebooks[0];
 book.title = 'Estatística'; book.subtitle = 'FATEC'; book.paper = 'dotted';
 book.pages['100'] = {title: 'Probabilidade', html: '<p>P(A) = 0,5</p>', updatedAt: '2026-11-21T20:00:00.000Z', starred: true};
 state.lastOpened = {notebookId: book.id, page: 100};
 const data = new Map(); const storage = {setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) || null};
 saveState(state, storage);
 assert.deepEqual(loadState(storage), state);
 assert.equal(usedPages(book), 1);
});
test('páginas vazias não contam como usadas e falhas de armazenamento são propagadas', () => {
 const state = initialState();
 state.notebooks[0].pages['1'] = {title: '', html: '<p><br></p>', updatedAt: new Date().toISOString(), starred: false};
 assert.equal(usedPages(state.notebooks[0]), 0);
 assert.throws(() => saveState(state, {setItem() { throw new Error('quota'); }}), /quota/);
 assert.equal(plainText('<p>Olá &amp; bem-vindo</p>'), 'Olá & bem-vindo\n');
});
test('capacidades de 100 a 300 e uma mesa vazia são recuperáveis', () => {
 const state = initialState(); state.notebooks = [makeNotebook({capacity: 300})];
 assert.equal(validateState(state).notebooks[0].capacity, 300);
 state.notebooks = [];
 assert.equal(validateState(state).notebooks.length, 0);
 assert.equal(canAddNotebook(state, 300), true);
});

test('projetos agrupam os cadernos sem alterar os limites globais', () => {
 const state = initialState();
 const college = makeProject({title: 'Faculdade — CD'}); state.projects.push(college);
 moveNotebook(state, state.notebooks[0].id, college.id);
 assert.equal(projectNotebooks(state, college.id).length, 1);
 assert.equal(projectNotebooks(state, DEFAULT_PROJECT_ID).length, 2);
 assert.equal(totalCapacity(state), 300);
 assert.equal(canAddNotebook(state), false);
 assert.deepEqual(validateState(state), state);
});
test('mover um caderno preserva todas as páginas, favoritos e o título', () => {
 const state = initialState(); const target = makeProject({title: 'Projetos de trabalho'}); state.projects.push(target);
 const book = state.notebooks[0];
 book.pages[42] = {title: 'Anotação importante', html: '<p>Não perder.</p>', updatedAt: new Date().toISOString(), starred: true};
 const before = structuredClone(book);
 moveNotebook(state, book.id, target.id);
 assert.deepEqual(book, {...before, projectId: target.id});
 assert.equal(usedPages(book), 1);
});
test('um destino inválido não altera o caderno', () => {
 const state = initialState(); const before = structuredClone(state);
 assert.throws(() => moveNotebook(state, state.notebooks[0].id, 'inexistente'));
 assert.deepEqual(state, before);
});
test('excluir projeto com cadernos é bloqueado e não apaga anotações', () => {
 const state = initialState(); const before = structuredClone(state);
 assert.throws(() => removeProject(state, DEFAULT_PROJECT_ID), /Mova os cadernos/);
 assert.deepEqual(state, before);
});
test('um projeto vazio pode ser excluído e a seleção é corrigida', () => {
 const state = initialState(); const empty = makeProject(); state.projects.push(empty); state.activeProjectId = empty.id;
 removeProject(state, empty.id);
 assert.equal(state.projects.length, 1);
 assert.equal(state.activeProjectId, DEFAULT_PROJECT_ID);
 assert.deepEqual(validateState(state), state);
});
test('backups antigos recebem um projeto sem perder as anotações', () => {
 const old = initialState(); old.version = 1; delete old.projects; delete old.activeProjectId;
 for (const book of old.notebooks) delete book.projectId;
 old.notebooks[1].pages[100] = {title: 'Minha matéria', html: '<p>Conteúdo antigo</p>', updatedAt: '2026-11-21T21:00:00.000Z', starred: true};
 const preserved = structuredClone(old.notebooks);
 const migrated = validateState(old);
 assert.equal(migrated.version, 2); assert.equal(migrated.projects.length, 1);
 assert.deepEqual(migrated.notebooks.map(({projectId, ...book}) => book), preserved);
 assert.ok(migrated.notebooks.every(book => book.projectId === migrated.projects[0].id));
 const storage = {getItem: key => key === STORAGE_KEY ? JSON.stringify(old) : null};
 assert.deepEqual(loadState(storage), migrated);
});
test('backups rejeitam projetos duplicados e cadernos sem projeto', () => {
 const duplicate = initialState(); duplicate.projects.push({...duplicate.projects[0]});
 assert.throws(() => validateState(duplicate), /projeto/);
 const orphan = initialState(); orphan.notebooks[0].projectId = 'não-existe';
 assert.throws(() => validateState(orphan), /projeto/);
});
test('backup com dois projetos preserva a relação com as matérias e o projeto aberto', () => {
 const state = initialState(); const college = makeProject({title: 'Faculdade — CD', subtitle: 'Ciência de Dados'}); state.projects.push(college);
 state.notebooks[0].title = 'Estatística'; moveNotebook(state, state.notebooks[0].id, college.id); state.activeProjectId = college.id;
 const memory = new Map(); const storage = {setItem: (key, value) => memory.set(key, value), getItem: key => memory.get(key) || null};
 saveState(state, storage); assert.deepEqual(loadState(storage), state);
});
