"use client";

// Streams a chat turn from POST /chat and parses the SSE frames.
// We use fetch + ReadableStream (not EventSource) because the request is a POST
// with a JSON body, which EventSource cannot send.
import { useCallback, useRef, useState } from "react";

import { BACKEND_URL, getAuthHeaders } from "@/lib/api";

interface UseAgentStreamOptions {
  onToken?: (text: string) => void;
  onToolStart?: (tool: { id: string; name: string; input?: unknown }) => void;
  onToolEnd?: (tool: { id: string; name: string; output: string }) => void;
  onComplete?: (content: string) => void;
  onError?: (err: { error: string; detail: string }) => void;
}

export function useAgentStream(options: UseAgentStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  // Keep the latest callbacks without making `send` change identity each render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (message: string, sessionId: string) => {
      cancel();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsStreaming(true);

      try {
        const res = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ message, session_id: sessionId }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`POST /chat failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // SSE frames are separated by a blank line ("\n\n").
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // Strip carriage returns: sse-starlette uses CRLF line endings, so
          // frames are separated by "\r\n\r\n". Normalising to "\n" lets us
          // split on "\n\n" below.
          buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            handleFrame(frame, optionsRef.current);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          optionsRef.current.onError?.({
            error: "stream_error",
            detail: (err as Error).message,
          });
        }
      } finally {
        setIsStreaming(false);
        controllerRef.current = null;
      }
    },
    [cancel],
  );

  return { send, cancel, isStreaming };
}

// Parse one SSE frame ("event: <name>\ndata: <json>") and dispatch to callbacks.
function handleFrame(frame: string, options: UseAgentStreamOptions) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
  } catch {
    return;
  }

  switch (event) {
    case "token":
      options.onToken?.(String(payload.text ?? ""));
      break;
    case "tool_start":
      options.onToolStart?.({
        id: String(payload.id ?? ""),
        name: String(payload.name ?? ""),
        input: payload.input,
      });
      break;
    case "tool_end":
      options.onToolEnd?.({
        id: String(payload.id ?? ""),
        name: String(payload.name ?? ""),
        output: String(payload.output ?? ""),
      });
      break;
    case "done":
      options.onComplete?.(String(payload.content ?? ""));
      break;
    case "error":
      options.onError?.({
        error: String(payload.error ?? "error"),
        detail: String(payload.detail ?? ""),
      });
      break;
  }
}
