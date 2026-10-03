-- Metadata only: mailbox content and Gmail access tokens never enter these tables.
CREATE TABLE IF NOT EXISTS protocol_connections (
  employee_id INT PRIMARY KEY REFERENCES employees(employee_id) ON DELETE CASCADE,
  company_id INT NOT NULL REFERENCES companies(company_id),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS protocol_risk_alerts (
  alert_id BIGSERIAL PRIMARY KEY,
  event_key VARCHAR(64) NOT NULL UNIQUE,
  company_id INT NOT NULL REFERENCES companies(company_id),
  employee_id INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('suspicious','high-risk')),
  detected_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by INT REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS protocol_alerts_company_time ON protocol_risk_alerts(company_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS protocol_alerts_company_open ON protocol_risk_alerts(company_id) WHERE acknowledged_at IS NULL;
