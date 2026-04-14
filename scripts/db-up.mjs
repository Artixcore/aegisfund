import { spawnSync } from "node:child_process";

function dockerComposeAvailable() {
  const r = spawnSync("docker", ["compose", "version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return r.status === 0;
}

function printNativeMysqlHelp() {
  console.log(`
[db:up] Docker was not found (install Docker Desktop if you want: npm run db:up:docker).

Run MySQL on this machine without Docker:

  1) Install MySQL 8 (or MariaDB 10.6+), start the service.
     Windows installer: https://dev.mysql.com/downloads/installer/

  2) Create database and user (adjust names/passwords to match .env):

     mysql -u root -p <<'SQL'
     CREATE DATABASE aegis_fund CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
     CREATE USER 'aegis'@'localhost' IDENTIFIED BY 'aegis_local';
     GRANT ALL PRIVILEGES ON aegis_fund.* TO 'aegis'@'localhost';
     FLUSH PRIVILEGES;
     SQL

     On Windows you can paste those statements in MySQL Workbench or "MySQL 8.0 Command Line Client".

  3) Set DATABASE_URL in .env, e.g.
     mysql://aegis:aegis_local@127.0.0.1:3306/aegis_fund
     If login fails, MySQL may require the same GRANT for 'aegis'@'127.0.0.1' (not only 'localhost').

  4) npm run db:migrate
`);
}

if (dockerComposeAvailable()) {
  const r = spawnSync("docker", ["compose", "up", "-d", "mysql"], {
    stdio: "inherit",
    windowsHide: true,
  });
  process.exit(r.status === null ? 1 : r.status);
}

printNativeMysqlHelp();
process.exit(1);
