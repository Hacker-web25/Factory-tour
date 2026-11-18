"use client";

import { useEffect, useRef, useState } from "react";

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
 */
const DRAFT_COMMIT_MS = 250;
export default function DraftField({
  value,
  onCommit,
  multiline,
  rows,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const timer = useRef<number | null>(null);
  const latest = useRef({ draft: value, committed: value, onCommit });
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
  };
  const common = {
    value: draft,
    placeholder,
    className,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit();
    },
  };
  return multiline ? (
    <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input
      {...common}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
