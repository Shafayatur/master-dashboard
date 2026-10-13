import { describe, expect, it } from 'vitest';
import { assertReadOnlySql } from './guard';

describe('assertReadOnlySql', () => {
  it('allows plain selects, CTEs and a trailing semicolon', () => {
    expect(() => assertReadOnlySql('SELECT 1;')).not.toThrow();
    expect(() => assertReadOnlySql('WITH a AS (SELECT 1) SELECT * FROM a')).not.toThrow();
  });

  it('allows camelCase identifiers and reserved-looking names inside quotes', () => {
    expect(() =>
      assertReadOnlySql(
        `SELECT "createdAt", "updatedAt", "deletedAt" FROM "order" o JOIN "user" u ON u.id = o."userId" WHERE o.status = 'update'`,
      ),
    ).not.toThrow();
  });

  it('ignores keywords hidden in comments', () => {
    expect(() => assertReadOnlySql('SELECT 1 -- drop table x')).not.toThrow();
  });

  it('blocks writes and DDL', () => {
    for (const q of [
      'INSERT INTO t VALUES (1)',
      'UPDATE t SET a = 1',
      'DELETE FROM t',
      'DROP TABLE t',
      'TRUNCATE t',
      'SELECT * INTO copy FROM t',
      'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x',
    ]) {
      expect(() => assertReadOnlySql(q), q).toThrow();
    }
  });

  it('blocks stacked statements', () => {
    expect(() => assertReadOnlySql('SELECT 1; DROP TABLE t')).toThrow();
  });
});
