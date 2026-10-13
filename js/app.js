'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const ui = {
    splash: $('splash'), menu: $('mainMenu'), game: $('gameScreen'), bg: $('sceneBackground'),
    character: $('sceneCharacter'), speaker: $('speakerName'), text: $('dialogueText'), choices: $('choices'),
    nextArea: $('nextArea'), auto: $('autoBtn'), hint: $('tapHint'), menuOverlay: $('gameMenu'),
    modalLayer: $('modalLayer'), modalContent: $('modalContent'), music: $('musicPlayer')
  };
  const engine = window.NovellEngine;
  let auto = false, autoTimer = null, activeScreen = 'menu';
  const settingsKey = 'soonStudioSettingsV2';
  let settings = { music: true, textSpeed: 'normal' };

  function showScreen(name) {
    activeScreen = name;
    ui.menu.classList.toggle('hidden', name !== 'menu');
    ui.game.classList.toggle('hidden', name !== 'game');
  }
  function startGame() {
    showScreen('game');
    engine.loadScene('story/Act1/Scene01.json');
  }
  function safeImage(img, src, fallback) {
    if (!src) { img.classList.remove('visible'); return; }
    img.onerror = () => {
      img.onerror = null;
      if (img.src !== new URL(fallback, location.href).href) img.src = fallback;
      else img.classList.remove('visible');
    };
    img.onload = () => img.classList.add('visible');
    img.src = src;
  }
  function render(data) {
    safeImage(ui.bg, data.background, engine.defaults.background);
    safeImage(ui.character, data.character, engine.defaults.character);
    $('chapterLabel').textContent = data.scene.chapter || 'ГЛАВА 01';
    $('sceneLabel').textContent = data.scene.title || 'БЕЗ НАЗВАНИЯ';
    ui.speaker.textContent = data.item.speaker || '';
    ui.speaker.classList.toggle('empty', !data.item.speaker);
    ui.text.textContent = data.item.text || '';
    $('lineProgress').style.width = `${Math.min(100, ((data.lineIndex + 1) / data.total) * 100)}%`;
    ui.choices.replaceChildren();
    const hasChoices = data.choices.length > 0;
    ui.choices.classList.toggle('hidden', !hasChoices);
    ui.hint.classList.toggle('hidden', hasChoices);
    ui.nextArea.classList.toggle('hidden', hasChoices);
    if (hasChoices) data.choices.forEach((choice, i) => {
      const button = document.createElement('button');
      button.className = 'choice-option';
      const number = document.createElement('span'); number.className = 'choice-number'; number.textContent = `0${i + 1}`;
      const label = document.createElement('span'); label.className = 'choice-label'; label.textContent = choice.text;
      const arrow = document.createElement('span'); arrow.className = 'choice-arrow'; arrow.textContent = '↗';
      button.append(number, label, arrow);
      button.addEventListener('click', event => { event.stopPropagation(); engine.choose(choice); });
      ui.choices.append(button);
    });
    if (data.music && settings.music) {
      if (ui.music.getAttribute('src') !== data.music) { ui.music.src = data.music; ui.music.play().catch(() => {}); }
    } else if (!settings.music) ui.music.pause();
  }
  function stopAuto() { auto = false; clearTimeout(autoTimer); ui.auto.classList.remove('active'); }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (!auto || activeScreen !== 'game' || ui.menuOverlay.classList.contains('hidden') === false) return;
    autoTimer = setTimeout(() => { engine.next(); if (auto) scheduleAuto(); }, settings.textSpeed === 'fast' ? 1700 : 3200);
  }
  function toggleAuto() {
    auto = !auto; ui.auto.classList.toggle('active', auto);
    if (auto) scheduleAuto(); else clearTimeout(autoTimer);
  }
  function advance() { if (activeScreen !== 'game' || !ui.menuOverlay.classList.contains('hidden')) return; engine.next(); if (auto) scheduleAuto(); }
  function openModal(content) { ui.modalContent.innerHTML = ''; ui.modalContent.append(content); ui.modalLayer.classList.remove('hidden'); }
  function closeModal() { ui.modalLayer.classList.add('hidden'); }
  function heading(kicker, title, desc) {
    const wrap = document.createElement('div'); wrap.className = 'modal-view';
    const small = document.createElement('div'); small.className = 'overlay-kicker'; small.textContent = kicker;
    const h = document.createElement('h2'); h.textContent = title;
    wrap.append(small, h);
    if (desc) { const p = document.createElement('p'); p.className = 'overlay-description'; p.textContent = desc; wrap.append(p); }
    return wrap;
  }
  function openHistory() {
    const wrap = heading('АРХИВ', 'История диалогов', 'Реплики, которые уже прозвучали.');
    const list = document.createElement('div'); list.className = 'history-list';
    const entries = engine.getHistory();
    if (!entries.length) { const p = document.createElement('p'); p.className = 'empty-state'; p.textContent = 'Здесь пока тихо.'; list.append(p); }
    entries.slice().reverse().forEach(entry => {
      const card = document.createElement('article'); card.className = 'history-entry';
      if (entry.speaker) { const name = document.createElement('strong'); name.textContent = entry.speaker; card.append(name); }
      const text = document.createElement('p'); text.textContent = entry.text; card.append(text); list.append(card);
    });
    wrap.append(list); openModal(wrap);
  }
  function openSettings() {
    const wrap = heading('ПЕРСОНАЛИЗАЦИЯ', 'Настройки', 'Настрой игру под себя.');
    const musicRow = document.createElement('label'); musicRow.className = 'setting-row';
    const musicText = document.createElement('span'); musicText.textContent = 'Музыка';
    const music = document.createElement('input'); music.type = 'checkbox'; music.checked = settings.music;
    music.addEventListener('change', () => { settings.music = music.checked; if (!settings.music) ui.music.pause(); else if (ui.music.src) ui.music.play().catch(() => {}); localStorage.setItem(settingsKey, JSON.stringify(settings)); });
    musicRow.append(musicText, music); wrap.append(musicRow);
    const speedRow = document.createElement('label'); speedRow.className = 'setting-row';
    const speedText = document.createElement('span'); speedText.textContent = 'Скорость авто';
    const select = document.createElement('select');
    [['normal','Обычная'],['fast','Быстрая']].forEach(([v,t]) => { const o = document.createElement('option'); o.value=v; o.textContent=t; select.append(o); });
    select.value = settings.textSpeed; select.addEventListener('change', () => { settings.textSpeed = select.value; localStorage.setItem(settingsKey, JSON.stringify(settings)); });
    speedRow.append(speedText, select); wrap.append(speedRow);
    openModal(wrap);
  }
  function openSaves(mode) {
    const wrap = heading('ЛОКАЛЬНЫЕ ДАННЫЕ', mode === 'save' ? 'Сохранить игру' : 'Продолжить историю', 'Прогресс хранится на этом устройстве.');
    const card = document.createElement('div'); card.className = 'save-card';
    const status = document.createElement('div'); status.className = 'save-status'; status.textContent = engine.hasSave() ? '● Найдено сохранение' : '○ Сохранений пока нет'; card.append(status);
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    if (mode === 'save') {
      const save = document.createElement('button'); save.className = 'modal-primary'; save.textContent = 'Сохранить сейчас';
      save.addEventListener('click', () => { engine.saveProgress(true); status.textContent = '✓ Прогресс сохранён'; }); actions.append(save);
    } else {
      const load = document.createElement('button'); load.className = 'modal-primary'; load.textContent = 'Загрузить сохранение'; load.disabled = !engine.hasSave();
      load.addEventListener('click', async () => { closeModal(); showScreen('game'); await engine.loadProgress(); }); actions.append(load);
    }
    const cancel = document.createElement('button'); cancel.className = 'modal-secondary'; cancel.textContent = 'Закрыть'; cancel.addEventListener('click', closeModal); actions.append(cancel);
    card.append(actions); wrap.append(card); openModal(wrap);
  }
  function openAbout() {
    const wrap = heading('SOON… STUDIO', 'История начинается здесь', 'Небольшая визуальная новелла. Это ранняя демоверсия: новые сцены, персонажи и музыка будут добавляться отдельно от игрового движка.');
    const note = document.createElement('p'); note.className = 'about-note'; note.textContent = 'Все сюжетные сцены хранятся в папке story, а изображения и музыка — в asset.'; wrap.append(note); openModal(wrap);
  }
  function backToMenu() { stopAuto(); ui.menuOverlay.classList.add('hidden'); closeModal(); showScreen('menu'); }

  engine.setHandlers(render, () => {
    stopAuto();
    const wrap = heading('КОНЕЦ ФРАГМЕНТА', 'Продолжение следует', 'Это конец текущего фрагмента демоверсии.');
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    const menu = document.createElement('button'); menu.className = 'modal-primary'; menu.textContent = 'В главное меню'; menu.addEventListener('click', backToMenu);
    const again = document.createElement('button'); again.className = 'modal-secondary'; again.textContent = 'Прочитать снова'; again.addEventListener('click', () => { closeModal(); startGame(); });
    actions.append(menu, again); wrap.append(actions); openModal(wrap);
  });

  $('newGameBtn').addEventListener('click', () => { engine.clearSave(); startGame(); });
  $('continueBtn').addEventListener('click', async () => { showScreen('game'); if (!await engine.loadProgress()) startGame(); });
  $('loadBtn').addEventListener('click', () => openSaves('load'));
  $('settingsBtn').addEventListener('click', openSettings);
  $('creditsBtn').addEventListener('click', openAbout);
  $('logsMenuBtn').addEventListener('click', openHistory);
  $('nextArea').addEventListener('click', advance);
  $('backBtn').addEventListener('click', () => engine.back());
  $('logsBtn').addEventListener('click', openHistory);
  ui.auto.addEventListener('click', toggleAuto);
  $('gameMenuBtn').addEventListener('click', () => { stopAuto(); ui.menuOverlay.classList.remove('hidden'); });
  $('resumeBtn').addEventListener('click', () => ui.menuOverlay.classList.add('hidden'));
  $('saveBtn').addEventListener('click', () => openSaves('save'));
  $('gameLoadBtn').addEventListener('click', () => openSaves('load'));
  $('gameSettingsBtn').addEventListener('click', openSettings);
  $('mainMenuBtn').addEventListener('click', backToMenu);
  document.querySelectorAll('[data-close-menu]').forEach(el => el.addEventListener('click', () => ui.menuOverlay.classList.add('hidden')));
  $('closeModalBtn').addEventListener('click', closeModal);
  ui.modalLayer.addEventListener('click', e => { if (e.target === ui.modalLayer) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!ui.modalLayer.classList.contains('hidden')) closeModal(); else if (!ui.menuOverlay.classList.contains('hidden')) ui.menuOverlay.classList.add('hidden'); else if (activeScreen === 'game') { stopAuto(); ui.menuOverlay.classList.remove('hidden'); } }
    if (e.key === ' ' || e.key === 'Enter') { if (activeScreen === 'game' && ui.modalLayer.classList.contains('hidden') && ui.menuOverlay.classList.contains('hidden')) { e.preventDefault(); advance(); } }
  });
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem(settingsKey) || '{}') }; } catch (_) {}
  $('continueBtn').disabled = !engine.hasSave();
  setTimeout(() => { ui.splash.classList.add('fade-out'); setTimeout(() => { ui.splash.classList.add('hidden'); showScreen('menu'); }, 850); }, 1400);
})();
