"""The only layer allowed to contain SQL.

Enforced two ways: the import-linter contract forbidding domain modules from
importing `psycopg` directly, and the SQL lint that fails when a query
appears outside this package.
"""
