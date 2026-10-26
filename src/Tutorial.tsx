import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { desktopEnabled } from "./desktop";
import { Icon } from "./icons";

const STORAGE_KEY = `hyperforest.tutorial.${desktopEnabled ? "desktop" : "web"}.v1`;
const TutorialContext = createContext(() => {});

const lessons = [
  {
    title: "A little space for your big ideas",
    icon: "tree",
    body: "Hyperforest brings your goals, notes, and focused time together. A hypertree is a project or area of your life; its vertices are the goals inside it.",
    action: desktopEnabled
      ? "Start by choosing a directory. Hyperforest keeps your workspace and Markdown notes there, and saves changes automatically."
      : "Your workspace saves automatically in this browser on this device. No account is needed.",
  },
  {
    title: "Plant your first hypertree",
    icon: "plus",
    body: "Choose New hypertree at the top and give it a name, such as Learn guitar. Each hypertree gets its own tab, so you can move between projects.",
    action:
      "Select a goal, then choose New vertex to add a smaller goal beneath it. Try Practice chords and Learn a song.",
  },
  {
    title: "Make the graph your own",
    icon: "pencil",
    body: "Click a vertex to select it. In Edit graph mode, drag vertices to arrange them, use edge handles to reconnect them, and choose Vertex color to group related goals.",
    action:
      "Choose Done editing when you are ready to work. The gear beside Focus opens Options, including whether finished goals are visible.",
  },
  {
    title: "Give one goal your attention",
    icon: "play",
    body: "Select a goal and choose Focus, or double-click its vertex, to start a timer. Pause stops counting time; Resume continues. Space also toggles pause in the large timer view.",
    action:
      "Minimize or Escape switches to a compact timer without changing its running or paused state. Choose Save & finish to record the session. Finish goal in Edit graph marks a goal complete while preserving its notes and history.",
  },
  {
    title: "Keep the context, see your progress",
    icon: "notes",
    body: "Select a goal and choose Notes to write Markdown notes. A small document symbol marks vertices with notes. The goal's Total focused includes time spent on its descendants.",
    action:
      "Today at the top shows focus across your workspace. The history icon next to it opens saved sessions, date filters, and totals.",
  },
  {
    title: "Keep your forest close",
    icon: "download",
    body: desktopEnabled
      ? "Autosaved in the desktop status bar opens storage controls. Your chosen directory contains workspace.yaml, Markdown notes, and daily backups."
      : "Browser storage belongs to this browser and device. Export a backup before clearing browser data or moving to another device.",
    action:
      "Open Workspace actions (⋯) for Export and Import. ZIP backups work in both the website and desktop app. Reopen this guide anytime with Tutorial at the bottom.",
  },
] as const;

function shouldOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "seen";
  } catch {
    return true;
  }
}

/** Tutorial preferences stay on this device, separate from workspace backups. */
export function TutorialProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(shouldOpen);
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lesson = lessons[step]!;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previous;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, step]);

  const close = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, "seen");
    } catch {
      // The guide remains usable if this host disallows preference storage.
    }
    setOpen(false);
  };

  return (
    <TutorialContext.Provider
      value={() => {
        setStep(0);
        setOpen(true);
      }}
    >
      {children}
      {open && (
        <dialog
          ref={dialog}
          className="dialog tutorial-dialog"
          aria-label="Hyperforest tutorial"
          aria-describedby="tutorial-body tutorial-action"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <button
            className="icon-button dialog-close"
            aria-label="Close tutorial"
            onClick={close}
          >
            <Icon name="close" />
          </button>
          <span className="eyebrow">A QUICK TOUR · ABOUT 2 MINUTES</span>
          <div className="tutorial-illustration" aria-hidden="true">
            <svg viewBox="0 0 320 110" fill="none">
              <path d="M160 22 68 85M160 22 252 85" />
              <circle cx="160" cy="22" r="15" />
              <circle cx="68" cy="85" r="15" />
              <circle cx="252" cy="85" r="15" />
            </svg>
            <span>
              <Icon name={lesson.icon} size={22} />
            </span>
          </div>
          <div
            className="tutorial-lesson"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="eyebrow">
              Step {step + 1} of {lessons.length}
            </span>
            <h2 ref={heading} tabIndex={-1}>
              {lesson.title}
            </h2>
            <p id="tutorial-body">{lesson.body}</p>
            <p id="tutorial-action" className="tutorial-tip">
              {lesson.action}
            </p>
          </div>
          <nav className="tutorial-progress" aria-label="Tutorial steps">
            {lessons.map((item, index) => (
              <button
                key={item.title}
                aria-label={`Step ${index + 1}: ${item.title}`}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
              >
                <span />
              </button>
            ))}
          </nav>
          <div className="tutorial-actions">
            <button className="quiet-button" onClick={close}>
              Skip tutorial
            </button>
            <div>
              {step > 0 && (
                <button
                  className="quiet-button"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </button>
              )}
              <button
                className="primary-button"
                onClick={() =>
                  step === lessons.length - 1 ? close() : setStep(step + 1)
                }
              >
                {step === lessons.length - 1 ? "Get started" : "Next"}
                <Icon
                  name={step === lessons.length - 1 ? "check" : "arrow"}
                  size={16}
                />
              </button>
            </div>
          </div>
        </dialog>
      )}
    </TutorialContext.Provider>
  );
}

export function TutorialButton() {
  const open = useContext(TutorialContext);
  return (
    <button className="quiet-button" onClick={open}>
      <Icon name="notes" size={15} /> Tutorial
    </button>
  );
}
