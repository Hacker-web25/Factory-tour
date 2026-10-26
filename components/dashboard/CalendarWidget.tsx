"use client";

/**
 * Calendar widget — compact list of upcoming meetings/plans + a
 * "+ New" button that opens a small modal to create one. Used on
 * both the org_admin and sales-team dashboards; the props decide
 * whether to show the "assign to teammate" field.
 */

import { useEffect, useState } from "react";
import {
  Calendar,
  Plus,
  X,
  Check,
  Trash2,
  MapPin,
  Clock,
} from "lucide-react";
import {
  loadCalendarEvents,
  createCalendarEvent,
  updateEventStatus,
  deleteCalendarEvent,
  type CalendarEvent,
} from "@/lib/calendarEvents";
import type { TeamMember } from "@/lib/salesAnalytics";

type Props = {
  orgId: string;
  currentUserId: string;
  /** When present, event creator can assign to any of these teammates.
   *  Omit or pass empty for presenters — they only see their own. */
  teammates?: TeamMember[];
  /** When true, only show events assigned to me (presenter mode). */
  myEventsOnly?: boolean;
};

export default function CalendarWidget({
  orgId,
  currentUserId,
  teammates,
  myEventsOnly = false,
}: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function reload() {
    setLoading(true);
    const rows = await loadCalendarEvents(orgId, {
      assigneeId: myEventsOnly ? currentUserId : undefined,
    });
    setEvents(rows);
    setLoading(false);
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, currentUserId, myEventsOnly]);

  return (
    <div className="bg-white border border-vpv-line rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(11,61,145,0.04),0_10px_30px_-18px_rgba(11,61,145,0.18)]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-vpv-line">
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-vpv-cyan" />
          <div className="text-[11px] uppercase tracking-wider text-vpv-muted font-semibold">
            Schedule
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="text-[11px] flex items-center gap-1 text-vpv-blue hover:text-vpv-navy font-medium"
        >
          <Plus size={11} /> New
        </button>
      </div>

      <div className="max-h-[320px] overflow-y-auto panel-scroll">
        {loading ? (
          <div className="text-[12px] text-vpv-muted py-8 text-center">
            Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Calendar size={22} className="mx-auto text-vpv-blue/30 mb-2" />
            <div className="text-[12.5px] text-vpv-ink mb-1">
              No upcoming meetings
            </div>
            <div className="text-[11px] text-vpv-muted mb-3">
              Plan your next client visit or demo.
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11.5px] px-3 py-1.5 rounded-full bg-vpv-grad text-white font-medium"
            >
              <Plus size={11} /> Add first
            </button>
          </div>
        ) : (
          events.map((ev) => (
            <EventRow
              key={ev.id}
              event={ev}
              teammates={teammates}
              onDone={async (id) => {
                await updateEventStatus(id, "done");
                reload();
              }}
              onDelete={async (id) => {
                if (!confirm("Delete this meeting?")) return;
                await deleteCalendarEvent(id);
                reload();
              }}
            />
          ))
        )}
      </div>

      {modalOpen && (
        <NewEventModal
          orgId={orgId}
          currentUserId={currentUserId}
          teammates={teammates}
          onCreated={() => {
            setModalOpen(false);
            reload();
          }}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function EventRow({
  event,
  teammates,
  onDone,
  onDelete,
}: {
  event: CalendarEvent;
  teammates?: TeamMember[];
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const start = new Date(event.starts_at);
  const isToday = sameDay(start, new Date());
  const isPast = +start < Date.now();
  const relative = formatWhen(start);
  const assignee =
    teammates?.find((t) => t.id === event.assignee_user_id) ?? null;
  const done = event.status === "done";
  return (
    <div
      className={`px-5 py-3 border-b border-vpv-line last:border-0 group hover:bg-vpv-tint/40 ${
        done ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`text-center min-w-[42px] shrink-0 rounded-md py-1 px-1.5 ${
            isToday
              ? "bg-vpv-cyan/15 text-vpv-navy"
              : isPast
                ? "bg-vpv-canvas text-vpv-muted"
                : "bg-vpv-tint text-vpv-navy"
          }`}
        >
          <div className="text-[10px] uppercase tracking-wider leading-none">
            {start.toLocaleDateString("en-US", { month: "short" })}
          </div>
          <div className="text-[16px] font-semibold leading-none mt-1">
            {start.getDate()}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`text-[13px] font-medium truncate ${
              done ? "line-through text-vpv-muted" : "text-vpv-ink"
            }`}
          >
            {event.title}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-vpv-muted">
            <span className="inline-flex items-center gap-0.5">
              <Clock size={9} /> {relative}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin size={9} /> {event.location}
              </span>
            )}
            {assignee && (
              <span className="text-vpv-muted">
                · {assignee.full_name ?? assignee.email.split("@")[0]}
              </span>
            )}
          </div>
          {event.notes && (
            <div className="text-[11px] text-vpv-muted mt-1 line-clamp-2">
              {event.notes}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!done && (
            <button
              onClick={() => onDone(event.id)}
              title="Mark as done"
              className="text-vpv-muted hover:text-emerald-500 p-1"
            >
              <Check size={12} />
            </button>
          )}
          <button
            onClick={() => onDelete(event.id)}
            title="Delete"
            className="text-vpv-muted hover:text-rose-500 p-1"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function NewEventModal({
  orgId,
  currentUserId,
  teammates,
  onCreated,
  onCancel,
}: {
  orgId: string;
  currentUserId: string;
  teammates?: TeamMember[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [time, setTime] = useState("10:00");
  const [assigneeId, setAssigneeId] = useState<string>(currentUserId);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setBusy(true);
    const starts_at = new Date(`${date}T${time}`).toISOString();
    const res = await createCalendarEvent({
      org_id: orgId,
      owner_user_id: currentUserId,
      assignee_user_id: assigneeId,
      title: title.trim(),
      notes: notes.trim() || undefined,
      location: location.trim() || undefined,
      starts_at,
    });
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    onCreated();
  }

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-vpv-navy/30 backdrop-blur-sm grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-vpv-line rounded-2xl w-[460px] max-w-full shadow-[0_30px_80px_-20px_rgba(11,61,145,0.4)]"
      >
        <div className="px-5 py-3 border-b border-vpv-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-vpv-cyan" />
            <h3 className="text-[14px] font-semibold text-vpv-ink">New meeting</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-vpv-muted hover:text-vpv-ink text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted mb-1">
              Title
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Client demo · Acme Corp"
              autoFocus
              className="w-full bg-vpv-canvas border border-vpv-line rounded-lg px-3 py-2 text-[13px] text-vpv-ink outline-none focus:border-vpv-blue"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted mb-1">
                Date
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-vpv-canvas border border-vpv-line rounded-lg px-3 py-2 text-[13px] text-vpv-ink outline-none focus:border-vpv-blue"
              />
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted mb-1">
                Time
              </div>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-vpv-canvas border border-vpv-line rounded-lg px-3 py-2 text-[13px] text-vpv-ink outline-none focus:border-vpv-blue"
              />
            </div>
          </div>
          {teammates && teammates.length > 0 && (
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted mb-1">
                Assign to
              </div>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full bg-vpv-canvas border border-vpv-line rounded-lg px-3 py-2 text-[13px] text-vpv-ink outline-none focus:border-vpv-blue"
              >
                <option value={currentUserId}>Me</option>
                {teammates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name ?? t.email.split("@")[0]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted mb-1">
              Location (optional)
            </div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Factory floor · Zoom · Client's office"
              className="w-full bg-vpv-canvas border border-vpv-line rounded-lg px-3 py-2 text-[13px] text-vpv-ink outline-none focus:border-vpv-blue"
            />
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted mb-1">
              Notes (optional)
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Buyer contact, quote details, key questions to ask…"
              className="w-full bg-vpv-canvas border border-vpv-line rounded-lg px-3 py-2 text-[13px] text-vpv-ink outline-none focus:border-vpv-blue resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-vpv-line flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-[12px] text-vpv-muted hover:text-vpv-ink px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy || !title.trim()}
            className="bg-vpv-grad hover:opacity-90 text-white text-[12px] font-semibold px-4 py-1.5 rounded-full disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------ helpers ------------------------ */

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatWhen(d: Date): string {
  const now = new Date();
  const diffMs = +d - +now;
  const day = 24 * 3600 * 1000;
  if (sameDay(d, now))
    return `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const tomorrow = new Date(+now + day);
  if (sameDay(d, tomorrow))
    return `Tomorrow, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (diffMs < 0)
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · past`;
  if (diffMs < 7 * day)
    return d.toLocaleDateString([], {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
