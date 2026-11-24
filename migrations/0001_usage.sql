CREATE TABLE IF NOT EXISTS monthly_usage (
  month TEXT PRIMARY KEY,
  chars INTEGER NOT NULL CHECK (chars >= 0)
);
CREATE TABLE IF NOT EXISTS admissions (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  client TEXT NOT NULL,
  admin INTEGER NOT NULL CHECK (admin IN (0, 1)),
  calls INTEGER NOT NULL CHECK (calls > 0),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  month TEXT NOT NULL,
  chars INTEGER NOT NULL CHECK (chars > 0)
);
CREATE INDEX IF NOT EXISTS admissions_ts ON admissions(ts);
CREATE INDEX IF NOT EXISTS admissions_client_ts ON admissions(client, ts) WHERE admin=0;
