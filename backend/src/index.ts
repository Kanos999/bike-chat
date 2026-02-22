import { startApi } from './api';

startApi().catch((err) => {
  console.error(err);
  process.exit(1);
});
