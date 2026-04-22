"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  API_KEYS,
  ApiKeyId,
  deleteApiKey,
  maskKey,
  readApiKey,
  saveApiKey,
  validateApiKey,
} from "@/lib/clientApiKey";

interface KeyEditorProps {
  id: ApiKeyId;
}

export default function KeyEditor({ id }: KeyEditorProps) {
  const spec = API_KEYS[id];
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const existing = readApiKey(spec);
    setCurrent(existing);
    setIsEditing(!existing);
  }, [spec]);

  function clearStatus() {
    setError("");
    setWarning("");
    setSuccess("");
  }

  async function handleSave() {
    clearStatus();
    const formatError = spec.validate(draft);
    if (formatError) {
      setError(formatError);
      return;
    }

    setIsSaving(true);
    const result = await validateApiKey(spec, draft);
    setIsSaving(false);

    if (!result.ok) {
      setError(result.error ?? "Validation failed.");
      return;
    }

    const trimmed = draft.trim();
    saveApiKey(spec, trimmed);
    setCurrent(trimmed);
    setDraft("");
    setIsEditing(false);
    setSuccess("Key validated and saved.");
    if (result.warning) setWarning(result.warning);
    router.refresh();
  }

  function handleEdit() {
    clearStatus();
    setIsEditing(true);
    setDraft("");
  }

  function handleCancel() {
    clearStatus();
    setIsEditing(false);
    setDraft("");
  }

  function handleDelete() {
    clearStatus();
    deleteApiKey(spec);
    setCurrent(null);
    setDraft("");
    setIsEditing(true);
    setSuccess("Key deleted.");
    router.refresh();
  }

  const hasKey = Boolean(current);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-zinc-100">{spec.label}</h1>
        <Link href="/keys" className="text-sm text-violet-300 hover:text-violet-200">
          ← All keys
        </Link>
      </div>

      <p className="text-sm text-zinc-400">
        Stored only in this browser. Need one?{" "}
        <a
          href={spec.helpUrl}
          target="_blank"
          rel="noreferrer"
          className="text-violet-300 hover:text-violet-200"
        >
          Get a key here.
        </a>
      </p>

      {hasKey && !isEditing ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div>
            <p className="text-xs text-zinc-400">Current key</p>
            <p className="mt-1 font-mono text-sm text-zinc-100">{maskKey(current!)}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleEdit}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md border border-rose-800 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-900/30"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {isEditing ? (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError("");
            }}
            placeholder={spec.placeholder}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-blue-400 placeholder:text-zinc-500 focus:ring-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Validating..." : "Save"}
            </button>
            {hasKey ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {warning ? <p className="text-sm text-amber-300">{warning}</p> : null}
      {success ? <p className="text-sm text-emerald-400">{success}</p> : null}
    </div>
  );
}
