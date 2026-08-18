import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { findLocalUrl } from "../lib/localUrl";
import {
  termError,
  termRun,
  termStatus,
  termStop,
  type TermChunk,
  type TermGrant,
  type TermStatus,
} from "../lib/term";

const LOG_CAP = 480_000;

function trimLog(text: string): string {
  if (text.length <= LOG_CAP) return text;
  return `…\n${text.slice(text.length - LOG_CAP + 20)}`;
}

function echoLine(log: string, command: string): string {
  const prefix = log && !log.endsWith("\n") ? "\n" : "";
  return `${log}${prefix}› ${command}\n`;
}

export function useTerm() {
  const [log, setLog] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const idRef = useRef(0);
  const ignoreId = useRef(0);
  const pending = useRef("");
  const runLog = useRef("");
  const raf = useRef(0);

  const dropQueued = useCallback(() => {
    pending.current = "";
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
  }, []);

  const flush = useCallback(() => {
    raf.current = 0;
    const chunk = pending.current;
    pending.current = "";
    if (chunk) setLog((current) => trimLog(current + chunk));
  }, []);

  const queue = useCallback(
    (text: string) => {
      if (!text) return;
      pending.current += text;
      if (raf.current) return;
      raf.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(() => {
    let alive = true;
    void termStatus()
      .then((status) => {
        if (!alive || !status.running) return;
        idRef.current = status.id;
        setRunning(true);
        setLog((current) => current || "C’è un comando in corso.\n");
      })
      .catch(() => {
        /* il pannello resta fermo */
      });

    const unlistenChunk = listen<TermChunk>("term-chunk", (event) => {
      const { id, text } = event.payload;
      if (!text) return;
      if (id === ignoreId.current) return;
      idRef.current = id;
      runLog.current += text;
      const local = findLocalUrl(runLog.current);
      if (local) setPreviewUrl(local);
      queue(text);
    });
    const unlistenStatus = listen<TermStatus>("term-status", (event) => {
      const status = event.payload;
      if (status.id === ignoreId.current && !status.running) return;
      if (status.running) {
        ignoreId.current = 0;
        idRef.current = status.id;
        setRunning(true);
        setCommand(status.command);
        setError(null);
        return;
      }
      if (status.id !== idRef.current && idRef.current !== 0) return;
      flush();
      setRunning(false);
      setPreviewUrl(null);
      setCommand(status.command);
      if (status.message) {
        setLog((current) =>
          trimLog(`${current}${current && !current.endsWith("\n") ? "\n" : ""}${status.message}\n`),
        );
      }
    });

    return () => {
      alive = false;
      dropQueued();
      void unlistenChunk.then((stop) => stop());
      void unlistenStatus.then((stop) => stop());
    };
  }, [dropQueued, flush, queue]);

  const run = useCallback(
    async (root: string, line: string, grant?: TermGrant | null) => {
      const command = line.trim();
      if (!command) {
        setError("Scrivi un comando.");
        return false;
      }
      ignoreId.current = idRef.current;
      dropQueued();
      runLog.current = "";
      setPreviewUrl(null);
      setBusy(true);
      setError(null);
      setLog((current) => echoLine(current, command));
      try {
        const status = await termRun(root, command, grant);
        idRef.current = status.id;
        ignoreId.current = 0;
        setRunning(true);
        setCommand(status.command);
        return true;
      } catch (err: unknown) {
        const message = termError(err, "Non riesco ad avviare il comando.");
        setError(message);
        setRunning(false);
        setLog((current) =>
          trimLog(`${current}${current && !current.endsWith("\n") ? "\n" : ""}${message}\n`),
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [dropQueued],
  );

  const stop = useCallback(async () => {
    try {
      setError(null);
      await termStop();
      setRunning(false);
      setPreviewUrl(null);
    } catch (err: unknown) {
      const message = termError(err, "Non fermo il comando.");
      setError(message);
    }
  }, []);

  return { log, running, busy, error, command, previewUrl, run, stop };
}
