export function startFakeSupabase(opts?: { port?: number; log?: boolean }): Promise<{
  port: number;
  url: string;
  tables: Map<string, Record<string, unknown>[]>;
  userId: string;
  close: () => Promise<void>;
}>;
