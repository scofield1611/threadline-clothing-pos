import "dotenv/config";
import { assertRequiredEnv } from "./config/env.js";
import { createApp } from "./app.js";

assertRequiredEnv();

const port = process.env.PORT || 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`Clothing Store API listening on http://localhost:${port}`);
});
