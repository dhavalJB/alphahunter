import dotenv from "dotenv";
import path from "path";

// Must run before any module reads process.env (config.ts, etc.)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
