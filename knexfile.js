module.exports = {
    development: {
      client: 'pg',
      connection: {
        host: 'localhost',
        user: 'postgres',
        password: 'nadia',
        database: 'GoodReadingBookstoreDB',
        port: 5432,
      },
      migrations: {
        tableName: 'knex_migrations',
      },
    },
  };
  