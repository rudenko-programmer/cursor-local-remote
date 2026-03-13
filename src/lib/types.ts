export type StreamEventType = "system" | "user" | "assistant" | "tool_call" | "result";

export interface SystemInitEvent {
  type: "system";
  subtype: "init";
  apiKeySource: string;
  cwd: string;
  session_id: string;
  model: string;
  permissionMode: string;
}

export interface UserMessageEvent {
  type: "user";
  message: {
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  };
  session_id: string;
}

export interface AssistantMessageEvent {
  type: "assistant";
  message: {
    role: "assistant";
    content: Array<{ type: "text"; text: string }>;
  };
  session_id: string;
}

export interface ReadToolCall {
  readToolCall: {
    args: { path: string };
    result?: {
      success?: {
        content: string;
        isEmpty: boolean;
        exceededLimit: boolean;
        totalLines: number;
        totalChars: number;
      };
    };
  };
}

export interface WriteToolCall {
  writeToolCall: {
    args: { path: string; fileText?: string; toolCallId?: string };
    result?: {
      success?: {
        path: string;
        linesCreated: number;
        fileSize: number;
      };
    };
  };
}

export interface GenericToolCall {
  function: {
    name: string;
    arguments: string;
  };
  result?: unknown;
}

export type ToolCallPayload = ReadToolCall | WriteToolCall | GenericToolCall;

export interface ToolCallStartedEvent {
  type: "tool_call";
  subtype: "started";
  call_id: string;
  tool_call: ToolCallPayload;
  session_id: string;
}

export interface ToolCallCompletedEvent {
  type: "tool_call";
  subtype: "completed";
  call_id: string;
  tool_call: ToolCallPayload;
  session_id: string;
}

export type ToolCallEvent = ToolCallStartedEvent | ToolCallCompletedEvent;

export interface ResultEvent {
  type: "result";
  subtype: "success" | "error";
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  result: string;
  session_id: string;
  request_id?: string;
}

export type StreamEvent =
  | SystemInitEvent
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolCallEvent
  | ResultEvent;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ToolCallInfo {
  id: string;
  callId: string;
  type: "read" | "write" | "shell" | "other";
  name: string;
  path?: string;
  args?: string;
  status: "running" | "completed" | "error";
  result?: string;
  timestamp: number;
}

export interface SessionInfo {
  id: string;
  title: string;
  date: string;
}

export interface ChatRequest {
  prompt: string;
  sessionId?: string;
  workspace?: string;
  model?: string;
}

export interface NetworkInfo {
  lanIp: string;
  port: number;
  url: string;
  workspace: string;
}
