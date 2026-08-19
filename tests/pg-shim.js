export class Pool {
  constructor(config) {
    this.config = config;
  }
  async connect() {
    return {
      query: async () => ({ rows: [{ current_time: new Date(), db_name: 'witiquetas_test', version_info: 'PostgreSQL Test' }] }),
      release: () => {},
    };
  }
  async query(sql, params) {
    return { rows: [{ current_time: new Date(), db_name: 'witiquetas_test', version_info: 'PostgreSQL Test' }], rowCount: 1 };
  }
}

export default { Pool };
