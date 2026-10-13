'use strict';

/* Движок новеллы: читает JSON-сцены, переключает изображения/музыку,
   хранит журнал и прогресс. Сюжет не хранится в этом файле. */
window.NovellEngine = (() => {
  const SAVE_KEY = 'soonStudioSaveV2';
  const HISTORY_KEY = 'soonStudioHistoryV2';
  const DEFAULTS = {
    menuBackground: 'asset/8af1803dbd606d5286d6960c2fc0f57a.jpg',
    menuCharacter: 'asset/b8135a157125ead7667bd8d68b1c01de.jpg',
    background: 'asset/a766e691dbff213e0347c0a7f3741729.jpg',
    character: 'asset/5b2b75e351246b90ebc8f47c457c58d8.jpg'
  };
  let scene = null;
  let scenePath = 'story/Act1/Scene01.json';
  let lineIndex = 0;
  let previous = [];
  let history = [];
  let flags = {};
  let lastBackground = DEFAULTS.background;
  let lastCharacter = DEFAULTS.character;
  let lastMusic = '';
  let onRender = () => {};
  let onEnd = () => {};

  function resolveAsset(path, kind) {
    if (!path) return '';
    if (path.startsWith('asset/') || path.startsWith('./') || path.startsWith('../') || path.startsWith('http')) return path;
    const value = path.replace(/^\/+/, '');
    if (kind === 'background') return `asset/Background/${value}`;
    if (kind === 'music') return `asset/Music/${value}`;
    if (kind === 'character') {
      const parts = value.split('.');
      if (parts.length >= 2) return `asset/Chacter/${parts[0]}/${parts.slice(1).join('.')}.png`;
      return `asset/Chacter/${value}`;
    }
    return value;
  }

  async function loadScene(path, startAt = 0) {
    scenePath = path;
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      scene = await response.json();
      lineIndex = Math.max(0, Math.min(startAt, (scene.dialogue || []).length - 1));
      previous = [];
      render();
      return true;
    } catch (error) {
      console.error('Не удалось загрузить сцену:', path, error);
      scene = demoScene();
      scenePath = 'demo';
      lineIndex = 0;
      render();
      return false;
    }
  }

  function demoScene() {
    return {
      title: 'Первая встреча', chapter: 'ГЛАВА 01',
      dialogue: [
        { speaker: '', text: 'Вечер медленно растворяется в холодных огнях улицы. Ты останавливаешься, заметив впереди незнакомый силуэт.', background: DEFAULTS.background, character: DEFAULTS.character },
        { speaker: 'Алекс', text: 'Я уже начал думать, что ты не придёшь.', background: DEFAULTS.background, character: DEFAULTS.character },
        { speaker: 'Незнакомец', text: 'Я обещал, что буду здесь.', character: 'Stranger.Shadow' },
        { speaker: 'Алекс', text: 'Тогда скажи мне хотя бы одно: почему именно я?', character: 'Alex.Neutral', choices: [
          { text: '«Потому что я тебе доверяю».', effects: { trust: 1 }, next: 'continue' },
          { text: '«Я сам хочу это узнать».', effects: { trust: 0 }, next: 'continue' },
          { text: 'Промолчать.', effects: { trust: -1 }, next: 'continue' }
        ] },
        { speaker: 'Незнакомец', text: 'Похоже, эта история только начинается.', character: 'Stranger.Shadow', end: true }
      ]
    };
  }

  function current() { return scene?.dialogue?.[lineIndex] || null; }

  function render() {
    const item = current();
    if (!item) return onEnd();
    if (item.background) lastBackground = resolveAsset(item.background, 'background');
    if (item.character) lastCharacter = resolveAsset(item.character, 'character');
    if (item.music) lastMusic = resolveAsset(item.music, 'music');
    if (item.effects) Object.entries(item.effects).forEach(([key, value]) => { flags[key] = (flags[key] || 0) + value; });
    onRender({
      item, scene, lineIndex, total: scene.dialogue.length,
      background: lastBackground, character: lastCharacter, music: lastMusic,
      choices: item.choices || [], path: scenePath
    });
    if (item.speaker || item.text) {
      const entry = { speaker: item.speaker || '', text: item.text || '' };
      const last = history[history.length - 1];
      if (!last || last.text !== entry.text || last.speaker !== entry.speaker) history.push(entry);
      if (history.length > 250) history.shift();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
    saveProgress(false);
  }

  function next() {
    const item = current();
    if (!item || item.choices?.length) return;
    if (item.end || lineIndex >= scene.dialogue.length - 1) return onEnd();
    previous.push(lineIndex);
    lineIndex++;
    render();
  }
  function back() {
    if (!previous.length) return false;
    lineIndex = previous.pop();
    render();
    return true;
  }
  function choose(choice) {
    if (choice.effects) Object.entries(choice.effects).forEach(([key, value]) => { flags[key] = (flags[key] || 0) + value; });
    if (choice.next && choice.next !== 'continue') {
      const nextPath = choice.next.endsWith('.json') ? choice.next : `story/Act1/${choice.next}.json`;
      loadScene(nextPath);
    } else {
      nextChoiceLine();
    }
  }
  function nextChoiceLine() {
    if (lineIndex < scene.dialogue.length - 1) { previous.push(lineIndex); lineIndex++; render(); }
    else onEnd();
  }
  function saveProgress(showMessage = true) {
    if (!scene) return;
    const data = { scenePath, lineIndex, history, flags, lastBackground, lastCharacter, lastMusic, savedAt: Date.now() };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (_) {}
    if (showMessage) return true;
  }
  async function loadProgress() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!data) return false;
      history = data.history || [];
      flags = data.flags || {};
      lastBackground = data.lastBackground || DEFAULTS.background;
      lastCharacter = data.lastCharacter || DEFAULTS.character;
      lastMusic = data.lastMusic || '';
      return await loadScene(data.scenePath || 'story/Act1/Scene01.json', data.lineIndex || 0);
    } catch (_) { return false; }
  }
  function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  function clearSave() { localStorage.removeItem(SAVE_KEY); }
  function getHistory() { return history.slice(); }
  function setHistory(items) { history = items || []; }
  function setHandlers(renderHandler, endHandler) { onRender = renderHandler; onEnd = endHandler; }
  function getState() { return { scenePath, lineIndex, scene, flags: { ...flags } }; }
  return { loadScene, next, back, choose, saveProgress, loadProgress, hasSave, clearSave, getHistory, setHistory, setHandlers, getState, defaults: DEFAULTS };
})();
