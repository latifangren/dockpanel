export interface Database {
  id: string;
  site_id: string | null;
  stack_id: string | null;
  name: string;
  engine: string;
  db_user: string;
  container_id: string | null;
  port: number | null;
  created_at: string;
}

export interface QueryResult {
  columns: string[];
  rows: string[][];
  row_count: number;
  execution_time_ms: number;
  truncated: boolean;
}

export const engineLabels: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
};

export function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
