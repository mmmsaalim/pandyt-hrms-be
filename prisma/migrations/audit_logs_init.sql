-- Add audit_logs table for compliance tracking

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 0,
  action VARCHAR(255) NOT NULL,
  entity VARCHAR(255) NOT NULL,
  entity_id INT NOT NULL,
  tenant_id INT,
  old_value TEXT,
  new_value TEXT,
  ip_address VARCHAR(45),
  status_code INT DEFAULT 200,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for compliance queries
  INDEX idx_audit_tenant_date (tenant_id, created_at DESC),
  INDEX idx_audit_action (action),
  INDEX idx_audit_entity (entity, entity_id)
);

-- Grant permissions for audit log schema (for future RBAC)
-- GRANT SELECT ON audit_logs TO compliance_role;
