import { app } from './app';
import { env } from './config/env';
import { recoverStalePendingMaterials } from './services/recoveryService';

app.listen(env.PORT, async () => {
  console.log(
    `🚀  Server listening on http://localhost:${env.PORT}  [${env.NODE_ENV}]`
  );
  // Startup recovery: mark stale PENDING materials (>10 mins) as FAILED
  await recoverStalePendingMaterials();
});
