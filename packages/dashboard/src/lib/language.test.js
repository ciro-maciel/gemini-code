// The panel in Portuguese or English (17/11/2026, from marketing/decks): the choice, the translator and the layer on the page.
import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import dictionary from './en.json';
import { installTranslation, languageFor, makeTranslator } from './language.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('qual idioma', () => {
  test('a escolha guardada vence o navegador', () => {
    expect(languageFor('pt', ['en-US'])).toBe('pt');
    expect(languageFor('en', ['pt-BR'])).toBe('en');
  });
  test('sem escolha, segue o navegador: português para pt-*, inglês para o resto', () => {
    expect(languageFor(null, ['pt-BR'])).toBe('pt');
    expect(languageFor(null, ['pt-PT'])).toBe('pt');
    expect(languageFor(null, ['ru-RU'])).toBe('en');
    expect(languageFor(null, ['en-US'])).toBe('en');
    expect(languageFor(null, [])).toBe('en');
  });
  test('um valor guardado estranho é ignorado', () =>
    expect(languageFor('fr', ['pt-BR'])).toBe('pt'));
});

describe('o tradutor', () => {
  const translate = makeTranslator({
    texts: { Exportar: 'Export', Temas: 'Themes' },
    patterns: {
      'Abrir {0}': 'Open {0}',
      'Excluir {0} cards': 'Delete {0} cards',
      '{0} cards': '{0} cards!',
    },
  });
  test('texto exato, mantendo os espaços em volta', () =>
    expect(translate('  Exportar ')).toBe('  Export '));
  test('modelo com valor', () =>
    expect(translate('Abrir Relatório')).toBe('Open Relatório'));
  test('o valor do modelo também é traduzido quando conhecido', () =>
    expect(translate('Abrir Temas')).toBe('Open Themes'));
  test('o modelo mais longo vence', () =>
    expect(translate('Excluir 3 cards')).toBe('Delete 3 cards'));
  test('modelo dentro de modelo', () => {
    const nested = makeTranslator({
      patterns: { 'Editado {0}': 'Edited {0}', 'há {0} dias': '{0} days ago' },
    });
    expect(nested('Editado há 15 dias')).toBe('Edited 15 days ago');
  });
  test('um modelo curto não engole a frase da pessoa', () => {
    const short = makeTranslator({ patterns: { '{0} passos': '{0} steps' } });
    expect(short('3 passos')).toBe('3 steps');
    expect(
      short(
        'Resultados do terceiro trimestre para o conselho: receita, margem e próximos passos',
      ),
    ).toBeNull();
  });
  test('{#n} só aceita número, data ou hora, nunca o título da pessoa', () => {
    const numbers = makeTranslator({
      patterns: {
        '{#0} de {#1}': '{#0} of {#1}',
        '{0} às {#1}': '{0} at {#1}',
      },
    });
    expect(numbers('7 de 99')).toBe('7 of 99');
    expect(numbers('1.284 de 2.000')).toBe('1.284 of 2.000');
    expect(numbers('Plano de vendas')).toBeNull();
    expect(numbers('Sun 11/15/2026 às 14:30')).toBe('Sun 11/15/2026 at 14:30');
    expect(numbers('Reunião às sextas')).toBeNull();
  });
  test('o valor com espaço em volta também é traduzido', () => {
    const spaced = makeTranslator({
      texts: { 'no plano grátis': 'on the Free plan' },
      patterns: { 'Restam {0} neste mês{1}.': '{0} left this month{1}.' },
    });
    expect(spaced('Restam 3 neste mês no plano grátis.')).toBe(
      '3 left this month on the Free plan.',
    );
  });
  test('linha com " · " traduz parte por parte e deixa o nome da pessoa', () => {
    const parts = makeTranslator({
      texts: { Carrossel: 'Carousel' },
      patterns: { '{#0} páginas': '{#0} pages', 'há {#0} h': '{#0} h ago' },
    });
    expect(parts('Carrossel · 6 páginas · há 15 h')).toBe(
      'Carousel · 6 pages · 15 h ago',
    );
    expect(parts('Minha marca · Carrossel')).toBe('Minha marca · Carousel');
    expect(parts('Minha marca · Outra coisa')).toBeNull();
  });
  test('dentro de um valor, um modelo curto não traduz o título da pessoa', () => {
    const nested = makeTranslator({
      patterns: {
        'Abrir {0}': 'Open {0}',
        'Capa {0}': 'Cover {0}',
        'há {0} dias': '{0} days ago',
        'Editado {0}': 'Edited {0}',
        ', no plano {0}': ', on the {0} plan',
        'Restam {0}{1}.': '{0} left{1}.',
      },
    });
    expect(
      makeTranslator(
        { patterns: { 'Abrir {0}': 'Open {0}', 'Capa {0}': 'Cover {0}' } },
        { isLabel: true },
      )('Abrir Capa H - Gerador de favicon'),
    ).toBe('Open Capa H - Gerador de favicon');
    expect(nested('Editado há 15 dias')).toBe('Edited 15 days ago');
    expect(nested('Restam 3, no plano Scale.')).toBe(
      '3 left, on the Scale plan.',
    );
    const counter = makeTranslator({
      patterns: {
        'Saldo de IA: {0}': 'AI balance: {0}',
        'IA {0}': 'AI {0}',
        '{#0} de {#1}': '{#0} of {#1}',
      },
    });
    expect(counter('Saldo de IA: IA 250 de 250')).toBe(
      'AI balance: AI 250 of 250',
    );
  });
  test('um modelo curto nunca traduz uma frase de quatro palavras ou mais', () => {
    const short = makeTranslator({
      patterns: { 'Plano {0}': '{0} plan', 'Abrir {0}': 'Open {0}' },
    });
    expect(
      short('Plano de marketing de lançamento de uma linha de cafés'),
    ).toBeNull();
    expect(short('Plano Scale')).toBe('Scale plan');
    expect(short('Abrir Relatório')).toBe('Open Relatório');
  });
  test('texto desconhecido fica como está (null)', () =>
    expect(translate('Um título que a pessoa escreveu')).toBeNull());
});

describe('o dicionário', () => {
  test('tem os textos do painel e dos pacotes da casa', () => {
    expect(Object.keys(dictionary.texts).length).toBeGreaterThan(400);
    expect(dictionary.texts['Cancelar']).toBeTruthy();
  });
  test('o rótulo bilíngue do seletor de idioma fica como está', () => {
    expect(
      makeTranslator(dictionary)('Idioma · Language') ?? 'Idioma · Language',
    ).toBe('Idioma · Language');
  });
  test('todo modelo traduzido guarda os mesmos {n}', () => {
    for (const [pt, en] of Object.entries(dictionary.patterns))
      expect([...en.matchAll(/\{#?\d+\}/g)].map((m) => m[0]).sort()).toEqual(
        [...pt.matchAll(/\{#?\d+\}/g)].map((m) => m[0]).sort(),
      );
  });
});

describe('a camada na página', () => {
  const page = (html) => {
    const window = new Window();
    Object.assign(globalThis, {
      document: window.document,
      NodeFilter: window.NodeFilter,
      MutationObserver: window.MutationObserver,
      HTMLInputElement: window.HTMLInputElement,
    });
    window.document.body.innerHTML = html;
    return window.document;
  };
  test('troca texto e atributos, e o que entra depois também', async () => {
    const doc = page(
      '<button title="Exportar">Exportar</button><input placeholder="Temas">',
    );
    const stop = installTranslation(
      { texts: { Exportar: 'Export', Temas: 'Themes' } },
      doc.body,
    );
    expect(doc.querySelector('button').textContent).toBe('Export');
    expect(doc.querySelector('button').getAttribute('title')).toBe('Export');
    const late = doc.createElement('span');
    late.textContent = 'Temas';
    doc.body.appendChild(late);
    await tick();
    expect(late.textContent).toBe('Themes');
    stop();
  });
  test('o placeholder de um campo é do produto e é traduzido; o que a pessoa digitou, não', () => {
    const doc = page('<input placeholder="Temas" value="Exportar">');
    const stop = installTranslation(
      { texts: { Exportar: 'Export', Temas: 'Themes' } },
      doc.body,
    );
    expect(doc.querySelector('input').getAttribute('placeholder')).toBe(
      'Themes',
    );
    expect(doc.querySelector('input').value).toBe('Exportar');
    stop();
  });
  test('nunca mexe no que a pessoa escreveu', async () => {
    const doc = page(
      '<div contenteditable="true">Exportar</div><textarea>Exportar</textarea><div class="dk-card"><p>Exportar</p></div><div data-no-translate>Exportar</div>',
    );
    const stop = installTranslation(
      { texts: { Exportar: 'Export' } },
      doc.body,
      { skip: '.dk-card' },
    );
    expect(doc.querySelector('[contenteditable]').textContent).toBe('Exportar');
    expect(doc.querySelector('textarea').value).toBe('Exportar');
    expect(doc.querySelector('.dk-card p').textContent).toBe('Exportar');
    expect(doc.querySelector('[data-no-translate]').textContent).toBe(
      'Exportar',
    );
    stop();
  });
  test('o rótulo escolhido num Select (input só de leitura) é traduzido; o que a pessoa digita, não', () => {
    const doc = page('<input readonly value="Conciso"><input value="Conciso">');
    const stop = installTranslation(
      { texts: { Conciso: 'Concise' } },
      doc.body,
    );
    const [select, typed] = doc.querySelectorAll('input');
    expect(select.value).toBe('Concise');
    select.value = 'Conciso';
    expect(select.value).toBe('Concise');
    typed.value = 'Conciso';
    expect(typed.value).toBe('Conciso');
    stop();
  });
  test('quando o React escreve o português de novo, a camada traduz de novo', async () => {
    const doc = page('<span>Exportar</span>');
    const stop = installTranslation(
      { texts: { Exportar: 'Export' } },
      doc.body,
    );
    const node = doc.querySelector('span').firstChild;
    node.nodeValue = 'Exportar';
    await tick();
    expect(node.nodeValue).toBe('Export');
    stop();
  });
});
