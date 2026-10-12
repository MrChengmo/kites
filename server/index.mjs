import { alphaConnection } from './alpha.mjs';
import { createKites } from './app.mjs';
const app = createKites({
  host: process.env.KITES_HOST,
  runtimeURL: process.env.AGENTWAY_URL,
  ...alphaConnection(),
  runtimeToken: process.env.AGENTWAY_TOKEN,
  accessToken: process.env.KITES_ACCESS_TOKEN,
  database: process.env.KITES_DATABASE,
  origins: (process.env.KITES_ORIGINS || 'http://127.0.0.1:5174').split(',').filter(Boolean),
});
await app.listen(Number(process.env.PORT || 4317));
console.log(
  `Kites is ready at http://${process.env.KITES_HOST || '127.0.0.1'}:${process.env.PORT || 4317}`,
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
