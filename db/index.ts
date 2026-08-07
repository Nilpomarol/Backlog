import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DatabaseEnvironment = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
};

export function getClient(environment: DatabaseEnvironment) {
  if (!environment.TURSO_DATABASE_URL || !environment.TURSO_AUTH_TOKEN) {
    throw new Error("Turso is not configured for this environment.");
  }

  return createClient({
    url: environment.TURSO_DATABASE_URL,
    authToken: environment.TURSO_AUTH_TOKEN,
  });
}

export function getDb(environment: DatabaseEnvironment) {
  return drizzle(getClient(environment), { schema });
}

export type Database = ReturnType<typeof getDb>;
