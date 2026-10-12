
"use strict";

/* NOVELL — основная логика игры */

const $ = (id) => document.getElementById(id);

const SAVE_KEY = "novell_saves_v1";
const AUTO_KEY = "novell_autosave_v1";
const SETTINGS_KEY = "novell_settings_v1";
const SLOT_COUNT = 60;
const PAGE_SIZE = 6;

const screens = [
  "mainMenu",
  "gameScreen",
  "gameMenu"
];

let currentIndex = 0;
let affinity = 0;
let lastAnswer = "";
let autoEnabled = false;
let autoTimer = null;
let savePage = 0;
let saveMode = "load";
let previousScreen = "mainMenu";
let historyStack = [];
let logs = [];
let gameStarted = false;
let endingReached = false;

let settings = {
  language: "ru",
  sound: 80,
  music: 60
};

const story = [
  {
    speaker: "Персонаж",
    text: "Тестовое сообщение 1"
  },
  {
    speaker: "Персонаж",
    text: "Тестовое сообщение 2"
  },
  {
    speaker: "Персонаж",
    text: "Привет. Это тестовая новелла."
  },
  {
    speaker: "Персонаж",
    text: "Пока здесь только начало. Позже у сцен появятся собственные фоны, анимации и музыка."
  },
  {
    speaker: "Персонаж",
    text: "Давай проверим, как работают выборы. Как ты поступишь, если персонаж расскажет тебе свой секрет?",
    choices: [
      {
        text: "Выслушаю и сохраню секрет",
        answer: "Выслушать",
        change: 2
      },
      {
        text: "Попробую узнать всю правду",
        answer: "Узнать правду",
        change: 1
      },
      {
        text: "Не буду вмешиваться",
        answer: "Не вмешиваться",
        change: 0
      }
    ]
  },
  {
    speaker: "Персонаж",
    text: () => {
      if (lastAnswer === "Выслушать") {
        return "Спасибо, что выслушал. Мне кажется, я могу тебе доверять. Близость увеличилась на 2.";
      }

      if (lastAnswer === "Узнать правду") {
        return "Ты хочешь разобраться во всём. Я пока не уверен, готов ли рассказать тебе всё. Близость увеличилась на 1.";
      }

      return "Хорошо, я понимаю. Возможно, когда-нибудь я сам решусь рассказать тебе больше.";
    }
  },
  {
    speaker: "Персонаж",
    text: "Вот так выбор влияет на отношения. В полноценной версии последствия будут открывать новые сцены и менять развитие сюжета."
  },
  {
    speaker: "Персонаж",
    text: "Попробуем ещё раз. Какое место ты бы выбрал для нашей следующей встречи?",
    choices: [
      {
        text: "Тихое кафе",
        answer: "Кафе",
        change: 2
      },
      {
        text: "Ночная прогулка",
        answer: "Прогулка",
        change: 2
      },
      {
        text: "Останемся дома",
        answer: "Дом",
        change: 1
      }
    ]
  },
  {
    speaker: "Персонаж",
    text: () => {
      const responses = {
        "Кафе": "Тихое кафе? Звучит уютно. Думаю, нам будет о чём поговорить.",
        "Прогулка": "Ночная прогулка... Мне нравится эта идея. Особенно если город будет тихим.",
        "Дом": "Тогда можно устроиться поудобнее и просто поговорить."
      };

      return responses[lastAnswer] || "Хорошая идея!";
    }
  },
  {
    speaker: "Персонаж",
    text: "Тестовая глава закончилась. Можно продолжить проверять игру с самого начала или вернуться в меню."
  }
];

function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Не удалось сохранить данные:", error);
    return false;
  }
}

function showScreen(id) {
  screens.forEach((screenId) => {
    $(screenId).classList.toggle("hidden", screenId !== id);
  });
}

function showModal(html) {
  $("modalContent").innerHTML = html;
  $("modalLayer").classList.remove("hidden");
}

function closeModal() {
  $("modalLayer").classList.add("hidden");
  $("modalContent").innerHTML = "";
}

function loadSettings() {
  const stored = safeRead(SETTINGS_KEY, null);

  if (stored && typeof stored === "object") {
    settings = { ...settings, ...stored };
  }
}

function saveSettings() {
  safeWrite(SETTINGS_KEY, settings);
}

function updateMenuButtons() {
  const autosave = safeRead(AUTO_KEY, null);
  const slots = safeRead(SAVE_KEY, []);

  const hasProgress =
    Boolean(autosave && autosave.gameStarted) ||
    (Array.isArray(slots) && slots.some(Boolean));

  $("continueBtn").disabled = !hasProgress;
}

function makeSnapshot() {
  return {
    currentIndex,
    affinity,
    lastAnswer,
    logsLength: logs.length,
    endingReached
  };
}

function restoreSnapshot(snapshot) {
  currentIndex = snapshot.currentIndex;
  affinity = snapshot.affinity;
  lastAnswer = snapshot.lastAnswer;
  endingReached = snapshot.endingReached;
  logs = logs.slice(0, snapshot.logsLength);
}

function rememberHistory() {
  historyStack.push(makeSnapshot());

  if (historyStack.length > 200) {
    historyStack.shift();
  }
}

function currentNode() {
  return story[currentIndex] || null;
}

function currentText(node) {
  return typeof node.text === "function"
    ? node.text()
    : node.text;
}

function renderScene() {
  const node = currentNode();

  if (!node) {
    finishStory();
    return;
  }

  $("speaker").textContent = node.speaker || "";
  $("dialogText").textContent = currentText(node);
  $("choices").replaceChildren();

  const choices = node.choices || [];

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.textContent = choice.text;

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      chooseAnswer(choice);
    });

    $("choices").appendChild(button);
  });

  $("backBtn").disabled = historyStack.length === 0;
  $("autoBtn").classList.toggle("active", autoEnabled);

  $("scene").style.backgroundImage =
    'url("assets/Test.png")';

  $("dialogCharacter").src = "assets/chacter.png";

  if (node.choices) {
    stopAuto();
  }

  endingReached = currentIndex === story.length - 1;
  saveProgressAutomatically();
}

function addLog(speaker, text) {
  logs.push({
    speaker,
    text,
    index: currentIndex,
    time: Date.now()
  });
}

function startNewGame() {
  currentIndex = 0;
  affinity = 0;
  lastAnswer = "";
  historyStack = [];
  logs = [];
  gameStarted = true;
  endingReached = false;

  addLog("Система", "Начало новой игры.");

  showScreen("gameScreen");
  closeModal();
  renderScene();
}

function advance() {
  if (!gameStarted || endingReached) {
    return;
  }

  const node = currentNode();

  if (!node || node.choices) {
    return;
  }

  rememberHistory();
  addLog(node.speaker || "Персонаж", currentText(node));

  currentIndex++;

  if (currentIndex >= story.length) {
    finishStory();
    return;
  }

  renderScene();
}

function chooseAnswer(choice) {
  const node = currentNode();

  if (!node || !node.choices) {
    return;
  }

  rememberHistory();

  lastAnswer = choice.answer;
  affinity += choice.change || 0;

  addLog("Твой ответ", choice.text);
  addLog(
    "Система",
    "Изменение близости: " +
      (choice.change > 0 ? "+" : "") +
      (choice.change || 0)
  );

  currentIndex++;

  if (currentIndex >= story.length) {
    finishStory();
    return;
  }

  renderScene();
}

function goBack() {
  if (historyStack.length === 0) {
    return;
  }

  stopAuto();

  const snapshot = historyStack.pop();
  restoreSnapshot(snapshot);

  showScreen("gameScreen");
  renderScene();
}

function finishStory() {
  endingReached = true;
  stopAuto();
  saveProgressAutomatically();

  showModal(`
    <h2>Конец тестовой главы</h2>
    <p>Текущая близость: ${affinity}</p>
    <p>Тестовая глава завершена. В дальнейшем здесь будут настоящие концовки.</p>
    <button id="restartStoryBtn">Начать заново</button>
    <button id="endingMenuBtn">В главное меню</button>
  `);

  $("restartStoryBtn").addEventListener("click", startNewGame);

  $("endingMenuBtn").addEventListener("click", () => {
    closeModal();
    showScreen("mainMenu");
  });
}

/* Автоматическое продвижение диалогов */

function stopAuto() {
  autoEnabled = false;

  if (autoTimer !== null) {
    clearInterval(autoTimer);
    autoTimer = null;
  }

  if ($("autoBtn")) {
    $("autoBtn").classList.remove("active");
  }
}

function toggleAuto() {
  if (autoEnabled) {
    stopAuto();
    return;
  }

  if (!gameStarted || endingReached || currentNode()?.choices) {
    return;
  }

  autoEnabled = true;
  $("autoBtn").classList.add("active");

  autoTimer = setInterval(() => {
    if (
      $("gameScreen").classList.contains("hidden") ||
      $("modalLayer").classList.contains("hidden") === false
    ) {
      return;
    }

    if (currentNode()?.choices || endingReached) {
      stopAuto();
      return;
    }

    advance();
  }, 4000);
}

/* Сохранения */

function getSaveSlots() {
  const slots = safeRead(SAVE_KEY, []);

  if (!Array.isArray(slots)) {
    return Array(SLOT_COUNT).fill(null);
  }

  return Array.from(
    { length: SLOT_COUNT },
    (_, index) => slots[index] || null
  );
}

function getSaveState() {
  return {
    currentIndex,
    affinity,
    lastAnswer,
    historyStack,
    logs,
    gameStarted,
    endingReached,
    savedAt: Date.now(),
    sceneImage: "assets/Test.png"
  };
}

function saveProgressAutomatically() {
  if (!gameStarted) {
    return;
  }

  safeWrite(AUTO_KEY, getSaveState());
  updateMenuButtons();
}

function saveToSlot(slotIndex) {
  if (!gameStarted) {
    alert("Сначала начни игру.");
    return;
  }

  const slots = getSaveSlots();

  slots[slotIndex] = getSaveState();

  if (!safeWrite(SAVE_KEY, slots)) {
    alert("Не удалось сохранить игру. Возможно, закончилось место.");
    return;
  }

  renderSaveSlots();
}

function loadSaveState(state) {
  if (!state || typeof state !== "object") {
    alert("Это сохранение пустое или повреждено.");
    return;
  }

  currentIndex = Math.max(
    0,
    Math.min(Number(state.currentIndex) || 0, story.length - 1)
  );

  affinity = Number(state.affinity) || 0;
  lastAnswer = state.lastAnswer || "";

  historyStack = Array.isArray(state.historyStack)
    ? state.historyStack
    : [];

  logs = Array.isArray(state.logs) ? state.logs : [];
  gameStarted = Boolean(state.gameStarted);
  endingReached = Boolean(state.endingReached);

  closeModal();
  showScreen("gameScreen");
  renderScene();
}

function openSaveSlots(mode) {
  saveMode = mode;
  savePage = 0;
  renderSaveSlots();
}

function renderSaveSlots() {
  const slots = getSaveSlots();
  const start = savePage * PAGE_SIZE;

  let html = `
    <h2>${saveMode === "save" ? "Сохранить игру" : "Загрузить игру"}</h2>
    <p>Страница ${savePage + 1} из 10</p>
    <div class="save-grid">
  `;

  for (let i = start; i < start + PAGE_SIZE; i++) {
    const slot = slots[i];
    const number = i + 1;

    const date = slot?.savedAt
      ? new Date(slot.savedAt).toLocaleString()
      : "Пустой слот";

    html += `
      <div class="save-slot">
        <img
          src="${slot?.sceneImage || "assets/Test.png"}"
          alt=""
          onerror="this.style.visibility='hidden'"
        >
        <p><strong>Слот ${number}</strong></p>
        <p>${escapeHtml(date)}</p>
        <div class="slot-actions">
          ${
            saveMode === "save"
              ? `<button data-save="${i}">Сохранить сюда</button>`
              : `<button data-load="${i}" ${slot ? "" : "disabled"}>Загрузить</button>`
          }
        </div>
      </div>
    `;
  }

  html += `
    </div>
    <div class="page-controls">
      <button id="previousPageBtn" ${savePage === 0 ? "disabled" : ""}>Назад</button>
      <span>${savePage + 1} / 10</span>
      <button id="nextPageBtn" ${savePage === 9 ? "disabled" : ""}>Далее</button>
    </div>
  `;

  showModal(html);

  $("previousPageBtn").addEventListener("click", () => {
    if (savePage > 0) {
      savePage--;
      renderSaveSlots();
    }
  });

  $("nextPageBtn").addEventListener("click", () => {
    if (savePage < 9) {
      savePage++;
      renderSaveSlots();
    }
  });

  document.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", () => {
      saveToSlot(Number(button.dataset.save));
    });
  });

  document.querySelectorAll("[data-load]").forEach((button) => {
    button.addEventListener("click", () => {
      const slot = slots[Number(button.dataset.load)];
      loadSaveState(slot);
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

/* Логи */

function openLogs() {
  let html = "<h2>История диалогов</h2>";

  if (logs.length === 0) {
    html += "<p>История пока пуста.</p>";
  }

  logs.forEach((entry) => {
    html += `
      <div class="log-entry">
        <strong>${escapeHtml(entry.speaker)}</strong>
        ${escapeHtml(entry.text)}
      </div>
    `;
  });

  showModal(html);
}

/* Настройки */

function openSettings() {
  showModal(`
    <h2>Настройки</h2>

    <label class="settings-row">
      <span>Язык</span>
      <select id="languageSetting">
        <option value="ru">Русский</option>
        <option value="en">English</option>
      </select>
    </label>

    <label class="settings-row">
      <span>Звуковые эффекты</span>
      <input id="soundSetting" type="range" min="0" max="100" value="${settings.sound}">
    </label>

    <label class="settings-row">
      <span>Музыка</span>
      <input id="musicSetting" type="range" min="0" max="100" value="${settings.music}">
    </label>

    <p>Громкость сохранится. Подключение настоящих аудиофайлов добавим отдельно.</p>
    <button id="applySettingsBtn">Сохранить настройки</button>
  `);

  $("languageSetting").value = settings.language;

  $("applySettingsBtn").addEventListener("click", () => {
    settings.language = $("languageSetting").value;
    settings.sound = Number($("soundSetting").value);
    settings.music = Number($("musicSetting").value);

    saveSettings();
    closeModal();
  });
}

/* Разработчики */

function openCredits() {
  showModal(`
    <h2>Разработчики</h2>
    <p>тут что-то будет...</p>
  `);
}

/* Меню */

function openGameMenu() {
  stopAuto();
  showScreen("gameMenu");
}

function returnToMainMenu() {
  stopAuto();
  closeModal();
  showScreen("mainMenu");
  updateMenuButtons();
}

/* Выход */

function exitGame() {
  showModal(`
    <h2>Выход</h2>
    <p>В браузере закрытие окна может быть запрещено системой.</p>
    <p>При сборке APK подключим корректный выход из приложения.</p>
    <button id="exitOkBtn">Понятно</button>
  `);

  $("exitOkBtn").addEventListener("click", closeModal);

  try {
    window.close();
  } catch (error) {
    console.info("Закрытие окна запрещено браузером.");
  }
}

/* Подключение кнопок */

$("newGameBtn").addEventListener("click", startNewGame);

$("continueBtn").addEventListener("click", () => {
  const state = safeRead(AUTO_KEY, null);

  if (state && state.gameStarted) {
    loadSaveState(state);
  } else {
    openSaveSlots("load");
  }
});

$("loadBtn").addEventListener("click", () => openSaveSlots("load"));
$("saveBtn").addEventListener("click", () => openSaveSlots("save"));
$("pauseLoadBtn").addEventListener("click", () => openSaveSlots("load"));

$("creditsBtn").addEventListener("click", openCredits);
$("settingsBtn").addEventListener("click", openSettings);
$("pauseSettingsBtn").addEventListener("click", openSettings);
$("exitBtn").addEventListener("click", exitGame);

$("backBtn").addEventListener("click", goBack);
$("autoBtn").addEventListener("click", toggleAuto);
$("logsBtn").addEventListener("click", openLogs);
$("gameMenuBtn").addEventListener("click", openGameMenu);

$("resumeBtn").addEventListener("click", () => {
  showScreen("gameScreen");
});

$("mainMenuBtn").addEventListener("click", returnToMainMenu);

$("closeModalBtn").addEventListener("click", closeModal);

$("modalLayer").addEventListener("click", (event) => {
  if (event.target === $("modalLayer")) {
    closeModal();
  }
});

$("nextArea").addEventListener("click", advance);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("modalLayer").classList.contains("hidden")) {
      closeModal();
    } else if (!$("gameScreen").classList.contains("hidden")) {
      openGameMenu();
    }
  }

  if (
    event.key === " " &&
    !$("gameScreen").classList.contains("hidden") &&
    $("modalLayer").classList.contains("hidden")
  ) {
    event.preventDefault();
    advance();
  }
});

/* Запуск */

loadSettings();
updateMenuButtons();

showScreen("mainMenu");
$("mainMenu").classList.add("hidden");

setTimeout(() => {
  $("splash").classList.add("fade-out");

  setTimeout(() => {
    $("splash").classList.add("hidden");
    $("mainMenu").classList.remove("hidden");
  }, 1500);
}, 2500);

