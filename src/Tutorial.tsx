import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { App } from "./App";
import { apply } from "./domainClient";
import { desktopEnabled } from "./desktop";
import { Icon } from "./icons";
import type { Action, State } from "./model";
import { STORAGE_KEY as WORKSPACE_KEY, Workspace } from "./storage";
import { TutorialContext } from "./TutorialContext";

const STORAGE_KEY = `hyperforest.tutorial.${desktopEnabled ? "desktop" : "web"}.v1`;
const ROOT = "tutorial-root";
const lessons = [
  {
    title: "Create your first vertex",
    instruction:
      "Choose the vanilla symbol in the right column, give your vertex a name, and create it.",
    hint: "New vertices are children of the selected vertex. The parent stays selected; click your new vertex to arrange it.",
  },
  {
    title: "Move it into place",
    instruction:
      "Select your new vertex, then drag it a little across the canvas.",
    hint: "Drag the vertex itself, rather than the small connection handle above it. Other vertices keep their positions.",
  },
  {
    title: "Make a connection",
    instruction:
      "Drag the handle on your vertex’s connecting edge onto the Practice forest root.",
    hint: "Connections are optional. They make focus time flow up to a parent. Dropping an edge handle on empty space disconnects it.",
  },
  {
    title: "Leave yourself a note",
    instruction:
      "Choose Notes, write something in Markdown notes, and save your changes.",
    hint: "The document symbol on a vertex tells you it has notes. Your practice note can be as short as one sentence.",
  },
  {
    title: "Give it your attention",
    instruction: "Choose Focus to start a real practice timer.",
    hint: "Double-clicking a vertex also starts focus. This timer belongs only to the practice workspace.",
  },
  {
    title: "Take a breath",
    instruction: "Press Pause to stop the timer.",
    hint: "Space also pauses or resumes when the timer view has focus. Minimize keeps the current running or paused state.",
  },
  {
    title: "Save your focus",
    instruction: "Choose Save & finish to record your practice session.",
    hint: "Resume would continue the same session. Saving keeps the focused time and returns you to the graph.",
  },
  {
    title: "Try a habit vertex",
    instruction:
      "Choose the habit symbol in the right column, name a habit, and create it.",
    hint: "Choose how many repetitions you want per day, week, or month. The other symbols create deadlines, thought ovals, and readings with attachments.",
  },
  {
    title: "Count one repetition",
    instruction: "Select your new habit, then choose Record repetition.",
    hint: "The counter shows this period's progress and your lifetime total. Undo removes the last repetition; editing frequency keeps your history.",
  },
  {
    title: "Give something a deadline",
    instruction:
      "Choose the deadline symbol, name a task, set its due date and time, and create it.",
    hint: "Its countdown keeps running even when you are not focusing. Edit deadline lets you reschedule; an overdue deadline stays visible.",
  },
  {
    title: "Capture a short thought",
    instruction:
      "Choose the thought symbol and create a vertex with your thought as its text.",
    hint: "The oval adapts to the text. Thought vertices also support notes, focus, dragging, and connections.",
  },
  {
    title: "Attach something to read",
    instruction:
      "Choose the reading symbol. Name a reading and attach a website, such as https://example.org/paper.pdf, before creating it.",
    hint: "You can attach a local file path instead. Desktop opens files in your system viewer; websites open in a browser. Attachment paths are saved with the vertex.",
  },
  {
    title: "See your progress",
    instruction: "Open Session history using the clock icon beside Today.",
    hint: "Your saved practice session is here. Date and subject filters narrow the totals. In your own forest, Workspace actions contains Export and Import.",
  },
  {
    title: "Filter your session history",
    instruction: "Type part of your first vertex's name in the Subject filter.",
    hint: "From date and To date limit the period. The table and statistics update together: total focus, averages, active days, and your longest session.",
  },
  {
    title: "Bring the full history back",
    instruction: "Choose Clear filters to see all your practice history again.",
    hint: "Change history lets you add a past session or delete an incorrect one. The history icon is always beside Today; your own history filters are remembered between visits.",
  },
] as const;

interface Progress {
  step: number;
  vertexId: string | null;
  habitId: string | null;
  readingId: string | null;
}
const beginning: Progress = {
  step: 0,
  vertexId: null,
  habitId: null,
  readingId: null,
};

/** Real commands and UI, backed only by memory for this practice run. */
class PracticeWorkspace extends Workspace {
  constructor(
    private readonly observe: (action: Action, state: State) => void,
  ) {
    const state = apply(
      { version: 1, trees: [], nodes: [], sessions: [], focus: null },
      { type: "create", id: ROOT, title: "Practice forest" },
      Date.now(),
    );
    const values = new Map([[WORKSPACE_KEY, JSON.stringify(state)]]);
    super({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });
  }
  override commit(action: Action, now: number): void {
    super.commit(action, now);
    this.observe(action, this.getSnapshot());
  }
}

function advance(progress: Progress, action: Action, state: State): Progress {
  const next = () => ({ ...progress, step: progress.step + 1 });
  switch (progress.step) {
    case 0:
      if (
        (action.type === "isolate" || action.type === "add") &&
        (!action.vertex || action.vertex.kind === "vanilla")
      )
        return { ...next(), vertexId: action.id };
      break;
    case 1:
      if (action.type === "move" && action.id === progress.vertexId)
        return next();
      break;
    case 2:
      if (
        action.type === "connect" &&
        action.id === progress.vertexId &&
        action.parentId === ROOT
      )
        return next();
      break;
    case 3:
      if (
        action.type === "edit" &&
        action.id === progress.vertexId &&
        action.notes.trim()
      )
        return next();
      break;
    case 4:
      if (action.type === "start" && action.id === progress.vertexId)
        return next();
      break;
    case 5:
      if (action.type === "pause" && state.focus?.nodeId === progress.vertexId)
        return next();
      break;
    case 6:
      if (
        action.type === "finish" &&
        state.sessions.some(
          (session) =>
            session.id === action.id && session.nodeId === progress.vertexId,
        )
      )
        return next();
      break;
    case 7:
      if (
        (action.type === "isolate" || action.type === "add") &&
        action.vertex?.kind === "habit"
      )
        return { ...next(), habitId: action.id };
      break;
    case 8:
      if (
        action.type === "recordHabit" &&
        action.id === progress.habitId &&
        !action.undo
      )
        return next();
      break;
    case 9:
      if (
        (action.type === "isolate" || action.type === "add") &&
        action.vertex?.kind === "deadline"
      )
        return next();
      break;
    case 10:
      if (
        (action.type === "isolate" || action.type === "add") &&
        action.vertex?.kind === "thought"
      )
        return next();
      break;
    case 11:
      if (
        (action.type === "isolate" || action.type === "add") &&
        action.vertex?.kind === "reading"
      )
        return {
          ...(action.vertex.resource.trim() ? next() : progress),
          readingId: action.id,
        };
      if (
        action.type === "configureVertex" &&
        action.id === progress.readingId &&
        action.vertex.kind === "reading" &&
        action.vertex.resource.trim()
      )
        return next();
      break;
  }
  return progress;
}

function targetSelectors(progress: Progress): string[] {
  switch (progress.step) {
    case 0:
      return ['[aria-label="Create vanilla vertex"]'];
    case 1:
      return [`[data-testid="node-fill-${progress.vertexId}"]`];
    case 2:
      return [
        `[data-testid="edge-handle-${progress.vertexId}"]`,
        `[data-testid="node-fill-${ROOT}"]`,
      ];
    case 3:
      return ['[aria-label="Edit goal"]'];
    case 4:
      return [".start-button"];
    case 5:
      return [
        ".focus-actions .primary-button",
        ".focus-dock > .primary-button",
      ];
    case 6:
      return [
        ".focus-actions > .quiet-button",
        '.focus-dock [aria-label="Session actions"]',
      ];
    case 7:
      return ['[aria-label="Create habit vertex"]'];
    case 8:
      return [
        '[aria-label="Habit history"]',
        ".vertex-details-habit > .quiet-button",
      ];
    case 9:
      return ['[aria-label="Create deadline vertex"]'];
    case 10:
      return ['[aria-label="Create thought vertex"]'];
    case 11:
      return progress.readingId
        ? [".vertex-configure"]
        : ['[aria-label="Create reading vertex"]'];
    case 12:
      return ['[aria-label="Session history"]'];
    case 13:
      return ['.history-filters input[type="search"]'];
    case 14:
      return [".history-filters > button"];
    default:
      return [];
  }
}

function InteractiveTutorial({ close }: { close: () => void }) {
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState<Progress>(beginning);
  const [revision, setRevision] = useState(0);
  const [workspace, setWorkspace] = useState(
    () =>
      new PracticeWorkspace((action, state) =>
        setProgress((previous) => advance(previous, action, state)),
      ),
  );
  const shell = useRef<HTMLDivElement>(null);
  const practice = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const [coachHost, setCoachHost] = useState<HTMLElement | null>(null);
  const [editingForm, setEditingForm] = useState(false);
  const lesson = lessons[progress.step];
  const complete = progress.step === lessons.length;

  useLayoutEffect(() => {
    startButton.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (started)
      practice.current
        ?.querySelector<HTMLButtonElement>(
          '[aria-label="Create vanilla vertex"]',
        )
        ?.focus({ preventScroll: true });
  }, [started, revision]);

  useEffect(() => {
    const element = shell.current;
    if (!element) return;
    const key = (event: KeyboardEvent): void => {
      if (element.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ].filter((item) => item.getClientRects().length > 0);
      const first = focusable[0],
        last = focusable.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [close]);

  // Native app dialogs sit in the browser's top layer. Put the coach inside
  // the active dialog so its instructions and exit button remain accessible.
  useEffect(() => {
    const root = practice.current;
    if (!root || !started) return;
    let active: HTMLDialogElement | null | undefined;
    let slot: HTMLDivElement | null = null;
    let highlighted: Element[] = [];
    const update = (): void => {
      const dialog =
        [...root.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1) ??
        null;
      if (dialog !== active) {
        slot?.remove();
        active = dialog;
        slot = null;
        if (dialog) {
          slot = document.createElement("div");
          slot.className = "tutorial-coach-slot";
          dialog.prepend(slot);
        }
        setCoachHost(slot);
        setEditingForm(
          !!dialog &&
            !dialog.classList.contains("focus-screen") &&
            !dialog.classList.contains("history-dialog"),
        );
      }
      if (
        progress.step === 12 &&
        dialog?.getAttribute("aria-label") === "Session history"
      )
        setProgress((current) =>
          current.step === 12 ? { ...current, step: 13 } : current,
        );
      const targets =
        dialog &&
        !dialog.classList.contains("focus-screen") &&
        !dialog.classList.contains("history-dialog")
          ? [
              ...dialog.querySelectorAll(
                'input[autofocus], textarea, button[type="submit"]',
              ),
            ]
          : targetSelectors(progress).flatMap((selector) => [
              ...root.querySelectorAll(selector),
            ]);
      highlighted
        .filter((target) => !targets.includes(target))
        .forEach((target) => target.classList.remove("tutorial-target"));
      targets.forEach((target) => target.classList.add("tutorial-target"));
      highlighted = targets;
    };
    const observer = new MutationObserver(update);
    const historyInput = (event: Event): void => {
      if (
        progress.step === 13 &&
        event.target instanceof HTMLInputElement &&
        event.target.matches('.history-filters input[type="search"]') &&
        event.target.value.trim()
      )
        setProgress((current) =>
          current.step === 13 ? { ...current, step: 14 } : current,
        );
    };
    const historyClick = (event: Event): void => {
      if (
        progress.step === 14 &&
        event.target instanceof Element &&
        event.target.closest(".history-filters > button")
      )
        setProgress((current) =>
          current.step === 14 ? { ...current, step: lessons.length } : current,
        );
    };
    root.addEventListener("input", historyInput);
    root.addEventListener("click", historyClick);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "aria-label"],
    });
    update();
    return () => {
      observer.disconnect();
      root.removeEventListener("input", historyInput);
      root.removeEventListener("click", historyClick);
      slot?.remove();
      highlighted.forEach((target) =>
        target.classList.remove("tutorial-target"),
      );
    };
  }, [started, progress, revision]);

  const showTarget = (): void => {
    const target = practice.current?.querySelector<HTMLElement>(
      targetSelectors(progress)[0] ?? ".graph",
    );
    target?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  };
  const restart = (): void => {
    setProgress(beginning);
    setCoachHost(null);
    setEditingForm(false);
    setWorkspace(
      new PracticeWorkspace((action, state) =>
        setProgress((previous) => advance(previous, action, state)),
      ),
    );
    setRevision((current) => current + 1);
    setStarted(true);
  };

  const coach = (
    <aside
      className={`tutorial-coach ${coachHost ? "tutorial-coach-in-dialog" : ""}`}
      aria-label="Tutorial coach"
    >
      <div aria-live="polite" aria-atomic="true">
        <span className="eyebrow">
          {complete
            ? "PRACTICE COMPLETE"
            : `Step ${progress.step + 1} of ${lessons.length}`}
        </span>
        <h2>{complete ? "You have the hang of it." : lesson?.title}</h2>
        <p>
          {complete
            ? "You tried all five vertex types, moved and connected vertices, saved notes and focus, counted a habit repetition, and filtered your session history."
            : lesson?.instruction}
        </p>
        {!complete && editingForm && (
          <p className="tutorial-form-hint">
            Use the form here, then save to continue.
          </p>
        )}
        <p className="tutorial-hint">
          {complete
            ? "Your practice forest will disappear when you leave. Your own workspace is exactly as you left it."
            : lesson?.hint}
        </p>
        <progress
          max={lessons.length}
          value={progress.step}
          aria-label="Tutorial progress"
        />
      </div>
      <div className="tutorial-coach-actions">
        {complete ? (
          <button className="primary-button" onClick={close}>
            Return to my forest <Icon name="check" size={16} />
          </button>
        ) : (
          <>
            {!coachHost && (
              <button className="quiet-button" onClick={showTarget}>
                <Icon name="arrow" size={16} /> Show me where
              </button>
            )}
            <button className="quiet-button" onClick={close}>
              Skip tutorial
            </button>
          </>
        )}
        <button className="quiet-button" onClick={restart}>
          Start over
        </button>
      </div>
    </aside>
  );

  return (
    <div
      className="tutorial-shell"
      ref={shell}
      role="dialog"
      aria-modal="true"
      aria-label="Hyperforest tutorial"
    >
      <header className="tutorial-shell-header">
        <span>
          <Icon name="tree" size={20} /> Learn by doing{" "}
          <small>Practice workspace · changes are temporary</small>
        </span>
        <button
          className="icon-button"
          aria-label="Close tutorial"
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </header>
      {!started ? (
        <div className="tutorial-welcome">
          <Icon name="tree" size={52} />
          <span className="eyebrow">YOUR FIRST LITTLE FOREST</span>
          <h1>Try it with your own hands.</h1>
          <p>
            Create a vertex, drag it, connect it, write a note, and run a focus
            timer. The guide follows what you do.
          </p>
          <p className="tutorial-hint">
            This is a temporary practice forest. Your saved workspace stays
            untouched.
            {desktopEnabled
              ? " You can practice before choosing a desktop data directory."
              : " No account or setup is needed."}
          </p>
          <button
            ref={startButton}
            className="primary-button"
            onClick={() => setStarted(true)}
          >
            Start practicing <Icon name="arrow" />
          </button>
          <button className="quiet-button" onClick={close}>
            Skip tutorial
          </button>
        </div>
      ) : (
        <div className="tutorial-shell-body">
          <div
            className="tutorial-workspace"
            ref={practice}
            aria-label="Practice workspace"
          >
            <App
              key={revision}
              workspace={workspace}
              showSaveStatus={false}
              practice
            />
          </div>
          <div className="tutorial-coach-sidebar">{!coachHost && coach}</div>
          {coachHost && createPortal(coach, coachHost)}
        </div>
      )}
    </div>
  );
}

function shouldOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "seen";
  } catch {
    return true;
  }
}

/** Only dismissal preferences are stored; practice data never reaches persistence. */
export function TutorialProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(shouldOpen);
  const previousFocus = useRef<Element | null>(null);
  const background = useRef<HTMLDivElement>(null);
  // Restore scrolling after the practice App's nested dialogs finish their
  // layout cleanups, including when the walkthrough is exited from a form.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !background.current) return;
    const root = background.current;
    const suspended = new Set<HTMLDialogElement>();
    const suspend = (): void => {
      root
        .querySelectorAll<HTMLDialogElement>("dialog[open]")
        .forEach((dialog) => {
          suspended.add(dialog);
          dialog.close();
        });
    };
    suspend();
    const observer = new MutationObserver(suspend);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      observer.disconnect();
      suspended.forEach((dialog) => {
        if (dialog.isConnected) dialog.showModal();
      });
    };
  }, [open]);
  const close = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, "seen");
    } catch {
      /* Preferences may be unavailable. */
    }
    setOpen(false);
    requestAnimationFrame(() => {
      if (
        previousFocus.current instanceof HTMLElement &&
        previousFocus.current.isConnected
      )
        previousFocus.current.focus({ preventScroll: true });
    });
  };
  return (
    <TutorialContext.Provider
      value={() => {
        previousFocus.current = document.activeElement;
        setOpen(true);
      }}
    >
      <div ref={background} inert={open} aria-hidden={open}>
        {children}
      </div>
      {open && <InteractiveTutorial close={close} />}
    </TutorialContext.Provider>
  );
}
