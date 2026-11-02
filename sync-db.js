// sync-db.js - Standalone Database Diagnostics & Schema Synchronizer for cPanel
require('dotenv').config();
const { Client } = require('pg');

async function run() {
  console.log('====================================================');
  console.log('🔍 Medaf Supply Chain - Database Synchronizer & Test');
  console.log('====================================================\n');

  const isLocal = process.env.LOCAL === 'true';
  const databaseUrl = process.env.DATABASE_URL;
  let host = process.env.DB_HOST || '127.0.0.1';
  if (host === 'localhost') host = '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USERNAME || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'medaf_supply_chain';
  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

  console.log(`📍 Configuration:`);
  console.log(`   Host:     ${host}:${port}`);
  console.log(`   Database: ${database}`);
  console.log(`   User:     ${user}`);
  console.log(`   SSL:      ${ssl ? 'Enabled' : 'Disabled'}`);
  console.log(`   Sync:     ${process.env.DB_SYNCHRONIZE || 'true'}\n`);

  const clientConfig = (!isLocal && databaseUrl)
    ? { connectionString: databaseUrl, ssl }
    : { host, port, user, password, database, ssl };

  const client = new Client(clientConfig);

  try {
    console.log('⏳ Connecting to PostgreSQL database...');
    await client.connect();
    console.log('✅ Connection to PostgreSQL established successfully!\n');

    const verRes = await client.query('SELECT version();');
    console.log(`ℹ️ PostgreSQL Version: ${verRes.rows[0].version}\n`);
  } catch (err) {
    console.error('❌ Database connection failed!');
    console.error('   Error Code:   ', err.code);
    console.error('   Error Message:', err.message);
    if (err.code === '28P01') {
      console.error('\n👉 HINT: Password authentication failed. Check DB_PASSWORD in .env');
    } else if (err.code === '3D000') {
      console.error(`\n👉 HINT: Database "${database}" does not exist. Check DB_NAME in cPanel.`);
    } else if (err.code === 'ECONNREFUSED') {
      console.error('\n👉 HINT: PostgreSQL is not listening on that host/port. Try DB_HOST=127.0.0.1');
    }
    process.exit(1);
  }

  await client.end();

  console.log('⏳ Booting NestJS Application to synchronize TypeORM schema and seed data...');
  try {
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./dist/app.module.js');

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn'],
    });

    console.log('\n✅ NestJS & TypeORM initialized successfully!');

    // Reconnect to verify tables
    const verifyClient = new Client(clientConfig);
    await verifyClient.connect();

    const tablesRes = await verifyClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\n====================================================');
    console.log('🎉 Database Tables in schema "public":');
    console.log('====================================================');
    if (tablesRes.rows.length === 0) {
      console.log('⚠️ No tables found. Make sure DB_SYNCHRONIZE=true in .env');
    } else {
      for (const row of tablesRes.rows) {
        const countRes = await verifyClient.query(`SELECT COUNT(*) FROM "${row.table_name}";`);
        console.log(`   ✔️  ${row.table_name.padEnd(20)} (${countRes.rows[0].count} rows)`);
      }
    }
    console.log('====================================================\n');

    await verifyClient.end();
    await app.close();
    console.log('✨ All done! Database is ready.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ NestJS initialization failed:', err);
    process.exit(1);
  }
}

run();
