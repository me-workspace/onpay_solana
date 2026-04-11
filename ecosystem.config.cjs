/**
 * PM2 ecosystem file.
 *
 * `pm2 start ecosystem.config.cjs` from the repo root brings up the
 * OnPay server as a supervised process. PM2 handles crash restarts,
 * log rotation (with pm2-logrotate), and graceful reloads.
 *
 * The Next.js standalone build lives at `.next/standalone/server.js`
 * after `npm run build`. We point PM2 at that file directly.
 */
/** @type {import("pm2").StartOptions} */
module.exports = {
  apps: [
    {
      name: "onpay",
      script: "./.next/standalone/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      // Load the production env. PM2 reads this file at start/reload time.
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
      },
      // Source the rest of the env from .env.production via PM2's env file loader
      // — or rely on the deploy script to `export` it before `pm2 reload`.
      // The ecosystem file can't itself read .env.production, so the deploy
      // script sources it first. See deploy/deploy.sh.
      max_memory_restart: "600M",
      merge_logs: true,
      time: true,
      kill_timeout: 10_000,
      listen_timeout: 15_000,
    },
  ],
};
