
"use strict";

/* =========================================
   НАСТРОЙКИ И ИЗОБРАЖЕНИЯ
========================================= */

const IMAGES = {
  menu: "asset/8af1803dbd606d5286d6960c2fc0f57a.jpg",
  menuCharacter: "asset/b8135a157125ead7667bd8d68b1c01de.jpg",
  background: "asset/a766e691dbff213e0347c0a7f3741729.jpg",
  character: "asset/5b2b75e351246b90ebc8f47c457c58d8.jpg"
};

const SAVE_KEY = "soonStudioSaves";
const SETTINGS_KEY = "soonStudioSettings";
const AUTO_KEY = "soonStudioAutosave";
const SLOT_COUNT = 60;
const SLOTS_PER_PAGE = 6;

/* =========================================
   ЭЛЕМЕНТЫ СТРАНИЦЫ
========================================= */

const $ = (id) => document.getElementById(id);

const splash = $("splash");
const mainMenu = $("mainMenu");
const gameScreen = $("gameScreen");
const gameMenu = $("gameMenu");
const modalLayer = $("modalLayer");
const modalContent = $("modalContent");

const sceneBackground = $("sceneBackground");
const sceneCharacter = $("sceneCharacter");
const speakerName = $("speakerName");
const dialogueText = $("dialogueText");
const choicesElement = $("choices");

const continueBtn = $("continueBtn");
const autoBtn = $("autoBtn");

let currentNodeId = "start";
let gameStarted = false;
let autoEnabled = false;
let autoTimer = null;
let savePage = 0;
let saveMode = "load";
let gameMenuWasOpen = false;

let historyStack = [];
let logs = [];
let affinity = 0;
let endingReached = false;

let settings = {
  language: "ru",
  sound: true,
  music: true
};

/* =========================================
   ДЕМО-СЮЖЕТ
========================================= */

const story = {
  start: {
    speaker: "",
    text: "Вечер. Ты оказываешься в незнакомом месте. Вокруг тихо, а впереди виднеется силуэт человека.",
    next: "stranger"
  },

  stranger: {
    speaker: "Незнакомец",
    text: "Наконец-то. Я уже думал, что ты не придёшь.",
    next: "question"
  },

  question: {
    speaker: "Незнакомец",
    text: "Скажи, ты вообще понимаешь, где находишься?",
    choices: [
      {
        text: "«Нет. Объясни мне»",
        next: "honest",
        change: 1,
        result: "Ты решил не скрывать правду."
      },
      {
        text: "«Кажется, понимаю»",
        next: "confident",
        change: -1,
        result: "Ты попытался выглядеть увереннее."
      },
      {
        text: "Промолчать",
        next: "silent",
        change: 0,
        result: "Ты предпочёл пока ничего не говорить."
      }
    ]
  },

  honest: {
    speaker: "Незнакомец",
    text: "Хорошо. По крайней мере, ты не пытаешься меня обмануть.",
    next: "explain"
  },

  confident: {
    speaker: "Незнакомец",
    text: "Правда? Тогда объясни, что это за место.",
    next: "explain"
  },

  silent: {
    speaker: "Незнакомец",
    text: "Молчание тоже ответ. Но долго так продолжаться не может.",
    next: "explain"
  },

  explain: {
    speaker: "Незнакомец",
    text: "Тебе придётся мне довериться. Сейчас это единственный способ разобраться в происходящем.",
    next: "trustQuestion"
  },

  trustQuestion: {
    speaker: "",
    text: "Ты не знаешь этого человека. Но, кажется, другого выхода нет.",
    choices: [
      {
        text: "Согласиться пойти с ним",
        next: "trust",
        change: 2,
        result: "Ты решил дать незнакомцу шанс."
      },
      {
        text: "Потребовать объяснений",
        next: "demand",
        change: 0,
        result: "Ты решил сначала получить ответы."
      }
    ]
  },

  trust: {
    speaker: "Незнакомец",
    text: "Разумный выбор. Пойдём, времени осталось мало.",
    next: "reaction"
  },

  demand: {
    speaker: "Незнакомец",
    text: "Я понимаю твои сомнения. Но не всё можно объяснить прямо здесь.",
    next: "reaction"
  },

  reaction: {
    speaker: "",
    text: "",
    dynamicText: true,
    next: "road"
  },

  road: {
    speaker: "",
    text: "Вы идёте по пустой улице. Незнакомец постоянно оглядывается, словно чего-то опасается.",
    next: "lastQuestion"
  },

  lastQuestion: {
    speaker: "Незнакомец",
    text: "Последний вопрос на сегодня. Ты готов узнать правду, даже если она тебе не понравится?",
    choices: [
      {
        text: "«Да. Я хочу знать правду»",
        next: "ending",
        change: 1,
        result: "Ты решил двигаться вперёд, несмотря на сомнения."
      },
      {
        text: "«Мне нужно время»",
        next: "ending",
        change: 0,
        result: "Ты решил не торопиться с решением."
      }
    ]
  },

  ending: {
    speaker: "",
    text: "",
    ending: true,
    dynamicText: true
  }
};

/* =========================================
   НАСТРОЙКИ И ХРАНЕНИЕ
========================================= */

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error("Не удалось прочитать данные:", error);
    return fallback;
  }
}

function getSaves() {
  const stored = readJSON(SAVE_KEY, []);
  return Array.from({ length: SLOT_COUNT }, (_, index) => stored[index] || null);
}

function putSaves(saves) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
}

function getCurrentState() {
  return {
    currentNodeId,
    gameStarted,
    historyStack: structuredClone(historyStack),
    logs: structuredClone(logs),
    affinity,
    endingReached
  };
}

function saveProgressAutomatically() {
  if (!gameStarted) return;

  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify(getCurrentState()));
  } catch (error) {
    console.warn("Не удалось сохранить прогресс:", error);
  }

  updateMenuButtons();
}

function restoreState(state) {
  currentNodeId = state.currentNodeId || "start";
  gameStarted = Boolean(state.gameStarted);
  historyStack = Array.isArray(state.historyStack) ? state.historyStack : [];
  logs = Array.isArray(state.logs) ? state.logs : [];
  affinity = Number(state.affinity) || 0;
  endingReached = Boolean(state.endingReached);

  showScreen("gameScreen");
  gameMenu.classList.add("hidden");
  renderScene();
  updateMenuButtons();
}

function updateMenuButtons() {
  const saves = getSaves();
  const hasManualSave = saves.some(Boolean);
  const autosave = readJSON(AUTO_KEY, null);

  continueBtn.disabled = !autosave && !hasManualSave;

  $("gameLoadBtn").disabled = !hasManualSave;
  $("loadBtn").disabled = !autosave && !hasManualSave;
}

/* =========================================
   ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ
========================================= */

function showScreen(screenId) {
  [mainMenu, gameScreen].forEach((screen) => {
    screen.classList.add("hidden");
  });

  $(screenId).classList.remove("hidden");
}

function closeModal() {
  modalLayer.classList.add("hidden");
  modalContent.innerHTML = "";
}

function showModal(title, content) {
  modalContent.innerHTML = `
    <h2>${escapeHTML(title)}</h2>
    <div class="modal-body">${content}</div>
  `;

  modalLayer.classList.remove("hidden");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

/* =========================================
   ЗАСТАВКА
========================================= */

function startSplash() {
  window.setTimeout(() => {
    splash.classList.add("fade-out");

    window.setTimeout(() => {
      splash.classList.add("hidden");
      mainMenu.classList.remove("hidden");
    }, 1250);
  }, 2300);
}

/* =========================================
   НАЧАЛО И ПРОДОЛЖЕНИЕ ИГРЫ
========================================= */

function startNewGame() {
  stopAuto();

  currentNodeId = "start";
  historyStack = [];
  logs = [];
  affinity = 0;
  endingReached = false;
  gameStarted = true;

  closeModal();
  gameMenu.classList.add("hidden");

  showScreen("gameScreen");
  renderScene();
}

function continueGame() {
  const autosave = readJSON(AUTO_KEY, null);

  if (autosave) {
    restoreState(autosave);
    return;
  }

  const saves = getSaves();
  const lastSave = saves.findLast ? saves.findLast(Boolean) : [...saves].reverse().find(Boolean);

  if (lastSave) {
    restoreState(lastSave.state);
  }
}

function openMainMenu() {
  stopAuto();
  gameMenu.classList.add("hidden");
  closeModal();
  showScreen("mainMenu");
  updateMenuButtons();
}

/* =========================================
   ДИАЛОГИ
========================================= */

function makeSnapshot() {
  return {
    currentNodeId,
    historyStack: structuredClone(historyStack),
    logs: structuredClone(logs),
    affinity,
    endingReached
  };
}

function restoreSnapshot(snapshot) {
  currentNodeId = snapshot.currentNodeId;
  historyStack = structuredClone(snapshot.historyStack);
  logs = structuredClone(snapshot.logs);
  affinity = snapshot.affinity;
  endingReached = snapshot.endingReached;
}

function renderScene() {
  const node = story[currentNodeId];

  if (!node) {
    dialogueText.textContent = "Конец демонстрационной сцены.";
    speakerName.textContent = "";
    choicesElement.classList.add("hidden");
    saveProgressAutomatically();
    return;
  }

  sceneBackground.src = IMAGES.background;
  sceneCharacter.src = IMAGES.character;

  speakerName.textContent = node.speaker || "";

  let text = node.text || "";

  if (node.dynamicText && currentNodeId === "reaction") {
    text = affinity > 0
      ? "Твой спутник замечает, что ты готов ему довериться. Кажется, ваши отношения немного улучшились."
      : affinity < 0
        ? "Незнакомец замечает твою неуверенность. Между вами остаётся некоторое недоверие."
        : "Вы продолжаете путь, пока не решив, насколько можете доверять друг другу.";
  }

  if (node.dynamicText && currentNodeId === "ending") {
    text = affinity >= 2
      ? "Ты сделал первый шаг к доверию. История продолжится в следующей главе..."
      : affinity < 0
        ? "Между вами остаётся недоверие. Что произойдёт дальше — пока неизвестно..."
        : "Впереди много вопросов и ни одного простого ответа. Продолжение следует...";
  }

  dialogueText.textContent = text;

  choicesElement.innerHTML = "";
  choicesElement.classList.add("hidden");

  if (node.choices && node.choices.length) {
    choicesElement.classList.remove("hidden");

    node.choices.forEach((choice) => {
      const button = document.createElement("button");
      button.textContent = choice.text;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        chooseOption(choice);
      });

      choicesElement.appendChild(button);
    });
  }

  if (node.ending) {
    endingReached = true;
    saveProgressAutomatically();

    window.setTimeout(() => {
      if (currentNodeId === "ending") {
        showEndingModal();
      }
    }, 400);
  }

  saveProgressAutomatically();
}

function advance() {
  if (!gameStarted || modalLayer.classList.contains("hidden") === false) return;
  if (!gameMenu.classList.contains("hidden")) return;

  const node = story[currentNodeId];
  if (!node || node.choices || node.ending) return;

  historyStack.push(makeSnapshot());

  logs.push({
    speaker: node.speaker || "Сцена",
    text: dialogueText.textContent
  });

  if (!node.next) return;

  currentNodeId = node.next;
  renderScene();
}

function chooseOption(choice) {
  historyStack.push(makeSnapshot());

  logs.push({
    speaker: "Выбор",
    text: choice.text
  });

  if (typeof choice.change === "number") {
    affinity += choice.change;
  }

  if (choice.result) {
    logs.push({
      speaker: "Последствие",
      text: choice.result
    });
  }

  currentNodeId = choice.next;
  renderScene();
}

function goBack() {
  if (!historyStack.length) return;

  const previous = historyStack.pop();
  restoreSnapshot(previous);
  renderScene();
}

/* =========================================
   АВТОПРОДВИЖЕНИЕ
========================================= */

function stopAuto() {
  autoEnabled = false;

  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }

  autoBtn.classList.remove("active");
  autoBtn.textContent = "Авто";
}

function toggleAuto() {
  if (autoEnabled) {
    stopAuto();
    return;
  }

  autoEnabled = true;
  autoBtn.classList.add("active");
  autoBtn.textContent = "Авто: ВКЛ";

  autoTimer = window.setInterval(() => {
    if (modalLayer.classList.contains("hidden") === false) return;
    if (!gameMenu.classList.contains("hidden")) return;

    const node = story[currentNodeId];

    if (!node || node.choices || node.ending) {
      stopAuto();
      return;
    }

    advance();
  }, 3500);
}

/* =========================================
   СОХРАНЕНИЯ: 60 СЛОТОВ, 10 СТРАНИЦ
========================================= */

function openSaveWindow(mode = "load") {
  saveMode = mode;
  savePage = 0;
  renderSaveWindow();
}

function renderSaveWindow() {
  const saves = getSaves();
  const start = savePage * SLOTS_PER_PAGE;

  const pageButtons = Array.from({ length: 10 }, (_, page) => `
    <button class="${page === savePage ? "selected" : ""}"
            data-page="${page}">
      ${page + 1}
    </button>
  `).join("");

  const slotCards = saves.slice(start, start + SLOTS_PER_PAGE)
    .map((save, localIndex) => {
      const index = start + localIndex;

      const title = save
        ? escapeHTML(save.label || "Сохранение")
        : "Пустой слот";

      const date = save
        ? escapeHTML(save.date || "")
        : "Нет сохранения";

      const action = saveMode === "save"
        ? "Сохранить сюда"
        : "Загрузить";

      const disabled = saveMode === "load" && !save ? "disabled" : "";

      return `
        <div class="save-slot">
          <strong>Слот ${index + 1}</strong>
          <span>${title}</span>
          <span>${date}</span>
          <button data-slot="${index}" ${disabled}>${action}</button>
        </div>
      `;
    }).join("");

  showModal(
    saveMode === "save" ? "Сохранение игры" : "Загрузка игры",
    `
      <div class="save-pages">${pageButtons}</div>
      <div class="save-grid">${slotCards}</div>
      <p class="empty-message">
        Сохранения хранятся в памяти браузера этого устройства.
      </p>
    `
  );

  modalContent.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      savePage = Number(button.dataset.page);
      renderSaveWindow();
    });
  });

  modalContent.querySelectorAll("[data-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.slot);

      if (saveMode === "save") {
        saveToSlot(index);
      } else {
        loadFromSlot(index);
      }
    });
  });
}

function saveToSlot(index) {
  if (!gameStarted) {
    showModal("Нечего сохранять", "<p>Сначала начни новую игру.</p>");
    return;
  }

  const saves = getSaves();

  saves[index] = {
    label: `Сцена: ${currentNodeId}`,
    date: new Date().toLocaleString(),
    state: getCurrentState()
  };

  try {
    putSaves(saves);
    closeModal();
    updateMenuButtons();
    showModal("Сохранено", `<p>Игра сохранена в слот ${index + 1}.</p>`);
  } catch (error) {
    showModal(
      "Ошибка сохранения",
      "<p>Не удалось сохранить данные. Возможно, в браузере закончилось свободное место.</p>"
    );
  }
}

function loadFromSlot(index) {
  const save = getSaves()[index];

  if (!save || !save.state) return;

  closeModal();
  stopAuto();
  restoreState(save.state);
}

/* =========================================
   ЛОГИ
========================================= */

function openLogs() {
  const content = logs.length
    ? `<div class="log-list">
        ${logs.map((entry) => `
          <div class="log-entry">
            <strong>${escapeHTML(entry.speaker)}</strong>
            ${escapeHTML(entry.text)}
          </div>
        `).join("")}
      </div>`
    : `<p class="empty-message">История пока пуста.</p>`;

  showModal("История", content);
}

/* =========================================
   НАСТРОЙКИ
========================================= */

function loadSettings() {
  settings = {
    ...settings,
    ...readJSON(SETTINGS_KEY, {})
  };
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function openSettings() {
  showModal(
    "Настройки",
    `
      <div class="settings-list">
        <div class="setting-row">
          <label for="languageSetting">Язык интерфейса</label>
          <select id="languageSetting">
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>

        <div class="setting-row">
          <label for="soundSetting">Звуковые эффекты</label>
          <input id="soundSetting" type="checkbox">
        </div>

        <div class="setting-row">
          <label for="musicSetting">Музыка</label>
          <input id="musicSetting" type="checkbox">
        </div>
      </div>

      <div class="modal-actions">
        <button id="saveSettingsBtn">Применить</button>
      </div>
    `
  );

  $("languageSetting").value = settings.language;
  $("soundSetting").checked = settings.sound;
  $("musicSetting").checked = settings.music;

  $("saveSettingsBtn").addEventListener("click", () => {
    settings.language = $("languageSetting").value;
    settings.sound = $("soundSetting").checked;
    settings.music = $("musicSetting").checked;

    saveSettings();
    closeModal();

    showModal(
      "Настройки сохранены",
      "<p>Параметры сохранены. Переключение языка и воспроизведение звука пока не реализованы.</p>"
    );
  });
}

/* =========================================
   РАЗРАБОТЧИКИ И КОНЦОВКА
========================================= */

function openCredits() {
  showModal(
    "Разработчики",
    `
      <p>Тут что-то будет...</p>
      <p>SOON... studio</p>
    `
  );
}

function showEndingModal() {
  showModal(
    "Конец демоверсии",
    `
      <div class="ending-title">Продолжение следует...</div>
      <p>Это конец текущего тестового эпизода.</p>
      <p>Текущий показатель отношений: ${affinity}</p>
      <div class="modal-actions">
        <button id="restartStoryBtn">Начать заново</button>
        <button id="endingMenuBtn">Главное меню</button>
      </div>
    `
  );

  $("restartStoryBtn").addEventListener("click", startNewGame);
  $("endingMenuBtn").addEventListener("click", openMainMenu);
}

/* =========================================
   ВЫХОД
========================================= */

function exitGame() {
  showModal(
    "Выход",
    `
      <p>Если игра открыта в браузере, браузер может запретить закрытие вкладки автоматически.</p>
      <div class="modal-actions">
        <button id="exitCancelBtn">Остаться</button>
        <button id="exitTryBtn">Попробовать выйти</button>
      </div>
    `
  );

  $("exitCancelBtn").addEventListener("click", closeModal);

  $("exitTryBtn").addEventListener("click", () => {
    window.close();

    modalContent.innerHTML = `
      <h2>Закрой игру</h2>
      <p>Если вкладка не закрылась, закрой её вручную.</p>
    `;
  });
}

/* =========================================
   ОБРАБОТЧИКИ КНОПОК
========================================= */

$("newGameBtn").addEventListener("click", startNewGame);
continueBtn.addEventListener("click", continueGame);

$("loadBtn").addEventListener("click", () => openSaveWindow("load"));
$("creditsBtn").addEventListener("click", openCredits);
$("settingsBtn").addEventListener("click", openSettings);
$("exitBtn").addEventListener("click", exitGame);

$("nextArea").addEventListener("click", advance);

$("backBtn").addEventListener("click", goBack);
autoBtn.addEventListener("click", toggleAuto);
$("logsBtn").addEventListener("click", openLogs);

$("gameMenuBtn").addEventListener("click", () => {
  stopAuto();
  gameMenu.classList.remove("hidden");
});

$("resumeBtn").addEventListener("click", () => {
  gameMenu.classList.add("hidden");
});

$("saveBtn").addEventListener("click", () => {
  openSaveWindow("save");
});

$("gameLoadBtn").addEventListener("click", () => {
  gameMenu.classList.add("hidden");
  openSaveWindow("load");
});

$("gameSettingsBtn").addEventListener("click", openSettings);
$("mainMenuBtn").addEventListener("click", openMainMenu);

$("closeModalBtn").addEventListener("click", closeModal);

modalLayer.addEventListener("click", (event) => {
  if (event.target === modalLayer) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!modalLayer.classList.contains("hidden")) {
      closeModal();
    } else if (!gameMenu.classList.contains("hidden")) {
      gameMenu.classList.add("hidden");
    }
  }

  if (event.code === "Space" && !event.repeat) {
    if (
      !mainMenu.classList.contains("hidden") ||
      !gameScreen.classList.contains("hidden") === false ||
      !modalLayer.classList.contains("hidden") ||
      !gameMenu.classList.contains("hidden")
    ) {
      return;
    }

    advance();
  }
});

/* =========================================
   ЗАПУСК
========================================= */

loadSettings();
updateMenuButtons();
startSplash();
