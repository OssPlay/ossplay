import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: ReturnType<typeof postgres> | undefined;
let db: Db | undefined;

export function getDb(): Db {
	if (!db) {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) {
			throw new Error("DATABASE_URL is not set");
		}
		client = postgres(connectionString);
		db = drizzle(client, { schema });
	}
	return db;
}

export type Database = Db;
