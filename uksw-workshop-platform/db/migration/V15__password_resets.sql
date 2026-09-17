-- V15: Add password reset request table for forgot password flow
CREATE TABLE password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    new_password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_password_resets_user ON password_resets(user_id);
CREATE INDEX idx_password_resets_status ON password_resets(status);

CREATE TRIGGER update_password_resets_updated_at BEFORE UPDATE ON password_resets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
