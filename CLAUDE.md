# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev-сервер на :5173, доступен по сети (--host)
npm run build    # tsc --noEmit + vite build (sourcemap включён)
npm run preview  # превью продакшн-билда по сети
```

Тестов нет. Проверка типов — `tsc --noEmit` (запускается внутри `build`).

## Path aliases

Все алиасы объявлены синхронно в `vite.config.ts` и `tsconfig.json`. При добавлении нового — правишь оба файла.

| Алиас | Папка |
|---|---|
| `@config` | `src/config/` |
| `@core` | `src/core/` |
| `@scenes` | `src/scenes/` |
| `@minigames` | `src/minigames/` |
| `@ui` | `src/ui/` |
| `@utils` | `src/utils/` |
| `@i18n` | `src/i18n/` |

## Архитектура

**Make Love Adventures** — промо-игра на Phaser 3 для пиццерии. Встраивается в webview мобильного приложения. Холст 720×1280 (9:16), масштабируется через `Scale.FIT`.

### Жизненный цикл сессии

```
Билет → MinigameRunnerScene → минка 1..4
                                   │
                             win   │   lose
                               ChoiceScene ──────────────────────────────┐
                              /           \                               │
                      крутить             дальше → MinigameRunnerScene   │
                      сейчас                         (advanceLevel)      │
                         │                                               │
                     WheelScene ←── уровень 4: автоматически с джекпотом │
                         │                                               │
                     ResultScene (win) ──────────────────── ResultScene (lose) ←──┘
```

Текущий уровень сессии и результат каждого шага живут в `SessionState` (in-memory). Прогресс между сессиями (на какой минке продолжать) и наличие билета хранятся в `GameState` → `localStorage`, TTL 14 дней с момента последней покупки.

### Слои стейта

- **`SessionState`** (`@core/SessionState`) — одна игровая сессия: текущий уровень, пройденные уровни, выигранный приз. Сбрасывается при старте новой сессии.
- **`GameState`** (`@core/GameState`) — фасад над `Storage`. Билет, `progressLevel` (1..4), счётчики, 14-дневный TTL. Персистентный.
- **`EventBus`** (`@core/EventBus`) — `Phaser.Events.EventEmitter`, глобальная шина. Ключевые события: `minigame:complete`, `session:start`, `session:end`, `analytics`.

### Мини-игры

Все минки наследуют `BaseMinigame` (`@minigames/BaseMinigame`). Контракт:

1. Раннер запускает сцену через `scene.launch(key, MinigameInitData)`.
2. Минка реализует `create()` (и опционально `update()`).
3. По завершении раунда — **обязательно** вызвать `this.complete({ outcome, score })`. Дважды вызывать нельзя (защита внутри).
4. `BaseMinigame.complete()` эмитит `minigame:complete` в EventBus и останавливает сцену.

Раннер (`MinigameRunnerScene`) показывает хинт-сплэш 1.6 сек, затем запускает минку. Он же обрабатывает win/lose и переключает сцены дальше.

### Пул и случайный выбор минок

Минки разбиты на три класса сложности (`'easy' | 'medium' | 'hard'`) в `MINIGAME_POOL` (`@core/MinigameRegistry`). При старте сессии `generateSessionSequence()` случайно выбирает по одной минке на каждый из 4 слотов по схеме `easy → medium → hard → hard`, без повторов. Последовательность хранится в `SessionState.sequence` и читается через `SessionState.getMinigameAtLevel(level)`.

Это значит каждая сессия может быть уникальной — чем больше минок в пуле, тем больше вариантов.

### Добавить новую мини-игру

1. Создать `src/minigames/MyGame/index.ts`, класс `extends BaseMinigame`.
2. Зарегистрировать сцену в массиве `scene:` в `src/main.ts`.
3. Добавить запись в `MINIGAME_POOL` в `@core/MinigameRegistry` с полем `class: 'easy' | 'medium' | 'hard'`.
4. Добавить строки в `src/i18n/ru.ts`: `minigame.names[key]` и `minigame.hints[key]`.

### Призы и колесо

Призовой пул (`@config/prizes`) — 8 позиций, 4 тира. Порядок в массиве = порядок секторов по часовой. Веса тиров по уровню сессии задаются в `WEIGHTS_BY_LEVEL`. На уровне 4 (`isJackpot: true`) `WheelScene` использует `pickJackpotIndex()` — гарантирует epic/legendary.

Менять призы или тексты — только `prizes.ts` и `src/i18n/ru.ts`.

### Интеграция с родительским приложением (webview)

Билет приходит через:
- URL-параметр `?ticket=1` (чистится из истории сразу)
- `window.postMessage({ type: 'mla:grantTicket' }, '*')`

Игра сообщает результат:
- `mla:prizeWon` — выигранный приз
- `mla:sessionEnd` — итог сессии (win/lose)

**TODO для production:** добавить проверку `event.origin` в `TicketProvider.attachPostMessage()`.

### UI-компоненты

- `Button` (`@ui/Button`) — универсальная кнопка с отключением.
- `PosterText` (`@ui/PosterText`) — текст-стикер с цветным фоном и небольшим наклоном. Используется повсеместно для заголовков.

### Дебаг

В dev-режиме (`GAME.DEBUG`) в `window` экспортируется:
- `__game` — инстанс Phaser
- `__state` — `GameState`
- `__ticket` — `TicketProvider`

Также доступны: `?ticket=1` — выдать билет; `?reset=1` — сбросить весь стейт (при необходимости добавить обработчик).

### Глубины (z-index)

`DEPTH` из `@config/game`: `background(0)` → `midground(10)` → `gameplay(20)` → `effects(30)` → `ui(40)` → `modal(50)` → `toast(60)`. Все игровые объекты обязаны выставлять глубину явно.
