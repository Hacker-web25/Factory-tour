"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A text box that keeps its keystrokes to itself.
 *
 * Typing updates only this box; the change goes to the editor (scene strip,
 * save queue) a moment after typing stops, and at once on blur or Enter.
 * While the box has focus, a value arriving from outside (a colleague's
 * edit, a save echo) never replaces what is being typed; once it loses
 * focus it shows the latest value again. Before Nov 2026 every keystroke
 * re-rendered the whole editor and saved the whole scene, and a late save
 * echo could put old text back in the box mid-word.
 *
 * With `suggest`, a single-line box also finishes what is typed ("Lab" →
 * "Laboratory"): the best match is shown as faint text after the cursor and
 * Tab takes it; a short list below shows the others (Up and Down choose,
 * Enter takes the chosen one, Escape closes, a click takes one). Enter with
 * nothing chosen keeps exactly what was typed, as before.
 */
const DRAFT_COMMIT_MS = 250;
export default function DraftField({
  value,
  onCommit,
  multiline,
  rows,
  placeholder,
  className,
  suggest,
  onSuggestFocus,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Completions for what has been typed so far, best first; each is the whole new value. */
  suggest?: (typed: string) => string[];
  /** Called when the box gets focus, so the suggestions can load their data. */
  onSuggestFocus?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [items, setItems] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const focused = useRef(false);
  const timer = useRef<number | null>(null);
  const latest = useRef({ draft: value, committed: value, onCommit });
  const listId = useId();
  latest.current.onCommit = onCommit;
  useEffect(() => {
    latest.current.committed = value;
    if (!focused.current) {
      latest.current.draft = value;
      setDraft(value);
    }
  }, [value]);
  const commit = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const { draft: d, committed } = latest.current;
    if (d !== committed) {
      latest.current.committed = d;
      latest.current.onCommit(d);
    }
  };
  // Leaving the scene (or closing the panel) mid-word still saves the word.
  useEffect(() => () => commit(), []);
  const onChange = (v: string) => {
    latest.current.draft = v;
    setDraft(v);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, DRAFT_COMMIT_MS);
    if (suggest && !multiline) {
      setItems(suggest(v));
      setActive(-1);
    }
  };
  const take = (text: string) => {
    latest.current.draft = text;
    setDraft(text);
    setItems([]);
    setActive(-1);
    commit();
  };
  const close = () => {
    setItems([]);
    setActive(-1);
  };

  // The best match shows as faint text after the cursor when it extends what is typed.
  const top = active >= 0 ? items[active] : items[0];
  const ghostRest =
    focused.current && top && draft && top.length > draft.length && top.toLowerCase().startsWith(draft.toLowerCase())
      ? top.slice(draft.length)
      : "";

  const common = {
    value: draft,
    placeholder,
    className,
    onFocus: () => {
      focused.current = true;
      onSuggestFocus?.();
    },
    onBlur: () => {
      focused.current = false;
      close();
      commit();
    },
  };
  if (multiline) return <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />;

  const input = (
    <input
      {...common}
      onChange={(e) => onChange(e.target.value)}
      {...(suggest
        ? {
            role: "combobox",
            "aria-expanded": items.length > 0,
            "aria-controls": listId,
            "aria-autocomplete": "list" as const,
            "aria-activedescendant": active >= 0 ? `${listId}-${active}` : undefined,
            autoComplete: "off",
            spellCheck: false,
          }
        : {})}
      onKeyDown={(e) => {
        const el = e.target as HTMLInputElement;
        if (suggest && items.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
          }
          if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            take(items[active]);
            return;
          }
          // Tab (or the right arrow at the end) takes the faint text; with none showing, Tab moves on as usual.
          if ((e.key === "Tab" && !e.shiftKey && top && (ghostRest || active >= 0)) || (e.key === "ArrowRight" && ghostRest && el.selectionStart === draft.length)) {
            e.preventDefault();
            take(top);
            return;
          }
        }
        if (e.key === "Enter") el.blur();
      }}
    />
  );
  if (!suggest) return input;

  // Where the typed text ends and the match goes on, so it can be bold.
  const lead = (s: string) => (s.toLowerCase().startsWith(draft.toLowerCase()) ? draft.length : 0);
  return (
    <div className="relative">
      {input}
      {ghostRest && (
        <div
          aria-hidden
          className={`${className ?? ""} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre !bg-transparent !border-transparent`}
        >
          <span className="invisible">{draft}</span>
          <span className="opacity-40">{ghostRest}</span>
        </div>
      )}
      {items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded border border-borderStrong bg-panel py-1 shadow-panel"
        >
          {items.map((s, i) => {
            const n = lead(s);
            return (
              <li
                key={s}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Taking it on mouse-down keeps the box focused, so the list never closes before the click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  take(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer truncate px-2 py-1 text-sm ${i === active ? "bg-panelHover text-white" : "text-white/80"}`}
              >
                <span className="font-semibold">{s.slice(0, n)}</span>
                <span className={n ? "opacity-70" : ""}>{s.slice(n)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
