// Set required environment variables before any module is imported.
// This file runs in the Jest worker process via setupFiles (before module registry).
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-chars-long';
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
