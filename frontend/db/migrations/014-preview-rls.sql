-- Keep preview tables server-only. The Next.js BFF connects with the
-- database owner through DATABASE_URL; browser clients never receive that
-- connection string. Enabling RLS prevents an accidentally exposed
-- Supabase anon/key client from reading the source tables directly.
ALTER TABLE IF EXISTS universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS university_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS school_research_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS college_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS school_confirmed_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS region_envelope ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS status_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS source_index ENABLE ROW LEVEL SECURITY;

-- Deliberately no public policies: these tables are read through the BFF,
-- which applies the compact-summary/detail boundary and cache policy.
