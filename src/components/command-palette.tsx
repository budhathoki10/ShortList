"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { logout } from "@/app/actions/auth";
import { NAV, OPEN_PALETTE } from "./app-nav";
import { icons } from "./icons";

export type PaletteJob = { id: string; title: string; company: string; status: string };

type Item = {
  id: string;
  group: "Recent" | "Go to" | "Actions" | "Jobs";
  label: string;
  hint?: string;
  /** Extra words that should find this item. */
  keywords?: string;
  run: () => void;
};

const RECENT_KEY = "shortlist:recent";

/** Subsequence match, best when the query appears whole and early. Returns -1 for no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at * 2 - (t.length - q.length) * 0.1;
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (const ch of q) {
    const found = t.indexOf(ch, last + 1);
    if (found < 0) return -1;
    if (last >= 0) gaps += found - last - 1;
    last = found;
    i++;
  }
  return i === q.length ? 500 - gaps : -1;
}

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** Search and navigation palette opened from the app navigation. */
export function KeyboardLayer({ jobs }: { jobs: PaletteJob[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const paletteRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  const closePalette = useCallback(() => paletteRef.current?.close(), []);
  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setRecent(readRecent());
    if (!paletteRef.current?.open) paletteRef.current?.showModal();
  }, []);

  const go = useCallback((href: string) => startTransition(() => router.push(href)), [router]);
  const addJob = useCallback(() => {
    const field = document.getElementById("job-url");
    if (field) field.focus();
    else go("/app/jobs");
  }, [go]);

  const items = useMemo<Item[]>(() => {
    const remember = (id: string) => {
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 5)));
      } catch {
        // Storage can be unavailable (private mode); recents are a nicety.
      }
    };
    const jobItems: Item[] = jobs.slice(0, 200).map((j) => ({
      id: `job:${j.id}`,
      group: "Jobs",
      label: j.title || "Untitled job",
      hint: j.company || undefined,
      keywords: j.status,
      run: () => {
        remember(`job:${j.id}`);
        go(`/app/jobs/${j.id}`);
      },
    }));
    return [
      ...NAV.map<Item>((n) => ({ id: `nav:${n.href}`, group: "Go to", label: n.label, run: () => go(n.href) })),
      { id: "nav:billing", group: "Go to", label: "Plan and billing", keywords: "billing plan pay upgrade subscription cancel invoice", run: () => go("/app/billing") },
      { id: "act:add", group: "Actions", label: "Add a job", keywords: "new create paste link", run: addJob },
      { id: "act:export", group: "Actions", label: "Download my data", keywords: "export json", run: () => downloadFile("/app/settings/export") },
      { id: "act:logout", group: "Actions", label: "Log out", run: () => startTransition(() => void logout()) },
      ...jobItems,
    ];
  }, [jobs, go, addJob]);

  const results = useMemo(() => {
    if (!query.trim()) {
      const byId = new Map(items.map((i) => [i.id, i]));
      const recents = recent.flatMap((id) => (byId.get(id) ? [{ ...byId.get(id)!, group: "Recent" as const }] : []));
      const rest = items.filter((i) => i.group !== "Jobs").concat(items.filter((i) => i.group === "Jobs").slice(0, 5));
      return [...recents, ...rest];
    }
    return items
      .map((i) => ({ i, s: Math.max(fuzzyScore(query, i.label), fuzzyScore(query, `${i.label} ${i.hint ?? ""} ${i.keywords ?? ""}`) - 100) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i)
      .slice(0, 30);
  }, [items, query, recent]);

  const groups = useMemo(() => {
    const order: Item["group"][] = ["Recent", "Go to", "Actions", "Jobs"];
    return order.map((g) => ({ g, rows: results.filter((r) => r.group === g) })).filter((x) => x.rows.length);
  }, [results]);
  const flat = groups.flatMap((x) => x.rows);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    closePalette();
    item.run();
  };

  useEffect(() => {
    const onPalette = () => openPalette();
    window.addEventListener(OPEN_PALETTE, onPalette);
    return () => {
      window.removeEventListener(OPEN_PALETTE, onPalette);
    };
  }, [openPalette]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(flat[active]);
    }
  };

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  let index = -1;
  return (
    <>
      <dialog
        ref={paletteRef}
        aria-label="Command palette"
        className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-xl shadow-2xl shadow-black/15"
        onClick={(e) => e.target === paletteRef.current && closePalette()}
        onToggle={(e) => (e.currentTarget as HTMLDialogElement).open && inputRef.current?.focus()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5">
          <icons.search className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat.length ? `${listId}-${active}` : undefined}
            aria-label="Search pages, actions and jobs"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Search pages, actions, jobs…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint max-sm:text-base"
          />
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5">
          {flat.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Nothing matches “{query}”. Try a job title, or a page like “progress”.
            </p>
          )}
          {groups.map(({ g, rows }) => (
            <div key={g} role="group" aria-label={g}>
              <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-faint">{g}</p>
              {rows.map((item) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={`${g}-${item.id}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(item)}
                    className={`flex h-10 cursor-pointer items-center gap-3 rounded px-2.5 text-sm ${i === active ? "bg-surface-hover" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                      {item.hint && <span className="ml-2 text-muted">{item.hint}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </dialog>
    </>
  );
}

/** A file download is a route handler, not a page, so it goes through a plain link rather than the router. */
function downloadFile(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.click();
}
